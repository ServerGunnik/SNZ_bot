const {
  MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ChannelType,
} = require('discord.js');
const db = require('../database/db.js');
const config = require('../config.js');
const karty = require('../utils/karty.js');
const { jestStaff, jestProkuratorem } = require('../utils/uprawnienia.js');
const { log, wyslij } = require('../utils/logger.js');
const { transkrypt } = require('../utils/transkrypt.js');
const kolory = require('../utils/kolory.js');

const EPHEMERAL_V2 = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;

const q = {
  poId: db.prepare('SELECT * FROM sprawy WHERE id = ?'),
  aktywnaSedziego: db.prepare("SELECT * FROM sprawy WHERE sedzia_id = ? AND status IN ('przyjeta','w_toku')"),
  // Przypisanie tylko, gdy sprawa nadal nie ma sędziego (dwóch klikających naraz nie nadpisze sobie sprawy)
  przypisz: db.prepare("UPDATE sprawy SET sedzia_id = ?, status = 'w_toku' WHERE id = ? AND status = 'zlozona' AND sedzia_id IS NULL"),
  zmienSedziego: db.prepare('UPDATE sprawy SET sedzia_id = ?, poprzedni_sedzia = ? WHERE id = ?'),
  wydajWyrok: db.prepare("UPDATE sprawy SET werdykt = ?, kara = ?, wyrok_wobec = ?, status = 'wyrok', wyrok_data = ? WHERE id = ?"),
  zamknij: db.prepare("UPDATE sprawy SET status = 'zamknieta', zamknieta = ? WHERE id = ?"),
  wstawDowod: db.prepare('INSERT INTO sprawy_dowody (sprawa_id, user_id, tresc, data) VALUES (?, ?, ?, ?)'),
  dowody: db.prepare('SELECT * FROM sprawy_dowody WHERE sprawa_id = ? ORDER BY id'),
  panstwoPoNazwie: db.prepare('SELECT * FROM panstwa WHERE nazwa = ? COLLATE NOCASE'),
  panstwoPoId: db.prepare('SELECT * FROM panstwa WHERE id = ?'),
  panstwoLidera: db.prepare('SELECT * FROM panstwa WHERE lider_id = ?'),
  nickUsera: db.prepare('SELECT nick FROM weryfikacja WHERE user_id = ?'),
  czlonekPoNicku: db.prepare('SELECT * FROM panstwa_czlonkowie WHERE nick = ? COLLATE NOCASE'),
  wstawWarn: db.prepare('INSERT INTO ostrzezenia (user_id, powod, wystawca_id, data, sprawa_id) VALUES (?, ?, ?, ?, ?)'),
  weryfikacjaPoNicku: db.prepare('SELECT * FROM weryfikacja WHERE nick = ? COLLATE NOCASE'),
  ostatniPozew: db.prepare('SELECT utworzona FROM sprawy WHERE pozywajacy_id = ? AND utworzona >= ? ORDER BY utworzona DESC LIMIT 1'),
  resetCooldownu: db.prepare('SELECT data FROM pozew_cooldown_reset WHERE user_id = ?'),
  zapiszReset: db.prepare('INSERT INTO pozew_cooldown_reset (user_id, data, przez) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, przez = excluded.przez'),
  ustawProkuratora: db.prepare("UPDATE sprawy SET prokurator_id = ?, prokurator_nick = ? WHERE id = ? AND prokurator_id IS NULL AND status IN ('zlozona','przyjeta','w_toku')"),
  // Decyzja o publikacji zapada raz - drugi klik nie wyśle wyroku ponownie
  ustawPubliczny: db.prepare('UPDATE sprawy SET wyrok_publiczny = ?, publikacja_data = ? WHERE id = ? AND publikacja_data IS NULL'),
};

// ---- Cooldown pozwów ---------------------------------------------------
// Ogólny cooldown (12 h) albo osobny dla prokuratora (10 min). Liczy się ostatni pozew złożony
// po ewentualnym ręcznym zdjęciu cooldownu (/sprawa-cooldown).
function stanCooldownu(member, userId = member?.id) {
  const prokurator = jestProkuratorem(member);
  const cooldownMs = prokurator ? config.pozew.cooldownProkuratoraMs : config.pozew.cooldownMs;
  const od = Math.max(Date.now() - cooldownMs, q.resetCooldownu.get(userId)?.data ?? 0);
  const ostatni = q.ostatniPozew.get(userId, od);
  return {
    prokurator,
    cooldownMs,
    kolejnyMozliwy: ostatni ? ostatni.utworzona + cooldownMs : null,
  };
}

function zdejmijCooldown(userId, przezId) {
  q.zapiszReset.run(userId, Date.now(), przezId);
}

// Kategoria „Rozprawy sądowe”: ID z .env, a jeśli to nie jest kategoria - domyślne z configu
async function kategoriaSpraw(guild) {
  for (const id of [config.kanaly.kategoriaSprawy, config.kanaly.kategoriaSprawyDomyslna].filter(Boolean)) {
    const kanal = guild.channels.cache.get(id) || await guild.channels.fetch(id).catch(() => null);
    if (kanal?.type === ChannelType.GuildCategory) return kanal.id;
    console.error(`[sad] ${id} nie jest kategorią na tym serwerze - pomijam.`);
  }
  return null;
}

// ---- Strony sprawy i konflikt interesów --------------------------------

// Discord ID pozwanego: gracz wskazany wprost, właściciel nicku (stare sprawy) albo król pozwanego państwa
function idPozwanego(sprawa) {
  if (sprawa.pozwany_typ === 'gracz') return sprawa.pozwany_wartosc;
  if (sprawa.pozwany_typ === 'nick') return q.weryfikacjaPoNicku.get(sprawa.pozwany_wartosc)?.user_id || null;
  return q.panstwoPoNazwie.get(sprawa.pozwany_wartosc)?.lider_id || null;
}

// Państwa, do których należy użytkownik: jako król albo członek (po zweryfikowanym nicku)
function panstwaUzytkownika(userId) {
  const ids = new Set();
  const krolestwo = q.panstwoLidera.get(userId);
  if (krolestwo) ids.add(krolestwo.id);
  const nick = q.nickUsera.get(userId)?.nick;
  const czlonek = nick && q.czlonekPoNicku.get(nick);
  if (czlonek) ids.add(czlonek.panstwo_id);
  return ids;
}

// Państwa zaangażowane w sprawę: państwa obu stron + pozwane państwo
function panstwaSprawy(sprawa) {
  const ids = new Set();
  for (const strona of [sprawa.pozywajacy_id, idPozwanego(sprawa)].filter(Boolean)) {
    for (const id of panstwaUzytkownika(strona)) ids.add(id);
  }
  if (sprawa.pozwany_typ === 'panstwo') {
    const pozwane = q.panstwoPoNazwie.get(sprawa.pozwany_wartosc);
    if (pozwane) ids.add(pozwane.id);
  }
  return ids;
}

function czyStronaSprawy(sprawa, userId) {
  return userId === sprawa.pozywajacy_id || userId === idPozwanego(sprawa);
}

// Powód, dla którego użytkownik nie może sądzić w tej sprawie (null = może)
function konfliktInteresow(sprawa, userId) {
  if (czyStronaSprawy(sprawa, userId)) return 'jesteś stroną tej sprawy (pozywającym albo pozwanym)';
  if (sprawa.prokurator_id && userId === sprawa.prokurator_id) return 'jesteś oskarżającym prokuratorem w tej sprawie';
  const wspolne = [...panstwaUzytkownika(userId)].filter(id => panstwaSprawy(sprawa).has(id));
  if (wspolne.length) {
    const nazwa = q.panstwoPoId.get(wspolne[0])?.nazwa || '???';
    return `należysz do państwa **${nazwa}**, które jest zaangażowane w tę sprawę`;
  }
  return null;
}

// ---- Karta sprawy ------------------------------------------------------

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

// Rola Sędzia znika, gdy sędzia nie prowadzi już żadnej sprawy
async function zdejmijRoleSedziego(guild, userId, sprawa) {
  if (!config.role.sedzia.length || q.aktywnaSedziego.get(userId)) return;
  const czlonek = await guild.members.fetch(userId).catch(() => null);
  if (!czlonek) return;
  for (const id of config.role.sedzia) {
    await czlonek.roles.remove(id, `Koniec sprawy ${sprawa.numer}`).catch(() => {});
  }
}

// Nadanie/odebranie roli Sędzia i dostępu do kanału sprawy
async function ustawSedziego(guild, sprawa, userId, wlacz) {
  if (wlacz && config.role.sedzia.length) {
    const czlonek = await guild.members.fetch(userId).catch(() => null);
    if (czlonek) {
      for (const id of config.role.sedzia) {
        await czlonek.roles.add(id, `Sędzia sprawy ${sprawa.numer}`).catch(() => {});
      }
    }
  } else if (!wlacz) {
    await zdejmijRoleSedziego(guild, userId, sprawa);
  }
  const kanal = sprawa.kanal_id && await guild.client.channels.fetch(sprawa.kanal_id).catch(() => null);
  if (!kanal) return;
  if (wlacz) {
    await kanal.permissionOverwrites.edit(userId, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true }).catch(() => {});
  } else {
    await kanal.permissionOverwrites.delete(userId, `Zmiana sędziego w ${sprawa.numer}`).catch(() => {});
  }
}

// ---- Przyjęcie sprawy (raz - sędzia się nie zmienia) --------------------

async function onPrzyjmij(interaction) {
  if (!jestStaff(interaction.member)) {
    return interaction.reply({ ...karty.kartaBlad('Brak uprawnień', 'Sprawy przyjmuje staff (kandydat na sędziego).'), flags: EPHEMERAL_V2 });
  }
  const [, , idStr] = interaction.customId.split(':');
  const id = parseInt(idStr, 10);
  const sprawa = q.poId.get(id);
  if (!sprawa || sprawa.status !== 'zlozona' || sprawa.sedzia_id) {
    return interaction.reply({ ...karty.kartaOstrzezenie('Nie do przyjęcia', 'Ta sprawa ma już sędziego. Sędziego nie można zmienić.'), flags: EPHEMERAL_V2 });
  }

  const aktywna = q.aktywnaSedziego.get(interaction.user.id);
  if (aktywna) {
    return interaction.reply({ ...karty.kartaBlad('Zajęty', `Prowadzisz już sprawę **${aktywna.numer}**. Zakończ ją przed przyjęciem kolejnej.`), flags: EPHEMERAL_V2 });
  }

  const konflikt = konfliktInteresow(sprawa, interaction.user.id);
  if (konflikt) {
    return interaction.reply({ ...karty.kartaBlad('Konflikt interesów', `Nie możesz orzekać w tej sprawie: ${konflikt}.`), flags: EPHEMERAL_V2 });
  }

  if (q.przypisz.run(interaction.user.id, id).changes === 0) {
    return interaction.reply({ ...karty.kartaOstrzezenie('Nie do przyjęcia', 'Ktoś właśnie przyjął tę sprawę.'), flags: EPHEMERAL_V2 });
  }
  await ustawSedziego(interaction.guild, sprawa, interaction.user.id, true);
  await aktualizujKarteSprawy(interaction.client, id);

  const istniejace = config.role.sedzia.filter(id => interaction.guild.roles.cache.has(id));
  const brakujace = config.role.sedzia.filter(id => !interaction.guild.roles.cache.has(id));
  const rolaOpis = !config.role.sedzia.length
    ? 'brak konfiguracji (ustaw ROLA_SEDZIA w .env)'
    : istniejace.length
      ? istniejace.map(id => `<@&${id}>`).join(' ') +
        (brakujace.length ? ` _(w .env są też nieistniejące ID: ${brakujace.join(', ')})_` : '')
      : `_żadna z ról w ROLA_SEDZIA (${config.role.sedzia.join(', ')}) nie istnieje na serwerze — zaktualizuj .env_`;

  await log(interaction.client, {
    tytul: 'Sędzia przyjął sprawę',
    opis: `**Sprawa:** ${sprawa.numer}\n**Sędzia:** <@${interaction.user.id}>\n**Rola nadana:** ${rolaOpis}`,
    kolor: kolory.info,
    kanal: 'logiSad',
  });

  await interaction.reply({ ...karty.kartaSukces('Sprawa przyjęta', `Prowadzisz sprawę **${sprawa.numer}**. Sędzia nie zmienia się do końca sprawy.`), flags: EPHEMERAL_V2 });
}

// Awaryjna zmiana sędziego - wyłącznie właściciel serwera (komenda /sprawa-sedzia)
async function zmienSedziego(guild, sprawa, nowySedziaId, przezId) {
  const stary = sprawa.sedzia_id;
  q.zmienSedziego.run(nowySedziaId, stary, sprawa.id);
  if (stary) await ustawSedziego(guild, sprawa, stary, false);
  await ustawSedziego(guild, sprawa, nowySedziaId, true);
  await aktualizujKarteSprawy(guild.client, sprawa.id);
  const kanal = sprawa.kanal_id && await guild.client.channels.fetch(sprawa.kanal_id).catch(() => null);
  if (kanal) {
    await kanal.send({
      ...karty.kartaOstrzezenie('Zmiana sędziego', `Właściciel serwera zmienił sędziego sprawy na <@${nowySedziaId}>${stary ? ` (poprzednio <@${stary}>)` : ''}.`),
      allowedMentions: { parse: [] },
    }).catch(() => null);
  }
  await log(guild.client, {
    tytul: 'Awaryjna zmiana sędziego',
    opis: `**Sprawa:** ${sprawa.numer}\n**Poprzedni sędzia:** ${stary ? `<@${stary}>` : '_brak_'}\n**Nowy sędzia:** <@${nowySedziaId}>\n**Zmienił:** <@${przezId}>`,
    kolor: kolory.ostrzezenie,
    kanal: 'logiSad',
  });
}

// ---- Dowody ------------------------------------------------------------

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
  if (!sprawa || !['zlozona', 'przyjeta', 'w_toku'].includes(sprawa.status)) {
    return interaction.reply({ ...karty.kartaOstrzezenie('Sprawa zamknięta', 'Do tej sprawy nie można już dodawać dowodów.'), flags: EPHEMERAL_V2 });
  }
  const tresc = interaction.fields.getTextInputValue('tresc').trim();
  q.wstawDowod.run(id, interaction.user.id, tresc, Date.now());
  await aktualizujKarteSprawy(interaction.client, id);
  await interaction.reply({ ...karty.kartaSukces('Dowód dodany', 'Wpis został dołączony do sprawy.'), flags: EPHEMERAL_V2 });
}

// ---- Wyrok (ostateczny - bez odwołań) ----------------------------------

// Krok 1: panel wyboru kogo dotyczy wyrok
async function onWyrok(interaction) {
  const [, , idStr] = interaction.customId.split(':');
  const id = parseInt(idStr, 10);
  const sprawa = q.poId.get(id);
  if (!sprawa) return;
  if (sprawa.sedzia_id !== interaction.user.id) {
    return interaction.reply({ ...karty.kartaBlad('Brak uprawnień', 'Wyrok może wydać tylko przypisany sędzia.'), flags: EPHEMERAL_V2 });
  }
  if (!['przyjeta', 'w_toku'].includes(sprawa.status)) {
    return interaction.reply({ ...karty.kartaOstrzezenie('Wyrok już wydany', 'W tej sprawie wyrok już zapadł.'), flags: EPHEMERAL_V2 });
  }
  await interaction.reply({ ...karty.kartaWyborWerdyktu(id), flags: EPHEMERAL_V2 });
}

// Krok 2: po wyborze kogo - modal z treścią werdyktu i karą
async function onWyrokWobec(interaction) {
  const [, , idStr, wobec] = interaction.customId.split(':');
  const id = parseInt(idStr, 10);
  const sprawa = q.poId.get(id);
  if (!sprawa) return;
  if (sprawa.sedzia_id !== interaction.user.id) {
    return interaction.reply({ ...karty.kartaBlad('Brak uprawnień', 'Wyrok może wydać tylko przypisany sędzia.'), flags: EPHEMERAL_V2 });
  }
  if (!karty.WYROK_WOBEC_ETYKIETY[wobec]) {
    return interaction.reply({ ...karty.kartaBlad('Nieznana opcja', 'Wybierz jedną z opcji panelu.'), flags: EPHEMERAL_V2 });
  }

  const modal = new ModalBuilder()
    .setCustomId(`sad:wyrok-modal:${idStr}:${wobec}`)
    .setTitle(`Wyrok — ${sprawa.numer}`.slice(0, 45));
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('werdykt').setLabel(`Werdykt (${karty.WYROK_WOBEC_ETYKIETY[wobec]})`.slice(0, 45))
        .setStyle(TextInputStyle.Paragraph).setMinLength(5).setMaxLength(1500).setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('kara').setLabel('Kara')
        .setPlaceholder(wobec === 'uniewinniony' ? 'uniewinnienie' : wobec === 'usunieta' ? 'brak (sprawa anulowana)' : 'np. ostrzeżenie, grzywna, ban')
        .setStyle(TextInputStyle.Short).setMaxLength(200).setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('list_gonczy').setLabel('Wystawić list gończy? tak/nie (opcj.)')
        .setStyle(TextInputStyle.Short).setMaxLength(3).setRequired(false)
    ),
  );
  await interaction.showModal(modal);
}

// Krok 3: zapis werdyktu + panel decyzji o publikacji
async function onWyrokModal(interaction) {
  const [, , idStr, wobec] = interaction.customId.split(':');
  const id = parseInt(idStr, 10);
  const sprawa = q.poId.get(id);
  if (!sprawa || sprawa.sedzia_id !== interaction.user.id || !['przyjeta', 'w_toku'].includes(sprawa.status)) {
    return interaction.reply({ ...karty.kartaBlad('Nie można wydać wyroku', 'Wyrok w tej sprawie już zapadł albo nie jesteś jej sędzią.'), flags: EPHEMERAL_V2 });
  }

  const werdykt = interaction.fields.getTextInputValue('werdykt').trim();
  const kara = interaction.fields.getTextInputValue('kara').trim();
  const wystawList = (interaction.fields.getTextInputValue('list_gonczy') || '').trim().toLowerCase();

  q.wydajWyrok.run(werdykt, kara, wobec, Date.now(), id);
  // Rola Sędzia znika po wyroku; dostęp do kanału sprawy zostaje do jej zamknięcia
  await zdejmijRoleSedziego(interaction.guild, interaction.user.id, sprawa);

  // Ostrzeżenie w historii pozwanego gracza - tylko gdy wyrok skierowany przeciwko pozwanemu (lub obojgu)
  // Uniewinniony/usunieta/oskarzajacy nie dają warna pozwanemu
  const pozwanyId = sprawa.pozwany_typ === 'panstwo' ? null : idPozwanego(sprawa);
  if (pozwanyId && (wobec === 'pozwany' || wobec === 'oboje')) {
    q.wstawWarn.run(pozwanyId, `Wyrok ${sprawa.numer}: ${kara}`, interaction.user.id, Date.now(), id);
  }

  await log(interaction.client, {
    tytul: 'Wyrok wydany',
    opis: `**Sprawa:** ${sprawa.numer}\n**Sędzia:** <@${interaction.user.id}>\n**Wobec:** ${karty.WYROK_WOBEC_ETYKIETY[wobec]}\n**Kara:** ${kara}\nWyrok jest ostateczny. Oczekuje na decyzję o publikacji.`,
    kolor: kolory.sukces,
    kanal: 'logiSad',
  });

  // Automatyczny list gończy - tylko gdy wyrok wobec pozwanego/obojga
  let infoList = '';
  if (['tak', 'yes', 't', 'y'].includes(wystawList) && sprawa.pozwany_typ !== 'panstwo' && (wobec === 'pozwany' || wobec === 'oboje')) {
    const nick = sprawa.pozwany_typ === 'nick' ? sprawa.pozwany_wartosc : (pozwanyId && q.nickUsera.get(pozwanyId)?.nick);
    if (nick) {
      const { utworzList, opublikujList } = require('./listy-goncze.js');
      const listId = utworzList({ nick, powod: `Wyrok ${sprawa.numer}: ${werdykt}`, wystawcaId: interaction.user.id });
      const blad = await opublikujList(interaction.client, listId);
      infoList = blad ? `\nList gończy #${listId} jest aktywny, ale nie trafił na kanał: ${blad}.` : `\nWystawiono list gończy #${listId} na \`${nick}\`.`;
    } else {
      infoList = '\nNie wystawiono listu gończego — pozwany nie ma zweryfikowanego nicku Minecraft.';
    }
  }

  await aktualizujKarteSprawy(interaction.client, id);
  await interaction.reply({
    ...karty.kartaPytanieOPublikacje(id),
    flags: EPHEMERAL_V2,
    // Dopisek z infoList po karcie nie jest trywialny w v2, więc puszczamy go w followUp jeśli jest
  });
  if (infoList) {
    await interaction.followUp({ ...karty.kartaInfo({ tytul: 'List gończy', opis: infoList.trim(), kolor: kolory.info }), flags: EPHEMERAL_V2 });
  }
}

// Krok końcowy: decyzja o publikacji wyroku
async function onWyrokPublikuj(interaction) {
  const [, , idStr, decyzja] = interaction.customId.split(':');
  const id = parseInt(idStr, 10);
  const sprawa = q.poId.get(id);
  if (!sprawa || sprawa.status !== 'wyrok') {
    return interaction.update({ ...karty.kartaBlad('Nic do publikacji', 'Werdykt nie został jeszcze zapisany albo sprawa już zamknięta.') });
  }
  if (sprawa.sedzia_id !== interaction.user.id) {
    return interaction.reply({ ...karty.kartaBlad('Brak uprawnień', 'Decyzję o publikacji podejmuje sędzia sprawy.'), flags: EPHEMERAL_V2 });
  }

  const publicznie = decyzja === 'tak';
  if (q.ustawPubliczny.run(publicznie ? 1 : 0, Date.now(), id).changes === 0) {
    return interaction.update({ ...karty.kartaOstrzezenie('Decyzja już zapadła', 'O publikacji tego wyroku już zdecydowano — nie zostanie wysłany drugi raz.') });
  }

  // Rozprawa publiczna -> kanał „wyroki sądowe”, niepubliczna -> kanał „sprawy-sąd”
  const spr = q.poId.get(id);
  const kanalDocelowy = publicznie ? config.kanaly.wyroki : config.kanaly.wyrokiPrywatne;
  const wyslana = kanalDocelowy ? await wyslij(interaction.client, kanalDocelowy, karty.kartaWyroku({ sprawa: spr })) : null;

  await log(interaction.client, {
    tytul: publicznie ? 'Wyrok opublikowany (rozprawa publiczna)' : 'Wyrok zapisany (rozprawa niepubliczna)',
    opis: `**Sprawa:** ${sprawa.numer}\n**Sędzia:** <@${interaction.user.id}>\n` +
      `**Kanał:** ${kanalDocelowy ? `<#${kanalDocelowy}>` : '_nie ustawiono_'}${kanalDocelowy && !wyslana ? ' — **nie udało się wysłać** (brak dostępu bota?)' : ''}`,
    kolor: publicznie ? kolory.sukces : kolory.neutralny,
    kanal: 'logiSad',
  });

  await aktualizujKarteSprawy(interaction.client, id);
  await interaction.update({
    ...karty.kartaSukces(publicznie ? 'Opublikowano' : 'Zapisano jako niepubliczny',
      (publicznie
        ? 'Wyrok trafił na kanał z wyrokami sądowymi — widoczny dla wszystkich.'
        : 'Wyrok trafił na kanał spraw niepublicznych — widoczny tylko dla uprawnionych.') +
      (kanalDocelowy && !wyslana ? `\n\n**Uwaga:** nie udało się wysłać na <#${kanalDocelowy}> — sprawdź uprawnienia bota.` : '')),
  });
}

// Stare karty spraw mogą mieć przycisk odwołania
async function onOdwolanie(interaction) {
  await interaction.reply({ ...karty.kartaBlad('Brak odwołań', 'Wyroki Sądu Sojuszniczego są ostateczne — nie można się od nich odwołać.'), flags: EPHEMERAL_V2 });
}

async function onZamknijPrzycisk(interaction) {
  if (!jestStaff(interaction.member)) {
    return interaction.reply({ ...karty.kartaBlad('Brak uprawnień', 'Sprawę zamyka administracja.'), flags: EPHEMERAL_V2 });
  }
  const [, , idStr] = interaction.customId.split(':');
  const sprawa = q.poId.get(parseInt(idStr, 10));
  if (!sprawa || sprawa.status === 'zamknieta') {
    return interaction.reply({ ...karty.kartaOstrzezenie('Już zamknięta', 'Ta sprawa jest już zamknięta.'), flags: EPHEMERAL_V2 });
  }
  await interaction.reply({ ...karty.kartaSukces('Zamykanie sprawy', 'Kanał zostanie usunięty za 5 sekund, a transkrypt trafi do logów sądu.'), flags: EPHEMERAL_V2 });
  await zamknijSprawe(interaction.client, sprawa.id, interaction.user.id);
}

async function zamknijSprawe(client, sprawaId, przezUserId) {
  const sprawa = q.poId.get(sprawaId);
  if (!sprawa) return;
  q.zamknij.run(Date.now(), sprawaId);
  const kanal = await client.channels.fetch(sprawa.kanal_id).catch(() => null);
  // Sprawa zamknięta bez wyroku - sędzia traci rolę (jeśli nie prowadzi innej sprawy)
  if (kanal && sprawa.sedzia_id && sprawa.status !== 'wyrok') await zdejmijRoleSedziego(kanal.guild, sprawa.sedzia_id, sprawa);
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
  zarejestruj('sad:wyrok-wobec', onWyrokWobec);
  zarejestruj('sad:wyrok-modal', onWyrokModal);
  zarejestruj('sad:wyrok-publikuj', onWyrokPublikuj);
  zarejestruj('sad:odwol', onOdwolanie);
  zarejestruj('sad:zamknij', onZamknijPrzycisk);
}

// Prokurator przypisuje się jako oskarżający (/sprawa-prokuratora). Zwraca { blad } albo { sprawa }.
async function przypiszProkuratora(guild, sprawa, member) {
  if (!['zlozona', 'przyjeta', 'w_toku'].includes(sprawa.status)) return { blad: 'W tej sprawie zapadł już wyrok albo jest zamknięta.' };
  if (sprawa.prokurator_id === member.id) return { blad: 'Jesteś już oskarżającym w tej sprawie.' };
  if (sprawa.prokurator_id) return { blad: `Oskarżającym w tej sprawie jest już <@${sprawa.prokurator_id}>.` };
  if (member.id === idPozwanego(sprawa)) return { blad: 'Nie możesz oskarżać we własnej sprawie jako pozwany.' };
  if (member.id === sprawa.sedzia_id) return { blad: 'Jesteś sędzią tej sprawy — nie możesz być jednocześnie oskarżającym.' };

  // Nick z weryfikacji (Minecraft), a gdy go brak - nazwa na serwerze
  const nick = q.nickUsera.get(member.id)?.nick || member.displayName || member.user?.username;
  if (q.ustawProkuratora.run(member.id, nick, sprawa.id).changes === 0) return { blad: 'Ktoś właśnie przypisał się do tej sprawy albo jej stan się zmienił.' };

  const kanal = sprawa.kanal_id && await guild.client.channels.fetch(sprawa.kanal_id).catch(() => null);
  if (kanal) {
    await kanal.permissionOverwrites.edit(member.id, { ViewChannel: true, SendMessages: true, AttachFiles: true, ReadMessageHistory: true }).catch(() => {});
    await kanal.send({
      ...karty.kartaInfo({ tytul: 'Oskarżający przypisany', opis: `⚖️ **Oskarżający:** Prokurator — ${nick} (<@${member.id}>)`, kolor: kolory.info }),
      allowedMentions: { parse: [] },
    }).catch(() => null);
  }
  await aktualizujKarteSprawy(guild.client, sprawa.id);
  await log(guild.client, {
    tytul: 'Prokurator przypisany do sprawy',
    opis: `**Sprawa:** ${sprawa.numer}\n**Oskarżający:** Prokurator — ${nick} (<@${member.id}>)`,
    kolor: kolory.info,
    kanal: 'logiSad',
  });
  return { sprawa: q.poId.get(sprawa.id), nick };
}

module.exports = {
  rejestruj, zamknijSprawe, zmienSedziego, konfliktInteresow, idPozwanego, panstwaUzytkownika,
  stanCooldownu, zdejmijCooldown, kategoriaSpraw, przypiszProkuratora,
};
