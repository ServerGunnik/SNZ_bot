// Blokada uprawnień dodanych botów.
// Każdy nowo dodany bot (niezależnie od tego, kto go dodał) od razu traci wszystkie uprawnienia swojej roli.
// Zmienić je może wyłącznie właściciel serwera - ręcznie w ustawieniach roli albo komendą /bot-uprawnienia.
// Zmiany robione przez kogokolwiek innego (uprawnienia roli bota, nadane mu role, nadpisania na kanałach)
// są od razu cofane. Źródłem prawdy o sprawcy jest dziennik zdarzeń (guildAuditLogEntryCreate).
const { AuditLogEvent, PermissionsBitField } = require('discord.js');
const db = require('../database/db.js');
const config = require('../config.js');
const { log } = require('../utils/logger.js');
const kolory = require('../utils/kolory.js');

const q = {
  pobierz: db.prepare('SELECT * FROM boty_uprawnienia WHERE bot_id = ?'),
  poRoli: db.prepare('SELECT * FROM boty_uprawnienia WHERE rola_id = ?'),
  wszystkie: db.prepare('SELECT * FROM boty_uprawnienia ORDER BY data DESC'),
  zapewnij: db.prepare("INSERT OR IGNORE INTO boty_uprawnienia (bot_id, dozwolone, data) VALUES (?, '0', ?)"),
  ustawRole: db.prepare("UPDATE boty_uprawnienia SET rola_id = ?, pierwotne = ?, dozwolone = '0', data = ? WHERE bot_id = ?"),
  ustawDozwolone: db.prepare('UPDATE boty_uprawnienia SET dozwolone = ? WHERE bot_id = ?'),
  ustawDodal: db.prepare('UPDATE boty_uprawnienia SET dodal = ? WHERE bot_id = ?'),
  stan: db.prepare('SELECT wartosc FROM stan WHERE klucz = ?'),
  ustawStan: db.prepare('INSERT OR IGNORE INTO stan (klucz, wartosc) VALUES (?, ?)'),
};

const POWOD = 'Blokada botów: uprawnienia bota zmienia tylko właściciel serwera';
const STOPKA = 'Uprawnienia botów zmienia tylko właściciel serwera (ręcznie lub /bot-uprawnienia).';

function aktywna(guild) {
  if (!config.antynuke.blokadaUprawnienBotow || !guild) return false;
  return !config.guildId || guild.id === config.guildId;
}

const toNaszBot = (guild, id) => id === guild.client.user.id;
const kto = (id) => (id ? `<@${id}>` : '_nieznany (zmiana z czasu, gdy SNZ_bot był wyłączony)_');

function nazwyUprawnien(bity) {
  const lista = new PermissionsBitField(BigInt(bity || 0)).toArray();
  if (!lista.length) return '_brak_';
  const tekst = lista.join(', ');
  return tekst.length > 900 ? `${tekst.slice(0, 900)}…` : tekst;
}

// ---- Blokowanie nowego bota --------------------------------------------

async function powiadomWlasciciela(guild, opis) {
  const wlasciciel = await guild.client.users.fetch(guild.ownerId).catch(() => null);
  await wlasciciel?.send(
    `**${guild.name || 'Serwer'}** — ${opis}\n` +
    'Tylko Ty możesz mu nadać uprawnienia: ręcznie w ustawieniach roli bota albo komendą `/bot-uprawnienia przywroc`.'
  ).catch(() => null);
}

// Rola zarządzana bota (tworzona przez Discorda przy dodaniu) - zerujemy jej uprawnienia
async function zablokujRole(rola) {
  const guild = rola?.guild;
  const botId = rola?.tags?.botId;
  if (!botId || !aktywna(guild) || toNaszBot(guild, botId)) return null;
  q.zapewnij.run(botId, Date.now());
  // Ta sama rola już zablokowana (roleCreate i guildMemberAdd przychodzą razem) - nic nie robimy
  if (q.pobierz.get(botId).rola_id === rola.id) return q.pobierz.get(botId);

  const pierwotne = rola.permissions.bitfield;
  q.ustawRole.run(rola.id, pierwotne.toString(), Date.now(), botId);
  const ok = pierwotne === 0n || await rola.setPermissions(0n, POWOD).then(() => true).catch(() => false);
  const zapis = q.pobierz.get(botId);

  await log(guild.client, {
    tytul: 'Blokada botów — nowy bot bez uprawnień',
    opis:
      `**Bot:** <@${botId}> (\`${botId}\`)\n` +
      `**Rola bota:** <@&${rola.id}>\n` +
      (zapis.dodal ? `**Dodał:** <@${zapis.dodal}>\n` : '') +
      `**Prosił o uprawnienia:** ${nazwyUprawnien(pierwotne)}\n` +
      `**Odebrano:** ${ok ? 'tak' : 'NIE — rola bota jest wyżej niż rola SNZ_bot albo bot nie ma „Zarządzanie rolami”'}`,
    kolor: ok ? kolory.ostrzezenie : kolory.blad,
    kanal: 'logiAntynuke',
    stopka: STOPKA,
  });
  await powiadomWlasciciela(guild, `dodano bota <@${botId}>. ${ok ? 'Odebrałem mu wszystkie uprawnienia.' : 'Nie udało się odebrać mu uprawnień — sprawdź kolejność ról!'}`);
  return zapis;
}

// Bot wszedł na serwer: blokada jego roli + zdjęcie zwykłych ról, jeśli jakieś dostał
async function obsluzDolaczenie(member) {
  const guild = member.guild;
  if (!member.user?.bot || !aktywna(guild) || toNaszBot(guild, member.id)) return;
  let rola = guild.roles.botRoleFor(member.user);
  if (!rola) {
    await guild.roles.fetch().catch(() => null);
    rola = guild.roles.botRoleFor(member.user);
  }
  if (rola) await zablokujRole(rola);
  else q.zapewnij.run(member.id, Date.now()); // bot bez roli (nie prosił o uprawnienia) - i tak go pilnujemy

  const zwykle = [...member.roles.cache.filter(r => !r.managed && r.id !== guild.id).keys()];
  if (zwykle.length) await member.roles.remove(zwykle, POWOD).catch(() => null);
}

// ---- Pilnowanie zmian (dziennik zdarzeń) -------------------------------

function nadpisanieZBitow(allow, deny) {
  const opcje = {};
  for (const f of new PermissionsBitField(BigInt(allow || 0)).toArray()) opcje[f] = true;
  for (const f of new PermissionsBitField(BigInt(deny || 0)).toArray()) opcje[f] = false;
  return opcje;
}

async function cofnijUprawnieniaRoli(wpis, guild, zapis) {
  const zmiana = (wpis.changes || []).find(z => z.key === 'permissions');
  if (!zmiana) return;
  if (wpis.executorId === guild.ownerId) {
    q.ustawDozwolone.run(String(zmiana.new ?? 0), zapis.bot_id);
    await log(guild.client, {
      tytul: 'Blokada botów — właściciel zmienił uprawnienia bota',
      opis: `**Bot:** <@${zapis.bot_id}>\n**Rola:** <@&${zapis.rola_id}>\n**Teraz:** ${nazwyUprawnien(zmiana.new)}`,
      kolor: kolory.info,
      kanal: 'logiAntynuke',
    });
    return;
  }
  const rola = guild.roles.cache.get(zapis.rola_id) || await guild.roles.fetch(zapis.rola_id).catch(() => null);
  const ok = rola
    ? await rola.setPermissions(BigInt(zapis.dozwolone), POWOD).then(() => true).catch(() => false)
    : false;
  await log(guild.client, {
    tytul: 'Blokada botów — cofnięto zmianę uprawnień bota',
    opis:
      `**Zmienił:** ${kto(wpis.executorId)}\n**Bot:** <@${zapis.bot_id}>\n**Rola:** <@&${zapis.rola_id}>\n` +
      `**Próbował ustawić:** ${nazwyUprawnien(zmiana.new)}\n**Cofnięto:** ${ok ? 'tak' : 'nie (rola bota wyżej niż rola SNZ_bot?)'}`,
    kolor: kolory.blad,
    kanal: 'logiAntynuke',
    stopka: STOPKA,
  });
}

async function cofnijNadanieRol(wpis, guild, zapis) {
  const dodane = (wpis.changes || []).filter(z => z.key === '$add').flatMap(z => z.new || []).map(r => r.id);
  if (!dodane.length) return;
  const bot = await guild.members.fetch(zapis.bot_id).catch(() => null);
  const ok = bot ? await bot.roles.remove(dodane, POWOD).then(() => true).catch(() => false) : false;
  await log(guild.client, {
    tytul: 'Blokada botów — cofnięto nadanie roli botowi',
    opis:
      `**Nadał:** <@${wpis.executorId}>\n**Bot:** <@${zapis.bot_id}>\n**Role:** ${dodane.map(id => `<@&${id}>`).join(', ')}\n` +
      `**Cofnięto:** ${ok ? 'tak' : 'nie (bot ma za niską rolę?)'}`,
    kolor: kolory.blad,
    kanal: 'logiAntynuke',
    stopka: STOPKA,
  });
}

async function cofnijNadpisanie(wpis, guild, zapis, celId) {
  const kanal = guild.channels.cache.get(wpis.targetId) || await guild.channels.fetch(wpis.targetId).catch(() => null);
  if (!kanal?.permissionOverwrites) return;
  const stara = (klucz) => (wpis.changes || []).find(z => z.key === klucz)?.old;
  let ok;
  if (wpis.action === AuditLogEvent.ChannelOverwriteCreate) {
    ok = await kanal.permissionOverwrites.delete(celId, POWOD).then(() => true).catch(() => false);
  } else {
    // Zmiana albo usunięcie nadpisania - przywracamy poprzednie wartości
    const obecne = kanal.permissionOverwrites.cache?.get(celId);
    const allow = stara('allow') ?? obecne?.allow?.bitfield ?? 0;
    const deny = stara('deny') ?? obecne?.deny?.bitfield ?? 0;
    const typ = celId === zapis.bot_id ? 1 : 0; // OverwriteType: 0 rola, 1 członek
    ok = await kanal.permissionOverwrites.create(celId, nadpisanieZBitow(allow, deny), { type: typ, reason: POWOD })
      .then(() => true).catch(() => false);
  }
  await log(guild.client, {
    tytul: 'Blokada botów — cofnięto uprawnienia bota na kanale',
    opis:
      `**Zmienił:** <@${wpis.executorId}>\n**Bot:** <@${zapis.bot_id}>\n**Kanał:** <#${wpis.targetId}>\n` +
      `**Cofnięto:** ${ok ? 'tak' : 'nie (brak uprawnień SNZ_bot do kanału?)'}`,
    kolor: kolory.blad,
    kanal: 'logiAntynuke',
    stopka: STOPKA,
  });
}

const NADPISANIA = new Set([
  AuditLogEvent.ChannelOverwriteCreate,
  AuditLogEvent.ChannelOverwriteUpdate,
  AuditLogEvent.ChannelOverwriteDelete,
]);

async function obsluzWpisAudytu(wpis, guild) {
  if (!aktywna(guild)) return;
  const sprawcaId = wpis.executorId;

  if (wpis.action === AuditLogEvent.BotAdd) {
    if (!wpis.targetId || toNaszBot(guild, wpis.targetId)) return;
    q.zapewnij.run(wpis.targetId, Date.now());
    q.ustawDodal.run(sprawcaId || null, wpis.targetId);
    return;
  }

  // Zmiany robione przez SNZ_bot (np. sama blokada) i właściciela nie są cofane
  if (!sprawcaId || toNaszBot(guild, sprawcaId)) return;

  if (wpis.action === AuditLogEvent.RoleUpdate) {
    const zapis = q.poRoli.get(wpis.targetId);
    if (zapis) await cofnijUprawnieniaRoli(wpis, guild, zapis);
    return;
  }
  if (sprawcaId === guild.ownerId) return;

  if (wpis.action === AuditLogEvent.MemberRoleUpdate) {
    const zapis = q.pobierz.get(wpis.targetId);
    if (zapis) await cofnijNadanieRol(wpis, guild, zapis);
    return;
  }
  if (NADPISANIA.has(wpis.action)) {
    const celId = wpis.extra?.id;
    const zapis = celId && (q.pobierz.get(celId) || q.poRoli.get(celId));
    if (zapis) await cofnijNadpisanie(wpis, guild, zapis, celId);
  }
}

// ---- Po uruchomieniu: zmiany i nowe boty z czasu, gdy SNZ_bot był wyłączony ----

async function sprawdzPoUruchomieniu(client) {
  if (!config.antynuke.blokadaUprawnienBotow) return;
  // Boty, które już były na serwerze przed włączeniem blokady, zostają nietknięte
  q.ustawStan.run('blokada_botow_od', String(Date.now()));
  const od = Number(q.stan.get('blokada_botow_od').wartosc);

  for (const guild of client.guilds.cache.values()) {
    if (!aktywna(guild)) continue;
    await guild.roles.fetch().catch(() => null);

    // Boty dodane, gdy SNZ_bot był wyłączony
    const dodane = await guild.fetchAuditLogs({ type: AuditLogEvent.BotAdd, limit: 50 }).catch(() => null);
    for (const wpis of dodane?.entries.values() || []) {
      if (wpis.createdTimestamp <= od || toNaszBot(guild, wpis.targetId) || q.pobierz.get(wpis.targetId)?.rola_id) continue;
      q.zapewnij.run(wpis.targetId, Date.now());
      q.ustawDodal.run(wpis.executorId || null, wpis.targetId);
      const rola = guild.roles.cache.find(r => r.tags?.botId === wpis.targetId);
      if (rola) await zablokujRole(rola);
    }

    // Uprawnienia ról botów zmienione, gdy SNZ_bot był wyłączony
    let zmianyRol = null;
    for (const zapis of q.wszystkie.all().filter(z => z.rola_id)) {
      const rola = guild.roles.cache.get(zapis.rola_id);
      if (!rola || rola.permissions.bitfield === BigInt(zapis.dozwolone)) continue;
      zmianyRol ??= await guild.fetchAuditLogs({ type: AuditLogEvent.RoleUpdate, limit: 100 }).catch(() => null);
      const ostatnia = zmianyRol?.entries.find(w => w.targetId === rola.id && (w.changes || []).some(z => z.key === 'permissions'));
      if (ostatnia?.executorId === guild.ownerId) {
        q.ustawDozwolone.run(rola.permissions.bitfield.toString(), zapis.bot_id);
        continue;
      }
      await cofnijUprawnieniaRoli({
        executorId: ostatnia?.executorId || null,
        changes: [{ key: 'permissions', old: zapis.dozwolone, new: rola.permissions.bitfield.toString() }],
      }, guild, zapis);
    }
  }
}

// ---- Komenda właściciela -----------------------------------------------

// Nadaje roli bota uprawnienia, o które prosił przy dodaniu (albo podane przez właściciela)
async function przywroc(guild, botId) {
  const zapis = q.pobierz.get(botId);
  if (!zapis?.rola_id) return { blad: 'Ten bot nie jest objęty blokadą (albo nie ma własnej roli).' };
  const rola = guild.roles.cache.get(zapis.rola_id) || await guild.roles.fetch(zapis.rola_id).catch(() => null);
  if (!rola) return { blad: 'Rola tego bota już nie istnieje (bot opuścił serwer?).' };
  const bity = BigInt(zapis.pierwotne || 0);
  q.ustawDozwolone.run(bity.toString(), botId);
  const ok = await rola.setPermissions(bity, 'Blokada botów: właściciel przywrócił uprawnienia').then(() => true).catch((e) => e.message);
  if (ok !== true) {
    q.ustawDozwolone.run(zapis.dozwolone, botId);
    return { blad: `Nie udało się ustawić uprawnień: ${ok}` };
  }
  return { rola, uprawnienia: nazwyUprawnien(bity) };
}

// Obejmuje blokadą bota, który był na serwerze wcześniej
async function zablokuj(guild, member) {
  const rola = guild.roles.botRoleFor(member.user);
  q.zapewnij.run(member.id, Date.now());
  if (!rola) return { rola: null };
  const zapis = await zablokujRole(rola);
  // Rola była już zablokowana - wyzeruj ponownie
  if (zapis && rola.permissions.bitfield !== 0n) {
    q.ustawDozwolone.run('0', member.id);
    await rola.setPermissions(0n, POWOD).catch(() => null);
  }
  return { rola };
}

function lista() {
  return q.wszystkie.all();
}

function rejestruj() {}

module.exports = {
  rejestruj,
  zablokujRole,
  obsluzDolaczenie,
  obsluzWpisAudytu,
  sprawdzPoUruchomieniu,
  przywroc,
  zablokuj,
  lista,
  nazwyUprawnien,
};
