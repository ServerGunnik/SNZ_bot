// Ochrona logów: bot trzyma kopię każdej swojej wiadomości na kanałach logów.
// Gdy ktoś usunie log: log wraca na kanał, a sprawca (poza właścicielem serwera i technikiem)
// traci rangi, dostaje wyciszenie i wiadomość prywatną; właściciel i technik dostają alert.
const { AuditLogEvent, MessageFlags, AttachmentBuilder } = require('discord.js');
const PRZYWROCONYCH_WIADOMOSCI_NA_KANAL = 200;
const db = require('../database/db.js');
const config = require('../config.js');
const karty = require('../utils/karty.js');
const { log } = require('../utils/logger.js');
const kolory = require('../utils/kolory.js');

const DZIEN_MS = 24 * 60 * 60 * 1000;
const OPOZNIENIE_AUDYTU_MS = 1500;
const BLOKADA_PONOWNEJ_KARY_MS = 60 * 1000;

const q = {
  zapisz: db.prepare('INSERT OR REPLACE INTO logi_kopie (wiadomosc_id, kanal_id, dane, pliki, data) VALUES (?, ?, ?, ?, ?)'),
  aktualizujDane: db.prepare('UPDATE logi_kopie SET dane = ? WHERE wiadomosc_id = ?'),
  kopia: db.prepare('SELECT * FROM logi_kopie WHERE wiadomosc_id = ?'),
  usunKopie: db.prepare('DELETE FROM logi_kopie WHERE wiadomosc_id = ?'),
  usunStare: db.prepare('DELETE FROM logi_kopie WHERE data < ?'),
  // Wszystkie kopie z danego kanału w kolejności chronologicznej - do odtworzenia po usunięciu całego kanału
  kopieKanalu: db.prepare('SELECT * FROM logi_kopie WHERE kanal_id = ? ORDER BY data ASC'),
  // Odnośniki do wiadomości w historii ticketów - po odtworzeniu wskazują na nową wiadomość
  podmienHistorie: db.prepare('UPDATE tickety SET historia_wiad_id = ? WHERE historia_wiad_id = ?'),
  zapiszRole: db.prepare('INSERT INTO odebrane_role (user_id, role, powod, data) VALUES (?, ?, ?, ?)'),
  ostatnieRole: db.prepare('SELECT * FROM odebrane_role WHERE user_id = ? AND przywrocone = 0 ORDER BY id DESC LIMIT 1'),
  przywrocone: db.prepare('UPDATE odebrane_role SET przywrocone = 1 WHERE id = ?'),
};

const licznikiAudytu = new Map(); // id wpisu audytu -> count (Discord łączy kolejne usunięcia w jeden wpis)
const ostatniaKara = new Map();   // userId -> czas
const odtwarzane = new Set();     // id wiadomości właśnie odtwarzanych

function kanalyLogow() {
  const k = config.kanaly;
  return new Set([k.logi, k.logiTickety, k.logiSad, k.logiPanstwa, k.logiAntynuke, k.logiWiadomosci, k.historiaTicketow].filter(Boolean));
}

function chronionyKanal(kanalId) {
  return config.ochronaLogow.wlaczona && kanalyLogow().has(kanalId);
}

function zwolniony(guild, userId) {
  return userId === guild.ownerId || userId === guild.client.user.id || config.technicy.includes(userId);
}

// ---- Kopie logów -------------------------------------------------------

function daneWiadomosci(wiadomosc) {
  return JSON.stringify({
    content: wiadomosc.content || '',
    flags: wiadomosc.flags?.bitfield ?? 0,
    components: wiadomosc.components.map(c => c.toJSON()),
  });
}

async function zapamietaj(wiadomosc) {
  if (!wiadomosc.guild || wiadomosc.author?.id !== wiadomosc.client.user.id || !chronionyKanal(wiadomosc.channelId)) return;
  const pliki = [];
  let rozmiar = 0;
  for (const z of wiadomosc.attachments.values()) {
    if (rozmiar + z.size > config.ochronaLogow.maxRozmiarZalacznikow) break;
    const dane = await fetch(z.url).then(r => (r.ok ? r.arrayBuffer() : null)).catch(() => null);
    if (!dane) continue;
    rozmiar += z.size;
    pliki.push({ name: z.name, base64: Buffer.from(dane).toString('base64') });
  }
  q.zapisz.run(wiadomosc.id, wiadomosc.channelId, daneWiadomosci(wiadomosc), JSON.stringify(pliki), Date.now());
}

// Edytowane logi (np. ocena dopisana do historii ticketu) - kopia trzyma najnowszą treść
function zaktualizuj(wiadomosc) {
  if (!wiadomosc.guild || wiadomosc.partial || wiadomosc.author?.id !== wiadomosc.client.user.id) return;
  if (!chronionyKanal(wiadomosc.channelId)) return;
  q.aktualizujDane.run(daneWiadomosci(wiadomosc), wiadomosc.id);
}

function czyChroniona(wiadomoscId) {
  return Boolean(q.kopia.get(wiadomoscId));
}

function wyczyscStareKopie() {
  q.usunStare.run(Date.now() - config.ochronaLogow.przechowujDni * DZIEN_MS);
}

// ---- Odtwarzanie -------------------------------------------------------

async function odtworz(kanal, kopia, sprawcaId, { stealth = false } = {}) {
  const dane = JSON.parse(kopia.dane);
  const pliki = JSON.parse(kopia.pliki || '[]').map(p => new AttachmentBuilder(Buffer.from(p.base64, 'base64'), { name: p.name }));
  const v2 = (dane.flags & MessageFlags.IsComponentsV2) === MessageFlags.IsComponentsV2;
  let payload;
  if (stealth) {
    // Replay bez plakietki „przywrócony" - używane przy odtwarzaniu całego kanału logów
    payload = v2
      ? { components: dane.components, flags: MessageFlags.IsComponentsV2 }
      : { content: dane.content || '', components: dane.components };
  } else {
    const notka = `♻️ Przywrócony log — usunięty${sprawcaId ? ` przez <@${sprawcaId}>` : ''} <t:${Math.floor(Date.now() / 1000)}:R>`;
    payload = v2
      ? { components: [{ type: 10, content: `-# ${notka}` }, ...dane.components], flags: MessageFlags.IsComponentsV2 }
      : { content: `-# ${notka}\n${dane.content}`.slice(0, 2000), components: dane.components };
  }
  const nowa = await kanal.send({ ...payload, files: pliki, allowedMentions: { parse: [] } }).catch((e) => {
    console.error('[ochrona-logow] nie udało się odtworzyć logu', kopia.wiadomosc_id, e.message);
    return null;
  });
  if (!nowa) return null;
  q.podmienHistorie.run(nowa.id, kopia.wiadomosc_id);
  q.usunKopie.run(kopia.wiadomosc_id);
  return nowa;
}

// Zbiera stringowy content z komponentów v2 (TextDisplay zagnieżdżone w kontenerach/sekcjach)
function tekstKomponentow(komponenty) {
  const wynik = [];
  for (const k of komponenty || []) {
    if (typeof k.content === 'string') wynik.push(k.content);
    if (k.components?.length) wynik.push(...tekstKomponentow(k.components));
  }
  return wynik;
}

// Odtwarza na nowo utworzonym kanale historię logów ze starego ID: 200 najnowszych jako wiadomości,
// resztę jako transkrypt .txt na końcu. Zwraca { odtworzonych, wTranskrypcie }.
async function odtworzHistorieKanalu(nowyKanal, staryKanalId) {
  const kopie = q.kopieKanalu.all(staryKanalId);
  if (!kopie.length) return { odtworzonych: 0, wTranskrypcie: 0 };

  const limit = PRZYWROCONYCH_WIADOMOSCI_NA_KANAL;
  const doTranskryptu = kopie.length > limit ? kopie.slice(0, kopie.length - limit) : [];
  const doPrzywrocenia = kopie.length > limit ? kopie.slice(-limit) : kopie;

  for (const k of doPrzywrocenia) {
    await odtworz(nowyKanal, k, null, { stealth: true }).catch(() => null);
  }

  if (doTranskryptu.length) {
    const linie = [];
    linie.push(`=== Starsza historia kanału #${nowyKanal.name} (${staryKanalId}) ===`);
    linie.push(`Odtworzono bezpośrednio: ${doPrzywrocenia.length} najnowszych wiadomości.`);
    linie.push(`W tym pliku: ${doTranskryptu.length} starszych wiadomości (najstarsze pierwsze).`);
    linie.push('');
    for (const k of doTranskryptu) {
      const czas = new Date(k.data).toISOString();
      const dane = JSON.parse(k.dane);
      const tekstKart = tekstKomponentow(dane.components);
      const tresc = (dane.content || tekstKart.join('\n')) || '[wiadomość bez treści tekstowej]';
      linie.push(`[${czas}]`);
      linie.push(tresc);
      linie.push('');
    }
    const buffer = Buffer.from(linie.join('\n'), 'utf8');
    const plik = new AttachmentBuilder(buffer, { name: `historia-${nowyKanal.name}-${Date.now()}.txt` });
    await nowyKanal.send({ files: [plik], allowedMentions: { parse: [] } }).catch(() => null);
    for (const k of doTranskryptu) q.usunKopie.run(k.wiadomosc_id);
  }

  return { odtworzonych: doPrzywrocenia.length, wTranskrypcie: doTranskryptu.length };
}

// ---- Kto usunął (dziennik zdarzeń) --------------------------------------

async function zapamietajLiczniki(guild) {
  for (const type of [AuditLogEvent.MessageDelete, AuditLogEvent.MessageBulkDelete]) {
    const logi = await guild.fetchAuditLogs({ type, limit: 50 }).catch(() => null);
    for (const wpis of logi?.entries.values() || []) licznikiAudytu.set(wpis.id, wpis.extra?.count ?? 1);
  }
}

// Szuka nowego (albo powiększonego) wpisu usunięcia pasującego do kanału logów
async function znajdzSprawce(guild, kanalId, masowo) {
  await new Promise(r => setTimeout(r, OPOZNIENIE_AUDYTU_MS));
  const type = masowo ? AuditLogEvent.MessageBulkDelete : AuditLogEvent.MessageDelete;
  const logi = await guild.fetchAuditLogs({ type, limit: 10 }).catch(() => null);
  for (const wpis of logi?.entries.values() || []) {
    const pasuje = masowo
      ? wpis.targetId === kanalId
      : wpis.targetId === guild.client.user.id && wpis.extra?.channel?.id === kanalId;
    if (!pasuje) continue;
    const licznik = wpis.extra?.count ?? 1;
    const poprzedni = licznikiAudytu.get(wpis.id);
    licznikiAudytu.set(wpis.id, licznik);
    const nowy = poprzedni === undefined && Date.now() - wpis.createdTimestamp < 5 * 60 * 1000;
    if (nowy || (poprzedni !== undefined && licznik > poprzedni)) return wpis.executorId;
  }
  return null;
}

// ---- Kara --------------------------------------------------------------

async function wyslijDm(client, userId, payload) {
  const user = await client.users.fetch(userId).catch(() => null);
  return user ? user.send(payload).then(() => true).catch(() => false) : false;
}

async function ukarz(guild, sprawcaId, kanal, ileLogow) {
  const teraz = Date.now();
  if (teraz - (ostatniaKara.get(sprawcaId) || 0) < BLOKADA_PONOWNEJ_KARY_MS) return;
  ostatniaKara.set(sprawcaId, teraz);

  const powod = `Usunięcie logów bota na kanale #${kanal.name}`;
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
        console.error('[ochrona-logow] odebranie ról', e.message);
        return false;
      });
      if (ok) {
        odebrane = doZdjecia.map(r => r.name);
        q.zapiszRole.run(sprawcaId, JSON.stringify([...doZdjecia.keys()]), powod, teraz);
      } else {
        nieOdebrane.push(...doZdjecia.map(r => r.name));
      }
    }
    // Wyciszenie po odebraniu ról - Discord nie pozwala wyciszyć administratora
    wyciszenie = await czlonek.timeout(config.ochronaLogow.wyciszenieMs, powod)
      .then(() => `tak, ${Math.round(config.ochronaLogow.wyciszenieMs / 60000)} min`)
      .catch((e) => `nie udało się (${e.message})`);
  }

  const szczegoly =
    `**Kanał:** <#${kanal.id}>\n**Usunięte logi:** ${ileLogow} (zostały przywrócone)\n` +
    `**Odebrane rangi:** ${odebrane.length ? odebrane.join(', ') : '_brak_'}` +
    (nieOdebrane.length ? `\n**Nie udało się odebrać (rola wyżej niż bot):** ${nieOdebrane.join(', ')}` : '') +
    `\n**Wyciszenie:** ${wyciszenie}`;

  await wyslijDm(guild.client, sprawcaId, karty.kartaBlad('Odebrano Ci rangę',
    `Usunąłeś log bota na serwerze **${guild.name}**. Usuwanie logów jest zabronione.\n\n${szczegoly}\n\n` +
    'Log został przywrócony, a sprawa trafiła do właściciela serwera i technika.'));

  const alert = karty.kartaBlad('Ktoś usunął log bota',
    `**Sprawca:** <@${sprawcaId}> (\`${sprawcaId}\`)\n${szczegoly}\n\n` +
    'Role można przywrócić komendą `/przywroc-role`.');
  const odbiorcy = new Set([guild.ownerId, ...config.technicy]);
  for (const id of odbiorcy) await wyslijDm(guild.client, id, alert);

  await log(guild.client, {
    tytul: 'Ochrona logów — usunięto log',
    opis: `**Sprawca:** <@${sprawcaId}>\n${szczegoly}`,
    kolor: kolory.blad,
    kanal: 'logiAntynuke',
  });
}

// ---- Obsługa zdarzeń ---------------------------------------------------

async function obsluzUsuniecia(guild, kanal, ids, masowo) {
  const kopie = ids.map(id => q.kopia.get(id)).filter(Boolean).filter(k => !odtwarzane.has(k.wiadomosc_id));
  if (!kopie.length) return;
  kopie.forEach(k => odtwarzane.add(k.wiadomosc_id));
  try {
    const sprawcaId = await znajdzSprawce(guild, kanal.id, masowo);
    // Najstarsze najpierw, żeby kolejność logów się nie zmieniła
    for (const kopia of kopie.sort((a, b) => a.data - b.data)) await odtworz(kanal, kopia, sprawcaId);
    if (sprawcaId && !zwolniony(guild, sprawcaId)) await ukarz(guild, sprawcaId, kanal, kopie.length);
  } finally {
    kopie.forEach(k => odtwarzane.delete(k.wiadomosc_id));
  }
}

async function obsluzUsuniecie(wiadomosc) {
  if (!wiadomosc.guild || !chronionyKanal(wiadomosc.channelId)) return;
  await obsluzUsuniecia(wiadomosc.guild, wiadomosc.channel, [wiadomosc.id], false);
}

async function obsluzMasoweUsuniecie(wiadomosci, kanal) {
  if (!kanal.guild || !chronionyKanal(kanal.id)) return;
  await obsluzUsuniecia(kanal.guild, kanal, [...wiadomosci.keys()], true);
}

// ---- Przywracanie ról (właściciel / technik) ----------------------------

async function przywrocRole(guild, userId) {
  const wpis = q.ostatnieRole.get(userId);
  if (!wpis) return { ok: false, powod: 'Brak zapisanych odebranych ról tej osoby.' };
  const czlonek = await guild.members.fetch(userId).catch(() => null);
  if (!czlonek) return { ok: false, powod: 'Tej osoby nie ma na serwerze.' };
  const role = JSON.parse(wpis.role).filter(id => guild.roles.cache.has(id));
  const ok = await czlonek.roles.add(role, 'Przywrócenie ról po karze za usunięcie logu').then(() => true).catch(() => false);
  if (!ok) return { ok: false, powod: 'Bot nie może nadać tych ról (rola bota musi być wyżej).' };
  await czlonek.timeout(null, 'Przywrócenie ról').catch(() => {});
  q.przywrocone.run(wpis.id);
  return { ok: true, role };
}

function uruchomOchrone(client) {
  wyczyscStareKopie();
  setInterval(wyczyscStareKopie, DZIEN_MS);
  const guild = config.guildId ? client.guilds.cache.get(config.guildId) : client.guilds.cache.first();
  if (guild) zapamietajLiczniki(guild).catch(() => {});
}

function rejestruj() {}

module.exports = {
  rejestruj, zapamietaj, zaktualizuj, czyChroniona, obsluzUsuniecie, obsluzMasoweUsuniecie,
  przywrocRole, uruchomOchrone, zapamietajLiczniki, chronionyKanal, odtworzHistorieKanalu,
};
