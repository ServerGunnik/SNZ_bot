// System rekrutacji: dwa kanały głosowe tworzone komendą /recru stworz.
// Poczekalnia: kandydat może wejść, ale nie może mówić (deny Speak na kanale).
// Pokój rekrutacyjny: niewidoczny dla @everyone; staff przenosi kandydata, a bot daje mu
// wtedy osobny overwrite (widok + mówienie), żeby mógł normalnie rozmawiać.
// Formularz rekrutacyjny: panel z /recru panel -> podanie -> decyzja staffu (na dole pliku).
const {
  PermissionFlagsBits, ChannelType, MessageFlags, ModalBuilder, LabelBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const db = require('../database/db.js');
const config = require('../config.js');
const { wszechwladny, maRole, jestStaff } = require('../utils/uprawnienia.js');
const karty = require('../utils/karty.js');
const kolory = require('../utils/kolory.js');
const { glowaUrl, walidujNick } = require('../utils/minecraft.js');
const { log } = require('../utils/logger.js');

const EPHEMERAL_V2 = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;

const q = {
  aktywna: db.prepare('SELECT * FROM rekrutacja WHERE aktywna = 1 ORDER BY id DESC LIMIT 1'),
  wszystkieAktywne: db.prepare('SELECT * FROM rekrutacja WHERE aktywna = 1 ORDER BY id'),
  wstaw: db.prepare('INSERT INTO rekrutacja (kategoria_id, poczekalnia_id, pokoj_id, utworzyl, utworzono) VALUES (?, ?, ?, ?, ?)'),
  zamknij: db.prepare('UPDATE rekrutacja SET aktywna = 0 WHERE id = ?'),
};

const NAZWA_KATEGORII = 'Rekrutacja';
const NAZWA_POCZEKALNI = '📣 Poczekalnia rekrutacyjna';
const NAZWA_POKOJU = '🎯 Rekrutacja';

function rolaStaffowe() {
  return [...new Set([
    ...config.role.staff, ...config.role.helper,
    ...config.role.lider, ...config.role.sedzia,
  ])];
}

function aktywnaRekrutacja() {
  return q.aktywna.get() || null;
}

// Uprawnienia staffu na kanałach rekrutacyjnych (rozmowa + przenoszenie kandydatów)
const UPRAWNIENIA_STAFFU_VOICE = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.Connect,
  PermissionFlagsBits.Speak,
  PermissionFlagsBits.UseVAD,
  PermissionFlagsBits.MuteMembers,
  PermissionFlagsBits.DeafenMembers,
  PermissionFlagsBits.MoveMembers,
];
const UPRAWNIENIA_BOTA = [
  ...UPRAWNIENIA_STAFFU_VOICE,
  PermissionFlagsBits.ManageChannels,
];
// Kandydat przeniesiony do pokoju rekrutacyjnego
const UPRAWNIENIA_KANDYDATA = {
  ViewChannel: true, Connect: true, Speak: true, UseVAD: true,
};

// Discord odrzuca cały kanał, jeśli overwrite przyznaje uprawnienie, którego bot sam nie ma,
// albo wskazuje nieistniejącą rolę - dlatego oba przypadki odsiewamy zawczasu.
function tylkoPosiadane(guild, uprawnienia) {
  const bot = guild.members.me?.permissions;
  if (!bot || bot.has(PermissionFlagsBits.Administrator)) return uprawnienia;
  return uprawnienia.filter(p => bot.has(p));
}

function overwrite(guild, staffyIds) {
  const staffu = tylkoPosiadane(guild, UPRAWNIENIA_STAFFU_VOICE);
  return [
    { id: guild.client.user.id, allow: tylkoPosiadane(guild, UPRAWNIENIA_BOTA) },
    ...staffyIds.map(id => ({ id, allow: staffu })),
  ];
}

function brakujaceUprawnieniaBota(guild) {
  const bot = guild.members.me?.permissions;
  if (!bot) return [];
  const wymagane = { ManageChannels: 'Zarządzanie kanałami', ManageRoles: 'Zarządzanie rolami', MoveMembers: 'Przenoszenie członków' };
  return Object.entries(wymagane).filter(([p]) => !bot.has(PermissionFlagsBits[p])).map(([, nazwa]) => nazwa);
}

async function stworz(guild, autorId) {
  const istniejaca = q.aktywna.get();
  if (istniejaca) {
    const poczekalnia = guild.channels.cache.get(istniejaca.poczekalnia_id);
    const pokoj = guild.channels.cache.get(istniejaca.pokoj_id);
    if (poczekalnia || pokoj) {
      return { blad: 'już trwa', istniejaca };
    }
    q.zamknij.run(istniejaca.id);
  }

  const brakuje = brakujaceUprawnieniaBota(guild);
  if (brakuje.length) return { blad: `bot nie ma uprawnień: ${brakuje.join(', ')}` };

  // Kategoria "Rekrutacja" - szukamy istniejącej, jeśli nie ma to tworzymy
  let kategoria = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === NAZWA_KATEGORII.toLowerCase());
  let nowaKategoria = false;
  if (!kategoria) {
    try {
      kategoria = await guild.channels.create({
        name: NAZWA_KATEGORII,
        type: ChannelType.GuildCategory,
        reason: 'Rekrutacja: tworzę kategorię',
      });
      nowaKategoria = true;
    } catch (e) {
      return { blad: `kategoria: ${e.message}` };
    }
  }
  const sprzatnijKategorie = async () => {
    if (nowaKategoria) await kategoria.delete('Rollback - nieudane tworzenie rekrutacji').catch(() => null);
  };

  const staffyIds = rolaStaffowe().filter(id => guild.roles.cache.has(id));

  // Poczekalnia: wszyscy mogą dołączyć, ale nie mogą mówić ani streamować
  let poczekalnia;
  try {
    poczekalnia = await guild.channels.create({
      name: NAZWA_POCZEKALNI,
      type: ChannelType.GuildVoice,
      parent: kategoria.id,
      reason: 'Rekrutacja: poczekalnia',
      permissionOverwrites: [
        {
          id: guild.id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect],
          deny: [PermissionFlagsBits.Speak, PermissionFlagsBits.UseVAD, PermissionFlagsBits.Stream],
        },
        ...overwrite(guild, staffyIds),
      ],
    });
  } catch (e) {
    await sprzatnijKategorie();
    return { blad: `poczekalnia: ${e.message}` };
  }

  // Pokój rekrutacyjny: niewidoczny dla @everyone, dostępny dla staffu. Kandydat dostaje dostęp
  // dopiero po przeniesieniu przez staff (patrz obsluzZmianeStanuGlosowego).
  let pokoj;
  try {
    pokoj = await guild.channels.create({
      name: NAZWA_POKOJU,
      type: ChannelType.GuildVoice,
      parent: kategoria.id,
      reason: 'Rekrutacja: pokój do rozmowy',
      permissionOverwrites: [
        {
          id: guild.id,
          deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect],
        },
        ...overwrite(guild, staffyIds),
      ],
    });
  } catch (e) {
    await poczekalnia.delete('Rollback - nieudane tworzenie pokoju').catch(() => null);
    await sprzatnijKategorie();
    return { blad: `pokój: ${e.message}` };
  }

  q.wstaw.run(nowaKategoria ? kategoria.id : null, poczekalnia.id, pokoj.id, autorId, Date.now());

  return { kategoria, poczekalnia, pokoj, staffyIds };
}

async function usun(guild, autorTag) {
  const rekrutacje = q.wszystkieAktywne.all();
  if (!rekrutacje.length) return { nic: true };

  const powod = `Rekrutacja zakończona przez ${autorTag}`;
  const usuniete = [];
  const bledy = [];
  for (const rek of rekrutacje) {
    let ok = true;
    for (const [nazwa, id] of [['poczekalnia', rek.poczekalnia_id], ['pokój', rek.pokoj_id]]) {
      const kanal = guild.channels.cache.get(id);
      if (!kanal) continue;
      try {
        await kanal.delete(powod);
        usuniete.push(nazwa);
      } catch (e) {
        ok = false;
        bledy.push(`${nazwa}: ${e.message}`);
      }
    }

    // Kategorię usuwamy tylko jeśli bot ją utworzył i nic w niej nie zostało
    const kategoria = rek.kategoria_id && guild.channels.cache.get(rek.kategoria_id);
    if (kategoria && !guild.channels.cache.some(c => c.parentId === kategoria.id)) {
      try {
        await kategoria.delete(powod);
        usuniete.push('kategoria');
      } catch (e) {
        ok = false;
        bledy.push(`kategoria: ${e.message}`);
      }
    }

    // Wpis zostaje aktywny, jeśli coś się nie usunęło - kolejne /recru usun spróbuje ponownie
    if (ok) q.zamknij.run(rek.id);
  }

  return { usuniete, bledy };
}

// Czy użytkownik jest staffem (nie traktujemy go jak kandydata)?
function staffRekrutacji(member) {
  if (!member) return true;
  if (wszechwladny(member)) return true;
  const staffyIds = rolaStaffowe();
  return Boolean(staffyIds.length && maRole(member, staffyIds));
}

// Hook do voiceStateUpdate: kandydat przeniesiony do pokoju dostaje prawo mówienia
async function obsluzZmianeStanuGlosowego(oldState, newState) {
  const rek = aktywnaRekrutacja();
  if (!rek) return;
  const member = newState.member || oldState.member;
  if (!member || member.user.bot) return;
  if (staffRekrutacji(member)) return;

  const wszedlDoPokoju = newState.channelId === rek.pokoj_id && oldState.channelId !== rek.pokoj_id;
  if (!wszedlDoPokoju) return;

  const pokoj = newState.channel;
  if (pokoj) {
    await pokoj.permissionOverwrites.edit(member.id, UPRAWNIENIA_KANDYDATA, { reason: 'Rekrutacja: kandydat w pokoju' })
      .catch((e) => console.error('[rekrutacja] overwrite kandydata', e.message));
  }
  // Starsza wersja wyciszała kandydatów server-mutem - zdejmujemy go, jeśli został
  if (newState.serverMute) {
    await member.voice.setMute(false, 'Rekrutacja: kandydat w pokoju').catch(() => null);
  }
}

// ---- Formularz rekrutacyjny ------------------------------------------
// Panel (/recru panel) -> przycisk "Złóż podanie" -> formularz -> karta na kanale podań z Przyjmij/Odrzuć.

const qp = {
  wstaw: db.prepare('INSERT INTO podania (user_id, nick, wiek, powod, doswiadczenie, aktywnosc, utworzono) VALUES (?, ?, ?, ?, ?, ?, ?)'),
  poId: db.prepare('SELECT * FROM podania WHERE id = ?'),
  usun: db.prepare('DELETE FROM podania WHERE id = ?'),
  oczekujace: db.prepare("SELECT * FROM podania WHERE user_id = ? AND status = 'oczekuje' LIMIT 1"),
  ostatnieOdrzucone: db.prepare("SELECT * FROM podania WHERE user_id = ? AND status = 'odrzucone' ORDER BY rozpatrzono DESC LIMIT 1"),
  zapiszWiadomosc: db.prepare('UPDATE podania SET kanal_id = ?, wiadomosc_id = ? WHERE id = ?'),
  rozpatrz: db.prepare("UPDATE podania SET status = ?, rozpatrzyl = ?, uzasadnienie = ?, rozpatrzono = ? WHERE id = ? AND status = 'oczekuje'"),
};

// Zwraca powód blokady albo null, gdy można złożyć podanie
function blokadaPodania(userId) {
  if (qp.oczekujace.get(userId)) return 'Twoje podanie czeka już na rozpatrzenie przez administrację.';
  const odrzucone = qp.ostatnieOdrzucone.get(userId);
  const cooldownMs = config.rekrutacja.cooldownPoOdrzuceniuGodz * 60 * 60 * 1000;
  if (odrzucone && cooldownMs && Date.now() - odrzucone.rozpatrzono < cooldownMs) {
    return `Twoje poprzednie podanie zostało odrzucone. Kolejne możesz złożyć <t:${Math.floor((odrzucone.rozpatrzono + cooldownMs) / 1000)}:R>.`;
  }
  return null;
}

function pole(id, label, opis, styl, { min = 0, max, wymagane = true } = {}) {
  const input = new TextInputBuilder().setCustomId(id).setStyle(styl).setMaxLength(max).setRequired(wymagane);
  if (min) input.setMinLength(min);
  return new LabelBuilder().setLabel(label).setDescription(opis).setTextInputComponent(input);
}

async function onPodanie(interaction) {
  const blokada = blokadaPodania(interaction.user.id);
  if (blokada) return interaction.reply({ ...karty.kartaOstrzezenie('Nie możesz teraz złożyć podania', blokada), flags: EPHEMERAL_V2 });

  const modal = new ModalBuilder().setCustomId('rek:podanie-modal').setTitle('Podanie rekrutacyjne — SNZ');
  modal.addLabelComponents(
    pole('nick', 'Nick z Minecrafta', 'Dokładnie tak jak w grze (3-16 znaków)', TextInputStyle.Short, { min: 3, max: 16 }),
    pole('wiek', 'Wiek', 'Ile masz lat? (sama liczba)', TextInputStyle.Short, { min: 1, max: 2 }),
    pole('powod', 'Dlaczego chcesz dołączyć?', 'Napisz kilka zdań o sobie i swojej motywacji', TextInputStyle.Paragraph, { min: 20, max: 1000 }),
    pole('doswiadczenie', 'Doświadczenie / co możesz wnieść?', 'Np. budowanie, PvP, organizacja, wcześniejsze państwa', TextInputStyle.Paragraph, { max: 1000, wymagane: false }),
    pole('aktywnosc', 'Ile czasu możesz poświęcić?', 'Np. 2 h dziennie, głównie wieczorami i w weekendy', TextInputStyle.Short, { min: 2, max: 100 }),
  );
  await interaction.showModal(modal);
}

async function onPodanieModal(interaction) {
  const blokada = blokadaPodania(interaction.user.id);
  if (blokada) return interaction.reply({ ...karty.kartaOstrzezenie('Nie możesz teraz złożyć podania', blokada), flags: EPHEMERAL_V2 });

  const nick = interaction.fields.getTextInputValue('nick').trim();
  const wiekTekst = interaction.fields.getTextInputValue('wiek').trim();
  const powod = interaction.fields.getTextInputValue('powod').trim();
  const doswiadczenie = (interaction.fields.getTextInputValue('doswiadczenie') || '').trim() || null;
  const aktywnosc = interaction.fields.getTextInputValue('aktywnosc').trim();

  if (!walidujNick(nick)) {
    return interaction.reply({ ...karty.kartaBlad('Nieprawidłowy nick', 'Nick z Minecrafta może mieć 3-16 znaków: litery, cyfry i podkreślnik.'), flags: EPHEMERAL_V2 });
  }
  const wiek = /^\d{1,2}$/.test(wiekTekst) ? parseInt(wiekTekst, 10) : NaN;
  const { minWiek, maxWiek } = config.rekrutacja;
  if (!(wiek >= minWiek && wiek <= maxWiek)) {
    return interaction.reply({ ...karty.kartaBlad('Nieprawidłowy wiek', `Wpisz wiek jako liczbę od ${minWiek} do ${maxWiek}.`), flags: EPHEMERAL_V2 });
  }

  const kanal = config.rekrutacja.kanalPodan && interaction.guild.channels.cache.get(config.rekrutacja.kanalPodan);
  if (!kanal?.isTextBased()) {
    return interaction.reply({ ...karty.kartaBlad('Rekrutacja nieskonfigurowana', 'Administracja nie ustawiła kanału podań. Spróbuj później.'), flags: EPHEMERAL_V2 });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const id = qp.wstaw.run(interaction.user.id, nick, wiek, powod, doswiadczenie, aktywnosc, Date.now()).lastInsertRowid;
  const podanie = qp.poId.get(id);

  const ping = config.rekrutacja.ping;
  if (ping.length) {
    await kanal.send({ content: `${ping.map(r => `<@&${r}>`).join(' ')} nowe podanie rekrutacyjne.`, allowedMentions: { roles: ping } }).catch(() => null);
  }
  const wiad = await kanal.send({ ...karty.kartaPodania({ podanie, glowaUrl: glowaUrl(nick) }), allowedMentions: { parse: [] } }).catch((e) => {
    console.error('[rekrutacja] wysyłka podania', e.message);
    return null;
  });
  if (!wiad) {
    qp.usun.run(id);
    return interaction.editReply(karty.kartaBlad('Nie udało się wysłać podania', 'Bot nie może pisać na kanale podań. Zgłoś to administracji.'));
  }
  qp.zapiszWiadomosc.run(kanal.id, wiad.id, id);

  return interaction.editReply(karty.kartaSukces('Podanie wysłane',
    `Twoje podanie **#${id}** trafiło do administracji. O decyzji dostaniesz wiadomość prywatną — upewnij się, że masz włączone DM od członków serwera.`));
}

// Przyjmij od razu; Odrzuć -> formularz z (opcjonalnym) powodem
async function onDecyzja(interaction) {
  const [, , decyzja, idStr] = interaction.customId.split(':');
  if (!jestStaff(interaction.member)) {
    return interaction.reply({ ...karty.kartaBlad('Brak uprawnień', 'Podania rozpatruje tylko administracja.'), flags: EPHEMERAL_V2 });
  }
  const podanie = qp.poId.get(parseInt(idStr, 10));
  if (!podanie || podanie.status !== 'oczekuje') {
    return interaction.reply({ ...karty.kartaOstrzezenie('Już rozpatrzone', 'To podanie ma już decyzję.'), flags: EPHEMERAL_V2 });
  }
  if (decyzja === 'no') {
    const modal = new ModalBuilder().setCustomId(`rek:odrzuc-modal:${podanie.id}`).setTitle(`Odrzucenie podania #${podanie.id}`);
    modal.addLabelComponents(pole('uzasadnienie', 'Powód odrzucenia', 'Kandydat zobaczy go w wiadomości prywatnej', TextInputStyle.Paragraph, { max: 500, wymagane: false }));
    return interaction.showModal(modal);
  }
  return rozpatrz(interaction, podanie, 'przyjete', null);
}

async function onOdrzucModal(interaction) {
  const [, , idStr] = interaction.customId.split(':');
  if (!jestStaff(interaction.member)) {
    return interaction.reply({ ...karty.kartaBlad('Brak uprawnień', 'Podania rozpatruje tylko administracja.'), flags: EPHEMERAL_V2 });
  }
  const podanie = qp.poId.get(parseInt(idStr, 10));
  const uzasadnienie = (interaction.fields.getTextInputValue('uzasadnienie') || '').trim() || null;
  return rozpatrz(interaction, podanie, 'odrzucone', uzasadnienie);
}

async function rozpatrz(interaction, podanie, status, uzasadnienie) {
  // Warunek status = 'oczekuje' w UPDATE chroni przed dwiema decyzjami naraz
  if (!podanie || !qp.rozpatrz.run(status, interaction.user.id, uzasadnienie, Date.now(), podanie.id).changes) {
    return interaction.reply({ ...karty.kartaOstrzezenie('Już rozpatrzone', 'To podanie ma już decyzję.'), flags: EPHEMERAL_V2 });
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const aktualne = qp.poId.get(podanie.id);
  const przyjete = status === 'przyjete';

  // Karta na kanale podań: bez przycisków, z decyzją
  if (aktualne.kanal_id && aktualne.wiadomosc_id) {
    const kanal = interaction.guild.channels.cache.get(aktualne.kanal_id);
    const wiad = await kanal?.messages.fetch(aktualne.wiadomosc_id).catch(() => null);
    await wiad?.edit({ ...karty.kartaPodania({ podanie: aktualne, glowaUrl: glowaUrl(aktualne.nick) }), allowedMentions: { parse: [] } }).catch(() => null);
  }

  const uwagi = [];
  const member = await interaction.guild.members.fetch(aktualne.user_id).catch(() => null);
  if (!member) uwagi.push('Kandydata nie ma już na serwerze.');
  const role = config.rekrutacja.rolaPrzyjety;
  if (przyjete && member && role.length) {
    const ok = await member.roles.add(role, `Przyjęte podanie #${aktualne.id}`).then(() => true).catch(() => false);
    uwagi.push(ok ? `Nadano rolę: ${role.map(r => `<@&${r}>`).join(', ')}` : 'Nie udało się nadać roli (rola bota musi być wyżej niż nadawana rola).');
  }

  const cooldown = config.rekrutacja.cooldownPoOdrzuceniuGodz;
  const dm = przyjete
    ? karty.kartaSukces('Podanie przyjęte', `Gratulacje! Twoje podanie rekrutacyjne na serwerze **${interaction.guild.name}** zostało **przyjęte**. Witamy w SNZ!`)
    : karty.kartaBlad('Podanie odrzucone', `Twoje podanie rekrutacyjne na serwerze **${interaction.guild.name}** zostało odrzucone.` +
      (uzasadnienie ? `\n\n**Powód:** ${uzasadnienie}` : '') +
      (cooldown ? `\n\nKolejne podanie możesz złożyć za ${cooldown} h.` : ''));
  const wyslano = member ? await member.send(dm).then(() => true).catch(() => false) : false;
  if (member && !wyslano) uwagi.push('Kandydat ma zablokowane DM — nie dostał powiadomienia.');

  await log(interaction.client, {
    tytul: `Rekrutacja — podanie ${przyjete ? 'przyjęte' : 'odrzucone'}`,
    opis: `**Podanie:** #${aktualne.id} — \`${aktualne.nick}\` (<@${aktualne.user_id}>)\n**Rozpatrzył:** <@${interaction.user.id}>` +
      (uzasadnienie ? `\n**Powód:** ${uzasadnienie}` : ''),
    kolor: przyjete ? kolory.sukces : kolory.blad,
  });

  return interaction.editReply(karty.kartaSukces(`Podanie #${aktualne.id} ${przyjete ? 'przyjęte' : 'odrzucone'}`,
    uwagi.length ? uwagi.join('\n') : 'Kandydat dostał powiadomienie w wiadomości prywatnej.'));
}

function rejestruj({ zarejestruj }) {
  zarejestruj('rek:podanie', onPodanie);
  zarejestruj('rek:podanie-modal', onPodanieModal);
  zarejestruj('rek:decyzja', onDecyzja);
  zarejestruj('rek:odrzuc-modal', onOdrzucModal);
}

module.exports = { rejestruj, aktywnaRekrutacja, stworz, usun, obsluzZmianeStanuGlosowego };
