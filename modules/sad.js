const {
  MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder,
} = require('discord.js');
const db = require('../database/db.js');
const config = require('../config.js');
const karty = require('../utils/karty.js');
const { jestStaff } = require('../utils/uprawnienia.js');
const { log, wyslij } = require('../utils/logger.js');
const { transkrypt } = require('../utils/transkrypt.js');
const kolory = require('../utils/kolory.js');

const q = {
  poId: db.prepare('SELECT * FROM sprawy WHERE id = ?'),
  aktywnaSedziego: db.prepare("SELECT * FROM sprawy WHERE sedzia_id = ? AND status IN ('przyjeta','w_toku','odwolanie')"),
  przypisz: db.prepare("UPDATE sprawy SET sedzia_id = ?, status = 'w_toku' WHERE id = ?"),
  wydajWyrok: db.prepare("UPDATE sprawy SET werdykt = ?, kara = ?, status = 'wyrok', wyrok_data = ? WHERE id = ?"),
  odwolanie: db.prepare("UPDATE sprawy SET odwolanie = 1, status = 'odwolanie', poprzedni_sedzia = ?, sedzia_id = NULL WHERE id = ?"),
  zamknij: db.prepare("UPDATE sprawy SET status = 'zamknieta', zamknieta = ? WHERE id = ?"),
  wstawDowod: db.prepare('INSERT INTO sprawy_dowody (sprawa_id, user_id, tresc, data) VALUES (?, ?, ?, ?)'),
  dowody: db.prepare('SELECT * FROM sprawy_dowody WHERE sprawa_id = ? ORDER BY id'),
  panstwoPoNazwie: db.prepare('SELECT * FROM panstwa WHERE nazwa = ? COLLATE NOCASE'),
  panstwoLidera: db.prepare('SELECT * FROM panstwa WHERE lider_id = ?'),
  wstawWarn: db.prepare('INSERT INTO ostrzezenia (user_id, powod, wystawca_id, data, sprawa_id) VALUES (?, ?, ?, ?, ?)'),
  weryfikacjaPoNicku: db.prepare('SELECT * FROM weryfikacja WHERE nick = ? COLLATE NOCASE'),
  wstawList: db.prepare('INSERT INTO listy_goncze (nick, powod, nagroda, wystawca_id, wystawca_panstwo_id, status, wygasa, utworzony) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'),
};

async function aktualizujKarteSprawy(client, sprawaId) {
  const sprawa = q.poId.get(sprawaId);
  if (!sprawa?.kanal_id || !sprawa?.wiadomosc_id) return;
  const kanal = await client.channels.fetch(sprawa.kanal_id).catch(() => null);
  if (!kanal) return;
  const wiad = await kanal.messages.fetch(sprawa.wiadomosc_id).catch(() => null);
  if (!wiad) return;
  const dowody = q.dowody.all(sprawaId);
  await wiad.edit(karty.kartaSprawy({ sprawa, dowody })).catch(() => {});
}

function czyStronaSprawy(sprawa, userId) {
  if (sprawa.pozywajacy_id === userId) return true;
  // Pozwany gracz (po zweryfikowanym nicku)
  if (sprawa.pozwany_typ === 'nick') {
    const wer = q.weryfikacjaPoNicku.get(sprawa.pozwany_wartosc);
    if (wer?.user_id === userId) return true;
  }
  // Sprawdź czy user jest liderem państwa, którego dotyczy sprawa
  const lider = q.panstwoLidera.get(userId);
  if (!lider) return false;
  if (sprawa.pozwany_typ === 'panstwo' && lider.nazwa.toLowerCase() === sprawa.pozwany_wartosc.toLowerCase()) return true;
  return false;
}

async function onPrzyjmij(interaction) {
  if (!jestStaff(interaction.member)) {
    return interaction.reply({
      ...karty.kartaBlad('Brak uprawnień', 'Sprawy przyjmuje staff (kandydat na sędziego).'),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  }
  const [, , idStr] = interaction.customId.split(':');
  const id = parseInt(idStr, 10);
  const sprawa = q.poId.get(id);
  if (!sprawa || !['zlozona', 'odwolanie'].includes(sprawa.status)) {
    return interaction.reply({
      ...karty.kartaOstrzezenie('Nie do przyjęcia', 'Ta sprawa nie oczekuje już na sędziego.'),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  }

  // Zajęty innym postępowaniem?
  const aktywna = q.aktywnaSedziego.get(interaction.user.id);
  if (aktywna) {
    return interaction.reply({
      ...karty.kartaBlad('Zajęty', `Prowadzisz już sprawę **${aktywna.numer}**. Zakończ ją przed przyjęciem kolejnej.`),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  }

  // Strona sporu?
  if (czyStronaSprawy(sprawa, interaction.user.id)) {
    return interaction.reply({
      ...karty.kartaBlad('Konflikt interesów', 'Nie możesz orzekać w sprawie, w której jesteś stroną.'),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  }

  // Odwołanie — blokuj poprzedniego sędziego
  if (sprawa.status === 'odwolanie' && sprawa.poprzedni_sedzia === interaction.user.id) {
    return interaction.reply({
      ...karty.kartaBlad('Blokada odwoławcza', 'Prowadziłeś już pierwszą instancję tej sprawy.'),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  }

  // Nadaj rolę Sędzia
  if (config.role.sedzia) {
    const rola = interaction.guild.roles.cache.get(config.role.sedzia);
    if (rola) await interaction.member.roles.add(rola, `Sędzia sprawy ${sprawa.numer}`).catch(() => {});
  }

  // Dodaj do kanału
  const kanal = await interaction.client.channels.fetch(sprawa.kanal_id).catch(() => null);
  if (kanal) {
    await kanal.permissionOverwrites.edit(interaction.user.id, {
      ViewChannel: true, SendMessages: true, ReadMessageHistory: true,
    }).catch(() => {});
  }

  q.przypisz.run(interaction.user.id, id);
  await aktualizujKarteSprawy(interaction.client, id);

  await log(interaction.client, {
    tytul: 'Sędzia przyjął sprawę',
    opis: `**Sprawa:** ${sprawa.numer}\n**Sędzia:** <@${interaction.user.id}>\n**Rola nadana:** ${config.role.sedzia ? `<@&${config.role.sedzia}>` : 'brak konfiguracji'}`,
    kolor: kolory.info,
    kanal: 'logiSad',
  });

  await interaction.reply({
    ...karty.kartaSukces('Sprawa przyjęta', `Prowadzisz sprawę **${sprawa.numer}**.`),
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  });
}

async function onDowod(interaction) {
  const [, , idStr] = interaction.customId.split(':');
  const modal = new ModalBuilder().setCustomId(`sad:dowod-modal:${idStr}`).setTitle('Dodaj dowód do sprawy');
  modal.addComponents(new ActionRowBuilder().addComponents(
    new TextInputBuilder().setCustomId('tresc').setLabel('Treść dowodu (opis / linki)')
      .setStyle(TextInputStyle.Paragraph).setMinLength(5).setMaxLength(1500).setRequired(true)
  ));
  await interaction.showModal(modal);
}

async function onDowodModal(interaction) {
  const [, , idStr] = interaction.customId.split(':');
  const id = parseInt(idStr, 10);
  const sprawa = q.poId.get(id);
  if (!sprawa || !['zlozona', 'przyjeta', 'w_toku', 'odwolanie'].includes(sprawa.status)) {
    return interaction.reply({
      ...karty.kartaOstrzezenie('Sprawa zamknięta', 'Do tej sprawy nie można już dodawać dowodów.'),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  }
  const tresc = interaction.fields.getTextInputValue('tresc').trim();
  q.wstawDowod.run(id, interaction.user.id, tresc, Date.now());
  await aktualizujKarteSprawy(interaction.client, id);
  await interaction.reply({
    ...karty.kartaSukces('Dowód dodany', 'Wpis został dołączony do sprawy.'),
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  });
}

async function onWyrok(interaction) {
  const [, , idStr] = interaction.customId.split(':');
  const id = parseInt(idStr, 10);
  const sprawa = q.poId.get(id);
  if (!sprawa) return;
  if (sprawa.sedzia_id !== interaction.user.id) {
    return interaction.reply({
      ...karty.kartaBlad('Brak uprawnień', 'Wyrok może wydać tylko przypisany sędzia.'),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  }
  const modal = new ModalBuilder().setCustomId(`sad:wyrok-modal:${idStr}`).setTitle(`Wyrok — ${sprawa.numer}`);
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('werdykt').setLabel('Werdykt')
        .setStyle(TextInputStyle.Paragraph).setMinLength(5).setMaxLength(1500).setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('kara').setLabel('Kara')
        .setPlaceholder('np. ostrzeżenie, grzywna, ban, uniewinnienie')
        .setStyle(TextInputStyle.Short).setMaxLength(200).setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('list_gonczy').setLabel('Wystawić list gończy? tak/nie (opcjonalnie)')
        .setStyle(TextInputStyle.Short).setMaxLength(3).setRequired(false)
    ),
  );
  await interaction.showModal(modal);
}

async function onWyrokModal(interaction) {
  const [, , idStr] = interaction.customId.split(':');
  const id = parseInt(idStr, 10);
  const sprawa = q.poId.get(id);
  if (!sprawa || sprawa.sedzia_id !== interaction.user.id) return;

  const werdykt = interaction.fields.getTextInputValue('werdykt').trim();
  const kara = interaction.fields.getTextInputValue('kara').trim();
  const wystawList = (interaction.fields.getTextInputValue('list_gonczy') || '').trim().toLowerCase();

  q.wydajWyrok.run(werdykt, kara, Date.now(), id);

  // Zabierz rolę sędziego
  if (config.role.sedzia) {
    const rola = interaction.guild.roles.cache.get(config.role.sedzia);
    if (rola) await interaction.member.roles.remove(rola, `Wydał wyrok w ${sprawa.numer}`).catch(() => {});
  }

  // Ostrzeżenie w historii jeśli dotyczy nicka i osoba jest zweryfikowana
  if (sprawa.pozwany_typ === 'nick') {
    const wer = q.weryfikacjaPoNicku.get(sprawa.pozwany_wartosc);
    if (wer) {
      q.wstawWarn.run(wer.user_id, `Wyrok ${sprawa.numer}: ${kara}`, interaction.user.id, Date.now(), id);
    }
  }

  // Publikacja wyroku
  const spr = q.poId.get(id);
  await wyslij(interaction.client, config.kanaly.wyroki, karty.kartaWyroku({ sprawa: spr }));

  await log(interaction.client, {
    tytul: 'Wyrok wydany',
    opis: `**Sprawa:** ${spr.numer}\n**Sędzia:** <@${interaction.user.id}>\n**Kara:** ${kara}\n**Rola sędziego zabrana automatycznie.**`,
    kolor: kolory.sukces,
    kanal: 'logiSad',
  });

  // Automatyczny list gończy
  if (['tak', 'yes', 't', 'y'].includes(wystawList) && sprawa.pozwany_typ === 'nick') {
    const info = q.wstawList.run(
      sprawa.pozwany_wartosc,
      `Wyrok ${sprawa.numer}: ${werdykt}`.slice(0, 500),
      null,
      interaction.user.id,
      null,
      'aktywny',
      Date.now() + config.listyGoncze.domyslnaWaznoscDni * 24 * 60 * 60 * 1000,
      Date.now()
    );
    const { opublikujList } = require('./listy-goncze.js');
    const blad = await opublikujList(interaction.client, info.lastInsertRowid);
    if (blad) console.warn(`[sad] list gończy #${info.lastInsertRowid} nieopublikowany: ${blad}`);
  }

  await aktualizujKarteSprawy(interaction.client, id);

  await interaction.reply({
    ...karty.kartaSukces('Wyrok zapisany', 'Wyrok został opublikowany. Strony mają możliwość odwołania.'),
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  });
}

async function onOdwolanie(interaction) {
  const [, , idStr] = interaction.customId.split(':');
  const id = parseInt(idStr, 10);
  const sprawa = q.poId.get(id);
  if (!sprawa || sprawa.status !== 'wyrok' || sprawa.odwolanie) {
    return interaction.reply({
      ...karty.kartaBlad('Nie można odwołać', 'Odwołanie już wykorzystane lub sprawa jest w innym stanie.'),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  }
  if (!czyStronaSprawy(sprawa, interaction.user.id)) {
    return interaction.reply({
      ...karty.kartaBlad('Brak uprawnień', 'Odwołać się może tylko strona sprawy.'),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  }
  if (Date.now() - sprawa.wyrok_data > config.sad.odwolanieDostepneMs) {
    return interaction.reply({
      ...karty.kartaBlad('Termin minął', 'Czas na odwołanie już upłynął.'),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  }
  q.odwolanie.run(sprawa.sedzia_id, id);
  await aktualizujKarteSprawy(interaction.client, id);
  await log(interaction.client, {
    tytul: 'Odwołanie od wyroku',
    opis: `**Sprawa:** ${sprawa.numer}\n**Wnoszący:** <@${interaction.user.id}>\n**Poprzedni sędzia zablokowany:** <@${sprawa.sedzia_id}>`,
    kolor: kolory.ostrzezenie,
    kanal: 'logiSad',
  });
  await interaction.reply({
    ...karty.kartaSukces('Odwołanie złożone', 'Sprawa czeka na innego sędziego.'),
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  });
}

async function zamknijSprawe(client, sprawaId, przezUserId) {
  const sprawa = q.poId.get(sprawaId);
  if (!sprawa) return;
  q.zamknij.run(Date.now(), sprawaId);
  const kanal = await client.channels.fetch(sprawa.kanal_id).catch(() => null);
  // Sprawa zamknięta bez wyroku - sędzia traci rolę (jeśli nie prowadzi innej sprawy)
  if (kanal && sprawa.sedzia_id && sprawa.status !== 'wyrok' && config.role.sedzia && !q.aktywnaSedziego.get(sprawa.sedzia_id)) {
    const sedzia = await kanal.guild.members.fetch(sprawa.sedzia_id).catch(() => null);
    if (sedzia) await sedzia.roles.remove(config.role.sedzia, `Zamknięto sprawę ${sprawa.numer}`).catch(() => {});
  }
  if (kanal) {
    const zal = await transkrypt(kanal).catch(() => null);
    await wyslij(client, config.kanaly.logiSad, {
      ...karty.kartaInfo({
        tytul: 'Sprawa zamknięta',
        opis: `**Sprawa:** ${sprawa.numer}\n**Zamknął:** <@${przezUserId}>`,
        kolor: kolory.neutralny,
      }),
      ...(zal ? { files: [zal] } : {}),
    });
    setTimeout(() => kanal.delete('Sprawa zamknięta').catch(() => null), 5000);
  }
}

function rejestruj({ zarejestruj }) {
  zarejestruj('sad:przyjmij', onPrzyjmij);
  zarejestruj('sad:dowod', onDowod);
  zarejestruj('sad:dowod-modal', onDowodModal);
  zarejestruj('sad:wyrok', onWyrok);
  zarejestruj('sad:wyrok-modal', onWyrokModal);
  zarejestruj('sad:odwol', onOdwolanie);
}

module.exports = { rejestruj, zamknijSprawe };
