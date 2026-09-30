// Antynuke (masowe bany/kicki, usuwanie i spam kanałów, usuwanie ról, dodawanie botów)
// oraz anty-raid (masowe wbijanie na serwer).
// Źródłem prawdy o sprawcy jest zdarzenie guildAuditLogEntryCreate - bot potrzebuje uprawnienia "View Audit Log".
const { AuditLogEvent, ChannelType } = require('discord.js');
const db = require('../database/db.js');
const config = require('../config.js');
const { log, wyslij } = require('../utils/logger.js');
const kolory = require('../utils/kolory.js');

const TYPY = {
  [AuditLogEvent.MemberBanAdd]: 'ban',
  [AuditLogEvent.MemberKick]: 'kick',
  [AuditLogEvent.ChannelDelete]: 'kanalUsun',
  [AuditLogEvent.ChannelCreate]: 'kanalUtworz',
  [AuditLogEvent.RoleDelete]: 'rolaUsun',
};

const NAZWY_TYPOW = {
  ban: 'banowanie',
  kick: 'wyrzucanie',
  kanalUsun: 'usuwanie kanałów',
  kanalUtworz: 'tworzenie kanałów',
  rolaUsun: 'usuwanie ról',
};

const TYPY_KANALOW_DO_ODTWORZENIA = new Set([
  ChannelType.GuildText,
  ChannelType.GuildVoice,
  ChannelType.GuildCategory,
  ChannelType.GuildAnnouncement,
  ChannelType.GuildStageVoice,
  ChannelType.GuildForum,
]);

const PAMIEC_ZRZUTOW_MS = 5 * 60 * 1000;
const CZAS_BLOKADY_UKARANEGO_MS = 60 * 1000;
const OPOZNIENIE_PRZYWRACANIA_MS = 2000;

const q = {
  whitelista: db.prepare('SELECT user_id FROM antynuke_whitelist'),
  naWhiteliscie: db.prepare('SELECT 1 FROM antynuke_whitelist WHERE user_id = ?'),
  dodaj: db.prepare('INSERT OR IGNORE INTO antynuke_whitelist (user_id, dodal, data) VALUES (?, ?, ?)'),
  usun: db.prepare('DELETE FROM antynuke_whitelist WHERE user_id = ?'),
};

const akcje = new Map();            // executorId -> [{ typ, targetId, czas }]
const ukarani = new Map();          // executorId -> czas ukarania
const usunieteKanaly = new Map();   // channelId -> { zrzut, czas }
const usunieteRole = new Map();     // roleId -> { zrzut, czas }

// ---- Whitelista --------------------------------------------------------

function jestNaWhiteliscie(guild, userId) {
  if (!userId) return true;
  if (userId === guild.ownerId) return true;
  if (userId === guild.client.user.id) return true;
  if (config.antynuke.whitelist.includes(userId)) return true;
  return Boolean(q.naWhiteliscie.get(userId));
}

function dodajDoWhitelisty(userId, przezId) {
  q.dodaj.run(userId, przezId, Date.now());
}

function usunZWhitelisty(userId) {
  return q.usun.run(userId).changes > 0;
}

function listaWhitelisty() {
  return q.whitelista.all().map(r => r.user_id);
}

// ---- Zrzuty usuniętych kanałów i ról (do odtworzenia) -----------------

function wyczyscStare(mapa) {
  const granica = Date.now() - PAMIEC_ZRZUTOW_MS;
  for (const [id, wpis] of mapa) if (wpis.czas < granica) mapa.delete(id);
}

function zrzutKanalu(kanal) {
  return {
    id: kanal.id,
    name: kanal.name,
    type: kanal.type,
    parentId: kanal.parentId ?? null,
    position: kanal.rawPosition ?? kanal.position,
    topic: kanal.topic ?? undefined,
    nsfw: kanal.nsfw ?? undefined,
    bitrate: kanal.bitrate ?? undefined,
    userLimit: kanal.userLimit ?? undefined,
    rateLimitPerUser: kanal.rateLimitPerUser ?? undefined,
    permissionOverwrites: kanal.permissionOverwrites?.cache?.map(o => ({
      id: o.id, type: o.type, allow: o.allow.bitfield, deny: o.deny.bitfield,
    })) ?? [],
    dzieci: kanal.type === ChannelType.GuildCategory
      ? kanal.guild.channels.cache.filter(c => c.parentId === kanal.id).map(c => c.id)
      : [],
  };
}

function zapamietajKanal(kanal) {
  if (!kanal?.guild || kanal.isThread?.()) return;
  wyczyscStare(usunieteKanaly);
  usunieteKanaly.set(kanal.id, { zrzut: zrzutKanalu(kanal), czas: Date.now() });
}

function zapamietajRole(rola) {
  if (!rola?.guild || rola.managed) return;
  wyczyscStare(usunieteRole);
  usunieteRole.set(rola.id, {
    zrzut: {
      id: rola.id,
      name: rola.name,
      color: rola.colors?.primaryColor ?? rola.color,
      hoist: rola.hoist,
      permissions: rola.permissions.bitfield,
      mentionable: rola.mentionable,
      position: rola.position,
    },
    czas: Date.now(),
  });
}

// ---- Przywracanie ------------------------------------------------------

async function odtworzKanaly(guild, ids) {
  const zrzuty = ids.map(id => usunieteKanaly.get(id)?.zrzut).filter(Boolean)
    .filter(z => TYPY_KANALOW_DO_ODTWORZENIA.has(z.type));
  // Najpierw kategorie, żeby kanały mogły wrócić do nowych kategorii
  zrzuty.sort((a, b) => (b.type === ChannelType.GuildCategory) - (a.type === ChannelType.GuildCategory) || a.position - b.position);

  const mapaId = new Map();
  let odtworzone = 0;
  for (const z of zrzuty) {
    const parent = z.parentId ? (mapaId.get(z.parentId) || (guild.channels.cache.has(z.parentId) ? z.parentId : null)) : null;
    const overwrites = z.permissionOverwrites.filter(o =>
      o.type === 0 ? guild.roles.cache.has(o.id) : guild.members.cache.has(o.id)
    );
    const nowy = await guild.channels.create({
      name: z.name,
      type: z.type,
      parent: z.type === ChannelType.GuildCategory ? null : parent,
      topic: z.topic,
      nsfw: z.nsfw,
      bitrate: z.bitrate,
      userLimit: z.userLimit,
      rateLimitPerUser: z.rateLimitPerUser,
      permissionOverwrites: overwrites,
      position: z.position,
      reason: 'Antynuke: odtworzenie usuniętego kanału',
    }).catch((e) => { console.error('[antynuke] odtworzenie kanału', z.name, e.message); return null; });
    if (!nowy) continue;
    odtworzone++;
    mapaId.set(z.id, nowy.id);
    usunieteKanaly.delete(z.id);
    // Kanały, które zostały osierocone po usunięciu kategorii, wracają do niej
    for (const dzieckoId of z.dzieci) {
      const dziecko = guild.channels.cache.get(dzieckoId);
      if (dziecko && !dziecko.parentId) await dziecko.setParent(nowy.id, { lockPermissions: false }).catch(() => {});
    }
  }
  return odtworzone;
}

async function odtworzRole(guild, ids) {
  let odtworzone = 0;
  for (const id of ids) {
    const z = usunieteRole.get(id)?.zrzut;
    if (!z) continue;
    const nowa = await guild.roles.create({
      name: z.name,
      colors: { primaryColor: z.color || 0 },
      hoist: z.hoist,
      permissions: z.permissions,
      mentionable: z.mentionable,
      position: z.position,
      reason: 'Antynuke: odtworzenie usuniętej roli',
    }).catch((e) => { console.error('[antynuke] odtworzenie roli', z.name, e.message); return null; });
    if (nowa) { odtworzone++; usunieteRole.delete(id); }
  }
  return odtworzone;
}

async function przywroc(guild, lista) {
  const wynik = { odbanowani: 0, usunieteKanaly: 0, odtworzoneKanaly: 0, odtworzoneRole: 0 };
  if (!config.antynuke.przywracaj || !lista.length) return wynik;

  for (const a of lista.filter(a => a.typ === 'ban')) {
    const ok = await guild.members.unban(a.targetId, 'Antynuke: cofnięcie masowego bana').then(() => true).catch(() => false);
    if (ok) wynik.odbanowani++;
  }
  for (const a of lista.filter(a => a.typ === 'kanalUtworz')) {
    const kanal = guild.channels.cache.get(a.targetId);
    const ok = kanal ? await kanal.delete('Antynuke: usunięcie spamowanego kanału').then(() => true).catch(() => false) : false;
    if (ok) wynik.usunieteKanaly++;
  }
  wynik.odtworzoneKanaly = await odtworzKanaly(guild, lista.filter(a => a.typ === 'kanalUsun').map(a => a.targetId));
  wynik.odtworzoneRole = await odtworzRole(guild, lista.filter(a => a.typ === 'rolaUsun').map(a => a.targetId));
  return wynik;
}

// ---- Kara --------------------------------------------------------------

async function pingStaffu(client, tresc) {
  const staff = config.role.staff;
  await wyslij(client, config.kanaly.logiAntynuke, {
    content: staff ? `<@&${staff}> ${tresc}` : tresc,
    allowedMentions: staff ? { roles: [staff] } : { parse: [] },
  });
}

async function ukarz(guild, sprawcaId, typ) {
  const client = guild.client;
  const powod = `Antynuke: ${NAZWY_TYPOW[typ]} (limit ${config.antynuke.progi[typ]} w ${config.antynuke.oknoMs / 1000}s)`;
  const czlonek = await guild.members.fetch(sprawcaId).catch(() => null);
  let kara = config.antynuke.kara;
  // Bot z rolą zarządzaną nie straci uprawnień przez odebranie ról - trzeba go wyrzucić
  if (czlonek?.user.bot && kara === 'role') kara = 'kick';

  let wynikKary;
  if (!czlonek) {
    wynikKary = await guild.members.ban(sprawcaId, { reason: powod })
      .then(() => 'zbanowany (nie było go już na serwerze)')
      .catch((e) => `nie udało się ukarać: ${e.message}`);
  } else if (kara === 'ban') {
    wynikKary = czlonek.bannable
      ? await czlonek.ban({ reason: powod }).then(() => 'zbanowany').catch((e) => `ban nieudany: ${e.message}`)
      : 'nie można zbanować (rola wyższa niż rola bota)';
  } else if (kara === 'kick') {
    wynikKary = czlonek.kickable
      ? await czlonek.kick(powod).then(() => 'wyrzucony').catch((e) => `kick nieudany: ${e.message}`)
      : 'nie można wyrzucić (rola wyższa niż rola bota)';
  } else {
    const zostaw = czlonek.roles.cache.filter(r => r.managed && r.id !== guild.id).map(r => r.id);
    wynikKary = czlonek.manageable
      ? await czlonek.roles.set(zostaw, powod).then(() => 'odebrano wszystkie role').catch((e) => `odebranie ról nieudane: ${e.message}`)
      : 'nie można odebrać ról (rola wyższa niż rola bota)';
  }

  return wynikKary;
}

// ---- Obsługa zdarzeń ---------------------------------------------------

async function obsluzWpisAudytu(wpis, guild) {
  if (!config.antynuke.wlaczony || !guild) return;
  if (config.guildId && guild.id !== config.guildId) return;
  const sprawcaId = wpis.executorId;
  if (!sprawcaId || jestNaWhiteliscie(guild, sprawcaId)) return;

  // Dodanie bota przez osobę spoza whitelisty
  if (wpis.action === AuditLogEvent.BotAdd) {
    if (!config.antynuke.blokujBoty) return;
    const bot = await guild.members.fetch(wpis.targetId).catch(() => null);
    const wynik = bot
      ? await bot.kick('Antynuke: bot dodany przez osobę spoza whitelisty').then(() => 'wyrzucony').catch((e) => `nie udało się wyrzucić: ${e.message}`)
      : 'bota nie ma już na serwerze';
    await log(guild.client, {
      tytul: 'Antynuke — zablokowano dodanie bota',
      opis: `**Bot:** <@${wpis.targetId}> (\`${wpis.targetId}\`)\n**Dodał:** <@${sprawcaId}>\n**Wynik:** ${wynik}`,
      kolor: kolory.blad,
      kanal: 'logiAntynuke',
      stopka: 'Dodaj osobę do whitelisty (/antynuke whitelist-dodaj), jeśli bot był zaufany.',
    });
    return;
  }

  const typ = TYPY[wpis.action];
  if (!typ) return;
  if (typ === 'kanalUsun' && wpis.target && typeof wpis.target.isThread === 'function') zapamietajKanal(wpis.target);

  const teraz = Date.now();
  const akcja = { typ, targetId: wpis.targetId, czas: teraz };

  // Sprawca już ukarany - każdą kolejną akcję cofamy od razu
  const ukaranyO = ukarani.get(sprawcaId);
  if (ukaranyO && teraz - ukaranyO < CZAS_BLOKADY_UKARANEGO_MS) {
    setTimeout(() => przywroc(guild, [akcja]).catch(() => {}), OPOZNIENIE_PRZYWRACANIA_MS);
    return;
  }

  const lista = (akcje.get(sprawcaId) || []).filter(a => teraz - a.czas <= config.antynuke.oknoMs);
  lista.push(akcja);
  akcje.set(sprawcaId, lista);

  const ileTegoTypu = lista.filter(a => a.typ === typ).length;
  if (ileTegoTypu < config.antynuke.progi[typ]) return;

  ukarani.set(sprawcaId, teraz);
  akcje.delete(sprawcaId);

  const wynikKary = await ukarz(guild, sprawcaId, typ);
  // Chwila opóźnienia, żeby zdarzenia channelDelete/roleDelete zdążyły zapisać zrzuty
  await new Promise(r => setTimeout(r, OPOZNIENIE_PRZYWRACANIA_MS));
  const w = await przywroc(guild, lista).catch((e) => { console.error('[antynuke] przywracanie', e); return null; });

  const podsumowanie = lista.reduce((acc, a) => { acc[a.typ] = (acc[a.typ] || 0) + 1; return acc; }, {});
  await log(guild.client, {
    tytul: 'ANTYNUKE — wykryto próbę zniszczenia serwera',
    opis:
      `**Sprawca:** <@${sprawcaId}> (\`${sprawcaId}\`)\n` +
      `**Wyzwalacz:** ${NAZWY_TYPOW[typ]}\n` +
      `**Akcje w oknie ${config.antynuke.oknoMs / 1000}s:** ${Object.entries(podsumowanie).map(([t, n]) => `${NAZWY_TYPOW[t]} ×${n}`).join(', ')}\n` +
      `**Kara:** ${wynikKary}\n` +
      (w ? `**Przywrócono:** odbanowani ${w.odbanowani}, odtworzone kanały ${w.odtworzoneKanaly}, usunięte spam-kanały ${w.usunieteKanaly}, odtworzone role ${w.odtworzoneRole}` : '**Przywracanie:** błąd — sprawdź konsolę'),
    kolor: kolory.blad,
    kanal: 'logiAntynuke',
    stopka: 'Wyrzuconych (kick) nie da się cofnąć automatycznie. Odtworzone role trzeba ponownie nadać członkom.',
  });
  await pingStaffu(guild.client, '— **antynuke zareagował**, sprawdź log powyżej.');
}

// ---- Anty-raid (masowe wbijanie) --------------------------------------

const dolaczenia = [];           // [{ id, czas, wiekKonta }]
let trybRaiduDo = 0;
let timerKoncaRaidu = null;

function trybRaiduAktywny() {
  return Date.now() < trybRaiduDo;
}

function ustawTrybRaidu(client, wlacz) {
  clearTimeout(timerKoncaRaidu);
  if (!wlacz) {
    trybRaiduDo = 0;
    return;
  }
  trybRaiduDo = Date.now() + config.antyraid.czasTrybuMs;
  timerKoncaRaidu = setTimeout(() => {
    trybRaiduDo = 0;
    log(client, {
      tytul: 'Anty-raid — tryb wyłączony',
      opis: 'Minął czas trybu anty-raid. Nowi członkowie mogą znów dołączać.',
      kolor: kolory.sukces,
      kanal: 'logiAntynuke',
    });
  }, config.antyraid.czasTrybuMs);
}

async function wyrzucRaidera(member, powod) {
  await member.send(
    'Serwer **Sojuszu Narodów Zjednoczonych** jest chwilowo w trybie ochrony przed raidem. Spróbuj dołączyć ponownie za kilka minut.'
  ).catch(() => null);
  return member.kick(powod).then(() => true).catch(() => false);
}

async function obsluzDolaczenie(member) {
  if (!config.antyraid.wlaczony || member.user.bot) return;
  if (config.guildId && member.guild.id !== config.guildId) return;
  const client = member.client;
  const teraz = Date.now();

  if (trybRaiduAktywny()) {
    await wyrzucRaidera(member, 'Anty-raid: serwer w trybie ochrony');
    return;
  }

  const minWiekMs = config.antyraid.minWiekKontaDni * 24 * 60 * 60 * 1000;
  dolaczenia.push({ id: member.id, czas: teraz, mlodeKonto: teraz - member.user.createdTimestamp < minWiekMs });
  while (dolaczenia.length && teraz - dolaczenia[0].czas > config.antyraid.oknoMs) dolaczenia.shift();

  if (dolaczenia.length < config.antyraid.progDolaczen) return;

  // Wykryto falę dołączeń
  const fala = dolaczenia.splice(0);
  ustawTrybRaidu(client, true);

  let wyrzuceni = 0;
  for (const d of fala.filter(d => d.mlodeKonto)) {
    const m = await member.guild.members.fetch(d.id).catch(() => null);
    if (m && await wyrzucRaidera(m, 'Anty-raid: młode konto w fali dołączeń')) wyrzuceni++;
  }

  await log(client, {
    tytul: 'ANTY-RAID — wykryto masowe wbijanie',
    opis:
      `**Dołączeń:** ${fala.length} w ${config.antyraid.oknoMs / 1000}s\n` +
      `**Wyrzucone młode konta (< ${config.antyraid.minWiekKontaDni} dni):** ${wyrzuceni}\n` +
      `**Tryb anty-raid:** włączony na ${Math.round(config.antyraid.czasTrybuMs / 60000)} min — każdy nowy członek będzie wyrzucany.\n\n` +
      `Wyłączenie ręczne: \`/antynuke raid stan:wyłącz\``,
    kolor: kolory.blad,
    kanal: 'logiAntynuke',
  });
  await pingStaffu(client, '— **wykryto raid**, serwer przeszedł w tryb ochrony.');
}

function status() {
  return {
    antynuke: config.antynuke.wlaczony,
    antyraid: config.antyraid.wlaczony,
    trybRaidu: trybRaiduAktywny(),
    trybRaiduDo,
  };
}

function rejestruj() {}

module.exports = {
  rejestruj,
  obsluzWpisAudytu,
  obsluzDolaczenie,
  zapamietajKanal,
  zapamietajRole,
  jestNaWhiteliscie,
  dodajDoWhitelisty,
  usunZWhitelisty,
  listaWhitelisty,
  ustawTrybRaidu,
  status,
};
