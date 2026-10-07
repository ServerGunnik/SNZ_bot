// Ochrona kanałów: usunięcie dowolnego kanału = odebranie rang + wyciszenie sprawcy
// (poza właścicielem, botem i technikiem). Model identyczny jak ochrona logów;
// opcjonalnie kanał jest odtwarzany ze zrzutu zapisanego przez antynuke.
const { AuditLogEvent } = require('discord.js');
const db = require('../database/db.js');
const config = require('../config.js');
const karty = require('../utils/karty.js');
const { log } = require('../utils/logger.js');
const kolory = require('../utils/kolory.js');
const antynuke = require('./antynuke.js');
const ochronaLogow = require('./ochrona-logow.js');
const backupWiadomosci = require('./backup-wiadomosci.js');

const OPOZNIENIE_AUDYTU_MS = 1500;
const BLOKADA_PONOWNEJ_KARY_MS = 60 * 1000;

const q = {
  zapiszRole: db.prepare('INSERT INTO odebrane_role (user_id, role, powod, data) VALUES (?, ?, ?, ?)'),
};

const licznikiAudytu = new Map(); // id wpisu audytu -> count (Discord łączy serie usunięć w jeden wpis)
const ostatniaKara = new Map();   // userId -> czas (chroni przed podwójną karą za serię usunięć)

function zwolniony(guild, userId) {
  return userId === guild.ownerId || userId === guild.client.user.id || config.technicy.includes(userId);
}

async function zapamietajLiczniki(guild) {
  const logi = await guild.fetchAuditLogs({ type: AuditLogEvent.ChannelDelete, limit: 50 }).catch(() => null);
  for (const wpis of logi?.entries.values() || []) licznikiAudytu.set(wpis.id, wpis.extra?.count ?? 1);
}

// Szuka nowego (albo powiększonego) wpisu usunięcia kanału
async function znajdzSprawce(guild, kanalId) {
  await new Promise(r => setTimeout(r, OPOZNIENIE_AUDYTU_MS));
  const logi = await guild.fetchAuditLogs({ type: AuditLogEvent.ChannelDelete, limit: 10 }).catch(() => null);
  for (const wpis of logi?.entries.values() || []) {
    if (wpis.targetId !== kanalId) continue;
    const licznik = wpis.extra?.count ?? 1;
    const poprzedni = licznikiAudytu.get(wpis.id);
    licznikiAudytu.set(wpis.id, licznik);
    const nowy = poprzedni === undefined && Date.now() - wpis.createdTimestamp < 5 * 60 * 1000;
    if (nowy || (poprzedni !== undefined && licznik > poprzedni)) return wpis.executorId;
  }
  return null;
}

async function wyslijDm(client, userId, payload) {
  const user = await client.users.fetch(userId).catch(() => null);
  return user ? user.send(payload).then(() => true).catch(() => false) : false;
}

async function ukarz(guild, sprawcaId, kanal) {
  const teraz = Date.now();
  if (teraz - (ostatniaKara.get(sprawcaId) || 0) < BLOKADA_PONOWNEJ_KARY_MS) return;
  ostatniaKara.set(sprawcaId, teraz);

  const powod = `Usunięcie kanału #${kanal.name}`;
  const czlonek = await guild.members.fetch(sprawcaId).catch(() => null);
  const najwyzszaBota = guild.members.me?.roles.highest.position ?? 0;
  let odebrane = [];
  let nieOdebrane = [];
  let wyciszenie = 'nie (osoby nie ma na serwerze)';

  if (czlonek) {
    const role = czlonek.roles.cache.filter(r => r.id !== guild.id && !r.managed);
    const doZdjecia = role.filter(r => r.position < najwyzszaBota);
    nieOdebrane = role.filter(r => r.position >= najwyzszaBota).map(r => r.name);
    if (doZdjecia.size) {
      const ok = await czlonek.roles.remove([...doZdjecia.keys()], powod).then(() => true).catch((e) => {
        console.error('[ochrona-kanalow] odebranie ról', e.message);
        return false;
      });
      if (ok) {
        odebrane = doZdjecia.map(r => r.name);
        q.zapiszRole.run(sprawcaId, JSON.stringify([...doZdjecia.keys()]), powod, teraz);
      } else {
        nieOdebrane.push(...doZdjecia.map(r => r.name));
      }
    }
    wyciszenie = await czlonek.timeout(config.ochronaKanalow.wyciszenieMs, powod)
      .then(() => `tak, ${Math.round(config.ochronaKanalow.wyciszenieMs / 60000)} min`)
      .catch((e) => `nie udało się (${e.message})`);
  }

  return { odebrane, nieOdebrane, wyciszenie };
}

// Po odtworzeniu kanału jego ID się zmienia - uaktualniamy aliasy w config.kanaly w pamięci,
// żeby ochronaLogow.chronionyKanal() i log() dalej celowały we właściwy kanał (do następnego restartu).
function podmienAliasyKanalu(staryId, nowyId) {
  if (!staryId || !nowyId) return;
  for (const [klucz, wartosc] of Object.entries(config.kanaly)) {
    if (wartosc === staryId) config.kanaly[klucz] = nowyId;
  }
}

async function obsluzUsuniecieKanalu(kanal) {
  if (!config.ochronaKanalow.wlaczona) return;
  if (!kanal?.guild || kanal.isThread?.()) return;

  const sprawcaId = await znajdzSprawce(kanal.guild, kanal.id);
  // Bot kasuje własne kanały (tickety, sprawy itd.) - jego własnych kasacji nie logujemy
  if (!sprawcaId || sprawcaId === kanal.client.user.id) return;

  const staryId = kanal.id;
  const bylLogiem = ochronaLogow.chronionyKanal(staryId);
  const nazwaKategorii = kanal.parent?.name;
  const infoKanalu = `**Kanał:** #${kanal.name} (\`${staryId}\`)${nazwaKategorii ? `\n**Kategoria:** ${nazwaKategorii}` : ''}`;
  const czyZwolniony = zwolniony(kanal.guild, sprawcaId);

  // Właściciel/technik ma pełne uprawnienia - kanał zostaje usunięty, bot tylko loguje fakt
  if (czyZwolniony) {
    await log(kanal.client, {
      tytul: 'Usunięto kanał',
      opis: `${infoKanalu}\n**Usunął:** <@${sprawcaId}>`,
      kolor: kolory.ostrzezenie,
      kanal: 'logi',
    });
    return;
  }

  // Nie-zwolniony sprawca - odtwarzamy kanał i historię jeśli ochrona włączona
  const odtwarzamy = config.ochronaKanalow.odtwarzaj;
  const nowyKanal = odtwarzamy
    ? (await antynuke.odtworzKanaly(kanal.guild, [staryId]).catch((e) => {
        console.error('[ochrona-kanalow] odtworzenie kanału', e.message);
        return null;
      }))?.get(staryId) || null
    : null;

  // Historia logów bota (components v2, stealth) i backup zwykłych wiadomości (webhook)
  let historiaLogow = { odtworzonych: 0, wTranskrypcie: 0 };
  let historiaWiadomosci = { odtworzonych: 0, wTranskrypcie: 0 };
  if (nowyKanal) {
    if (bylLogiem) {
      podmienAliasyKanalu(staryId, nowyKanal.id);
      historiaLogow = await ochronaLogow.odtworzHistorieKanalu(nowyKanal, staryId).catch((e) => {
        console.error('[ochrona-kanalow] odtworzenie historii logów', e.message);
        return { odtworzonych: 0, wTranskrypcie: 0 };
      });
    }
    historiaWiadomosci = await backupWiadomosci.odtworzWiadomosciNaKanale(nowyKanal, staryId).catch((e) => {
      console.error('[ochrona-kanalow] odtworzenie wiadomości', e.message);
      return { odtworzonych: 0, wTranskrypcie: 0 };
    });
  }

  const liniaHistorii = (bylLogiem || historiaWiadomosci.odtworzonych || historiaWiadomosci.wTranskrypcie)
    ? `\n**Historia:** odtworzono ${historiaLogow.odtworzonych + historiaWiadomosci.odtworzonych} wiadomości` +
      ((historiaLogow.wTranskrypcie + historiaWiadomosci.wTranskrypcie)
        ? `, ${historiaLogow.wTranskrypcie + historiaWiadomosci.wTranskrypcie} w transkrypcie`
        : '')
    : '';

  // Nie-zwolniony sprawca - kara + alert + DM
  const wynik = await ukarz(kanal.guild, sprawcaId, kanal);
  if (!wynik) return;

  const szczegoly =
    `${infoKanalu}\n` +
    `**Odtworzony:** ${nowyKanal ? 'tak' : (config.ochronaKanalow.odtwarzaj ? 'nie (brak zrzutu albo błąd)' : 'wyłączone w configu')}` +
    liniaHistorii +
    `\n**Odebrane rangi:** ${wynik.odebrane.length ? wynik.odebrane.join(', ') : '_brak_'}` +
    (wynik.nieOdebrane.length ? `\n**Nie udało się odebrać (rola wyżej niż bot):** ${wynik.nieOdebrane.join(', ')}` : '') +
    `\n**Wyciszenie:** ${wynik.wyciszenie}`;

  await wyslijDm(kanal.client, sprawcaId, karty.kartaBlad('Odebrano Ci rangę',
    `Usunąłeś kanał na serwerze **${kanal.guild.name}**. Usuwanie kanałów jest zabronione.\n\n${szczegoly}\n\n` +
    'Sprawa trafiła do właściciela serwera i technika.'));

  const alert = karty.kartaBlad('Ktoś usunął kanał',
    `**Sprawca:** <@${sprawcaId}> (\`${sprawcaId}\`)\n${szczegoly}\n\n` +
    'Role można przywrócić komendą `/przywroc-role`.');
  const odbiorcy = new Set([kanal.guild.ownerId, ...config.technicy]);
  for (const id of odbiorcy) await wyslijDm(kanal.client, id, alert);

  await log(kanal.client, {
    tytul: 'Ochrona kanałów — usunięto kanał',
    opis: `**Sprawca:** <@${sprawcaId}>\n${szczegoly}`,
    kolor: kolory.blad,
    kanal: 'logiAntynuke',
  });
}

function uruchomOchrone(client) {
  const guild = config.guildId ? client.guilds.cache.get(config.guildId) : client.guilds.cache.first();
  if (guild) zapamietajLiczniki(guild).catch(() => {});
}

function rejestruj() {}

module.exports = { rejestruj, obsluzUsuniecieKanalu, uruchomOchrone, zapamietajLiczniki };
