// Test dymny bota bez łączenia z Discordem: ładowanie plików, komendy, konfiguracja,
// karty, formularze (limity Discorda) oraz kluczowe przepływy na atrapach.
// Uruchomienie: npm test
process.env.SNZ_DB_PATH = ':memory:';
process.env.ROLA_STAFF = 'STAFF';
process.env.ROLA_ZWERYFIKOWANY = 'ZWER';
process.env.KANAL_LOGI = 'LOGI';
process.env.KANAL_HISTORIA_TICKETOW = 'HIST';
process.env.KANAL_LISTY_GONCZE = 'LG';
process.env.KANAL_POWITANIA = 'POW';

const fs = require('fs');
const path = require('path');
const { Collection, ModalBuilder, ChannelType, AuditLogEvent } = require('discord.js');

const KORZEN = path.join(__dirname, '..');
const wymagaj = (p) => require(path.join(KORZEN, p));

let bledy = 0;
let testy = 0;
function sprawdz(warunek, opis) {
  testy++;
  if (!warunek) {
    bledy++;
    console.error(`  ✗ ${opis}`);
  }
}
function sekcja(nazwa) {
  console.log(`• ${nazwa}`);
}
async function bezpiecznie(opis, fn) {
  try {
    await fn();
  } catch (e) {
    sprawdz(false, `${opis}: ${e.stack || e.message}`);
  }
}

// Logi trafiają do tablicy zamiast na Discorda
const logi = [];
const logger = wymagaj('utils/logger.js');
logger.log = async (_c, o) => { logi.push(o.tytul); };
logger.wyslij = async () => {};

const db = wymagaj('database/db.js');
const config = wymagaj('config.js');
const karty = wymagaj('utils/karty.js');

(async () => {
  // ---------------------------------------------------------------------
  sekcja('Ładowanie plików i komend');
  const handlery = {};
  const nazwyKomend = new Set();
  for (const katalog of ['utils', 'modules', 'handlers', 'events', 'commands']) {
    for (const plik of fs.readdirSync(path.join(KORZEN, katalog)).filter(f => f.endsWith('.js'))) {
      await bezpiecznie(`${katalog}/${plik}`, async () => {
        const m = wymagaj(`${katalog}/${plik}`);
        if (katalog === 'commands') {
          sprawdz(m.data && typeof m.execute === 'function', `${plik}: brak data/execute`);
          const json = m.data.toJSON();
          sprawdz(!nazwyKomend.has(json.name), `zdublowana komenda /${json.name}`);
          nazwyKomend.add(json.name);
        }
        if (katalog === 'events') sprawdz(m.name && typeof m.execute === 'function', `${plik}: brak name/execute`);
        if (katalog === 'modules' && typeof m.rejestruj === 'function') {
          m.rejestruj({
            zarejestruj: (prefix, h) => {
              sprawdz(!handlery[prefix], `zdublowany handler ${prefix}`);
              handlery[prefix] = h;
            },
          });
        }
      });
    }
  }
  const znajdz = (id) => {
    const seg = id.split(':');
    for (let i = seg.length; i > 0; i--) if (handlery[seg.slice(0, i).join(':')]) return handlery[seg.slice(0, i).join(':')];
    return null;
  };

  // ---------------------------------------------------------------------
  sekcja('Konfiguracja ticketów (limity Discorda)');
  const kategorie = config.tickety.kategorie;
  sprawdz(kategorie.length >= 1 && kategorie.length <= 25, 'liczba kategorii 1–25');
  sprawdz(new Set(kategorie.map(k => k.value)).size === kategorie.length, 'unikalne value kategorii');
  for (const k of kategorie) {
    sprawdz(k.label.length <= 80, `${k.value}: etykieta przycisku > 80 znaków`);
    sprawdz(k.pola.length >= 1 && k.pola.length <= 5, `${k.value}: formularz musi mieć 1–5 pól`);
    sprawdz(new Set(k.pola.map(p => p.id)).size === k.pola.length, `${k.value}: zdublowane id pól`);
    for (const p of k.pola) {
      sprawdz(p.label.length <= 45, `${k.value}.${p.id}: etykieta pola > 45 znaków ("${p.label}")`);
      sprawdz(!p.max || p.max <= 4000, `${k.value}.${p.id}: max > 4000`);
      sprawdz(!p.min || !p.max || p.min <= p.max, `${k.value}.${p.id}: min > max`);
    }
    if (k.listGonczy) sprawdz(k.pola.some(p => p.id === k.listGonczy.nick), `${k.value}: listGonczy.nick wskazuje nieistniejące pole`);
  }

  // ---------------------------------------------------------------------
  sekcja('Etykiety pól formularzy w kodzie (max 45 znaków)');
  for (const katalog of ['modules', 'commands']) {
    for (const plik of fs.readdirSync(path.join(KORZEN, katalog)).filter(f => f.endsWith('.js'))) {
      const zrodlo = fs.readFileSync(path.join(KORZEN, katalog, plik), 'utf8');
      for (const m of zrodlo.matchAll(/new TextInputBuilder\(\)[\s\S]{0,200}?\.setLabel\('([^']*)'\)/g)) {
        sprawdz([...m[1]].length <= 45, `${katalog}/${plik}: etykieta pola "${m[1]}" ma ${[...m[1]].length} znaków`);
      }
    }
  }

  // ---------------------------------------------------------------------
  sekcja('Karty (Components V2)');
  const kartyDoSprawdzenia = {
    panelTicketow: () => karty.panelTicketow(kategorie),
    panelWeryfikacji: () => karty.panelWeryfikacji(),
    kartaTicketu: () => karty.kartaTicketu({ ticketId: 1, uzytkownik: '1', kategoria: 'X', przydzielony: '2', pola: [{ label: 'A', wartosc: 'b' }], informacje: ['x'], listGonczy: { id: null } }),
    kartaWynikuTicketu: () => karty.kartaWynikuTicketu(1, config.tickety.wyniki),
    kartaHistoriiTicketu: () => karty.kartaHistoriiTicketu({ ticket: { id: 1, user_id: '1', otwarty: 0, zamkniety: 3600000, wynik: 'udane', ocena: 4, wyjasnienie: 'ok' }, kategoria: 'X', pola: [], wynik: config.tickety.wyniki.udane }),
    kartaListuGonczego: () => karty.kartaListuGonczego({ list: { id: 1, nick: 'Steve', powod: 'x', status: 'aktywny', wystawca_id: '1', wygasa: null }, glowaUrl: 'https://mc-heads.net/avatar/Steve/128', nagrody: [{ nagroda: '5 dia', user_id: '2' }] }),
    kartaListyListow: () => karty.kartaListyListow({ status: 'aktywne', listy: [{ id: 1, nick: 'S', powod: 'x', status: 'aktywny', dolozone: 1 }], total: 1, strona: 1, stron: 2, guildId: 'G', czyStaff: true }),
    kartaModCall: () => karty.kartaModCall({ user_id: '1', kanal_id: '2', waiting: false, status: 'Anulowane' }),
    kartaOstrzezen: () => karty.kartaOstrzezen({ user_id: '1', warny: [{ id: 1, data: 0, wystawca_id: '2', powod: 'x', nieaktywne: 'wygasło' }], avatar: 'https://cdn.discordapp.com/embed/avatars/0.png', waznoscDni: 30, progi: { mute: 3, ban: 5 } }),
    kartaPowitania: () => karty.kartaPowitania({ userId: '1', liczbaCzlonkow: 10, kanalWeryfikacji: '2' }),
    kartaDowodowZatrzymania: () => karty.kartaDowodowZatrzymania({ pliki: [{ nazwa: 'a.png', typ: 'image/png' }, { nazwa: 'b.txt', typ: 'text/plain' }], linki: ['https://x'] }),
    kartaZgloszeniaListu: () => karty.kartaZgloszeniaListu({ list: { id: 1, nick: 'S', powod: 'x' }, zgloszenie: { id: 1, zglaszajacy_id: '2', dowod: 'opis', link: 'https://x', utworzone: 0, status: 'oczekuje', kanal_id: 'K' } }),
  };
  for (const [nazwa, fn] of Object.entries(kartyDoSprawdzenia)) {
    await bezpiecznie(`karta ${nazwa}`, async () => { for (const c of fn().components) c.toJSON(); });
  }

  // ---------------------------------------------------------------------
  sekcja('Formularze (modale) otwierane przez przyciski');
  db.prepare("INSERT INTO panstwa (id, nazwa, lider_id, utworzone) VALUES (1, 'Polska', 'KROL', 0)").run();
  db.prepare("INSERT INTO listy_goncze (id, nick, powod, wystawca_id, status, utworzony) VALUES (1, 'Zly', 'Kradzież', 'GRACZ', 'aktywny', 0)").run();
  db.prepare("INSERT INTO sprawy (id, numer, pozywajacy_id, pozwany_typ, pozwany_wartosc, zarzut, opis, utworzona, sedzia_id, status) VALUES (1, 'SNZ-2026-0001', 'A', 'nick', 'Steve', 'z', 'o', 0, 'STAFFER', 'w_toku')").run();

  const kanaly = new Map();
  const nowyKanal = (id, name = id) => {
    const k = {
      id, name, parentId: null, wyslane: [], members: new Collection(),
      messages: { fetch: async (x) => (typeof x === 'string' ? { edit: async () => {} } : new Collection()), delete: async () => {} },
      permissionOverwrites: { edit: async () => {}, delete: async () => {} },
      send: async (p) => { if (p.components) p.components.forEach(c => c.toJSON()); k.wyslane.push(p); return { id: `M${k.wyslane.length}`, url: 'https://discord.com/x', delete: async () => {} }; },
      bulkDelete: async () => {},
      delete: async () => { kanaly.delete(id); },
    };
    kanaly.set(id, k);
    return k;
  };
  for (const id of ['LOGI', 'HIST', 'LG', 'POW']) nowyKanal(id);
  const client = {
    user: { id: 'BOT', tag: 'Bot#0' },
    channels: { fetch: async (id) => kanaly.get(id) || null },
    users: { fetch: async () => ({ send: async () => {} }) },
    fetchWebhook: async () => null,
  };
  let licznikKanalow = 0;
  const guild = {
    id: 'G', ownerId: 'WLASCICIEL', memberCount: 10, client,
    channels: {
      cache: kanaly,
      create: async (o) => nowyKanal(`K${++licznikKanalow}`, o.name),
    },
    roles: { cache: new Collection() },
    members: { fetch: async () => null, me: null },
  };
  const staff = { roles: { cache: new Map([['STAFF', 1]]) }, permissions: { has: () => true } };
  const gracz = { roles: { cache: new Map() }, permissions: { has: () => false } };
  const modale = [];
  const odpowiedzi = [];
  const atrapa = (customId, member, extra = {}) => ({
    customId, member, client, guild,
    user: { id: member === staff ? 'STAFFER' : 'GRACZ', username: 'gracz', tag: 'gracz#0' },
    channel: kanaly.get('K1') || nowyKanal('PANEL'),
    values: [],
    isStringSelectMenu: () => false,
    isFromMessage: () => true,
    isMessageComponent: () => true,
    showModal: async (m) => { modale.push(m.toJSON().custom_id); },
    reply: async (p) => { if (p.components) p.components.forEach(c => c.toJSON()); odpowiedzi.push(p); },
    followUp: async () => {},
    update: async (p) => { if (p.components) p.components.forEach(c => c.toJSON()); odpowiedzi.push(p); },
    deferReply: async () => {},
    editReply: async () => {},
    ...extra,
  });
  const otwieraModal = async (customId, member = staff, extra = {}) => {
    const przed = modale.length;
    await bezpiecznie(`modal z ${customId}`, () => znajdz(customId)(atrapa(customId, member, extra)));
    sprawdz(modale.length === przed + 1, `${customId} nie otworzył formularza`);
  };
  for (const k of kategorie) await otwieraModal(`ticket:kategoria:${k.value}`, gracz);
  await otwieraModal('list:zglos:1');
  await otwieraModal('list:nagroda:1');
  await otwieraModal('list:edytuj:1');
  await otwieraModal('sad:wyrok:1');
  await otwieraModal('sad:dowod:1');
  await otwieraModal('panstwo:dodaj:1', gracz, { user: { id: 'KROL', username: 'krol' } });
  await otwieraModal('weryfikacja:start', gracz);

  // ---------------------------------------------------------------------
  sekcja('Ticket: otwarcie → przejęcie → zamknięcie');
  const kat = kategorie[0];
  const dane = Object.fromEntries(kat.pola.map(p => [p.id, p.nick ? 'Steve' : 'x'.repeat(Math.max(p.min || 1, 12))]));
  await bezpiecznie('formularz ticketu', () => znajdz(`ticket:formularz:${kat.value}`)(atrapa(`ticket:formularz:${kat.value}`, gracz, {
    fields: { getTextInputValue: (id) => dane[id] || '' },
  })));
  const ticket = db.prepare('SELECT * FROM tickety WHERE id = 1').get();
  sprawdz(ticket && ticket.status === 'otwarty', 'ticket utworzony');
  sprawdz(ticket && ticket.narada_id, 'kanał narady utworzony');
  await bezpiecznie('przejęcie', () => znajdz('ticket:przejmij')(atrapa('ticket:przejmij', staff)));
  sprawdz(db.prepare('SELECT przydzielony FROM tickety WHERE id = 1').get().przydzielony === 'STAFFER', 'ticket przejęty');
  await otwieraModal('ticket:wynik:1:udane');
  await bezpiecznie('zamknięcie', () => znajdz('ticket:zamknij-modal')(atrapa('ticket:zamknij-modal:1:udane', staff, {
    fields: { getTextInputValue: () => 'Sprawa rozwiązana pomyślnie' },
  })));
  sprawdz(db.prepare('SELECT status, wynik FROM tickety WHERE id = 1').get().wynik === 'udane', 'ticket zamknięty z wynikiem');
  sprawdz(kanaly.get('HIST').wyslane.length >= 1, 'wpis w historii ticketów');

  // ---------------------------------------------------------------------
  sekcja('Ostrzeżenia: wygasanie i wyroki sądu');
  const ostrz = wymagaj('modules/ostrzezenia.js');
  const stare = Date.now() - (config.ostrzezenia.waznoscDni + 1) * 86400000;
  db.prepare('INSERT INTO ostrzezenia (user_id, powod, wystawca_id, data, sprawa_id) VALUES (?, ?, ?, ?, ?)').run('W', 'stary', 'S', stare, null);
  db.prepare('INSERT INTO ostrzezenia (user_id, powod, wystawca_id, data, sprawa_id) VALUES (?, ?, ?, ?, ?)').run('W', 'wyrok', 'S', Date.now(), 1);
  db.prepare('INSERT INTO ostrzezenia (user_id, powod, wystawca_id, data, sprawa_id) VALUES (?, ?, ?, ?, ?)').run('W', 'nowy', 'S', Date.now(), null);
  sprawdz(ostrz.liczAktywne('W') === (config.ostrzezenia.liczWyrokiSadu ? 2 : 1), 'liczą się tylko aktywne ostrzeżenia');

  // ---------------------------------------------------------------------
  sekcja('Automod');
  const automod = wymagaj('modules/automod.js');
  const usuniete = [];
  const wiadomosc = (tresc, id) => ({
    id, content: tresc, guild, client, system: false, webhookId: null,
    author: { id: 'SPAMER', tag: 's#0', bot: false },
    member: { roles: { cache: new Map() }, permissions: { has: () => false }, moderatable: false, isCommunicationDisabled: () => false },
    channelId: 'CH', channel: { id: 'CH', parentId: null, send: async () => null, bulkDelete: async (ids) => usuniete.push(...ids), messages: { delete: async (x) => usuniete.push(x) } },
    mentions: { users: new Collection(), roles: new Collection() },
  });
  await automod.obsluzWiadomosc(wiadomosc('wbijajcie discord.gg/abc123', 'A1'));
  sprawdz(usuniete.includes('A1'), 'zaproszenie usunięte');
  await automod.obsluzWiadomosc(wiadomosc('@everyone patrzcie', 'A2'));
  sprawdz(usuniete.includes('A2'), '@everyone usunięte');
  for (let i = 0; i < config.automod.flood.wiadomosci; i++) await automod.obsluzWiadomosc(wiadomosc(`spam ${i}`, `F${i}`));
  sprawdz(usuniete.includes('F0'), 'flood wykryty');
  const zwykla = wiadomosc('cześć', 'OK');
  zwykla.author = { id: 'NORMALNY', tag: 'n#0', bot: false };
  await automod.obsluzWiadomosc(zwykla);
  sprawdz(!usuniete.includes('OK'), 'zwykła wiadomość nie jest usuwana');

  // ---------------------------------------------------------------------
  sekcja('Antynuke');
  const antynuke = wymagaj('modules/antynuke.js');
  const zdarzenia = [];
  const czlonek = (id) => ({
    id, user: { bot: false }, manageable: true, bannable: true, kickable: true,
    roles: { cache: new Collection(), set: async () => zdarzenia.push(`role:${id}`), remove: async () => zdarzenia.push(`zdjeto:${id}`) },
    ban: async () => {}, kick: async () => {},
  });
  guild.members.fetch = async (id) => czlonek(id);
  guild.members.unban = async (id) => zdarzenia.push(`unban:${id}`);
  guild.members.ban = async () => {};
  for (let i = 0; i < config.antynuke.progi.ban; i++) {
    await antynuke.obsluzWpisAudytu({ action: AuditLogEvent.MemberBanAdd, executorId: 'NUKER', targetId: `V${i}`, changes: [] }, guild);
  }
  sprawdz(zdarzenia.includes('role:NUKER') && zdarzenia.includes('unban:V0'), 'masowe bany: kara i odbanowanie');
  const rolaAdmin = { id: 'ADMINROLA', permissions: { bitfield: 8n } };
  guild.roles.cache.set('ADMINROLA', rolaAdmin);
  await antynuke.obsluzWpisAudytu({ action: AuditLogEvent.MemberRoleUpdate, executorId: 'OBCY', targetId: 'KUMPEL', changes: [{ key: '$add', new: [{ id: 'ADMINROLA' }] }] }, guild);
  sprawdz(zdarzenia.includes('zdjeto:KUMPEL'), 'nadanie roli admina cofnięte');
  zdarzenia.length = 0;
  await antynuke.obsluzWpisAudytu({ action: AuditLogEvent.MemberBanAdd, executorId: 'WLASCICIEL', targetId: 'X', changes: [] }, guild);
  sprawdz(zdarzenia.length === 0, 'właściciel serwera jest na whiteliście');

  // ---------------------------------------------------------------------
  sekcja('Sąd: konflikt interesów, brak odwołań, stały sędzia');
  const sad = wymagaj('modules/sad.js');
  db.prepare("INSERT INTO panstwa (id, nazwa, lider_id, utworzone) VALUES (2, 'Niemcy', 'KROL2', 0)").run();
  db.prepare("INSERT INTO weryfikacja (user_id, nick, data) VALUES ('SEDZIA_PL', 'SedziaPL', 0), ('SEDZIA_OK', 'SedziaOK', 0)").run();
  db.prepare("INSERT INTO panstwa_czlonkowie (panstwo_id, nick, dodany) VALUES (1, 'SedziaPL', 0)").run();
  const sprawaGracz = { pozywajacy_id: 'KROL2', pozwany_typ: 'gracz', pozwany_wartosc: 'POZWANY' };
  sprawdz(sad.konfliktInteresow(sprawaGracz, 'POZWANY'), 'pozwany gracz nie może sądzić własnej sprawy');
  sprawdz(sad.konfliktInteresow(sprawaGracz, 'KROL2'), 'pozywający nie może sądzić własnej sprawy');
  const sprawaPanstwo = { pozywajacy_id: 'KROL2', pozwany_typ: 'panstwo', pozwany_wartosc: 'Polska' };
  sprawdz(sad.konfliktInteresow(sprawaPanstwo, 'SEDZIA_PL'), 'członek pozwanego państwa nie może sądzić');
  sprawdz(sad.konfliktInteresow(sprawaPanstwo, 'KROL'), 'król pozwanego państwa nie może sądzić');
  sprawdz(!sad.konfliktInteresow(sprawaPanstwo, 'SEDZIA_OK'), 'neutralny sędzia może sądzić');
  db.prepare("INSERT INTO sprawy (id, numer, pozywajacy_id, pozwany_typ, pozwany_wartosc, zarzut, opis, utworzona, status) VALUES (2, 'SNZ-2026-0002', 'KROL2', 'panstwo', 'Polska', 'z', 'o', 0, 'zlozona')").run();
  await bezpiecznie('przyjęcie z konfliktem', () => znajdz('sad:przyjmij:2')(atrapa('sad:przyjmij:2', staff, { user: { id: 'SEDZIA_PL' } })));
  sprawdz(!db.prepare('SELECT sedzia_id FROM sprawy WHERE id = 2').get().sedzia_id, 'sędzia z konfliktem nie przyjął sprawy');
  await bezpiecznie('przyjęcie', () => znajdz('sad:przyjmij:2')(atrapa('sad:przyjmij:2', staff, { user: { id: 'SEDZIA_OK' } })));
  sprawdz(db.prepare('SELECT sedzia_id FROM sprawy WHERE id = 2').get().sedzia_id === 'SEDZIA_OK', 'neutralny sędzia przyjął sprawę');
  await bezpiecznie('ponowne przyjęcie', () => znajdz('sad:przyjmij:2')(atrapa('sad:przyjmij:2', staff, { user: { id: 'INNY_SEDZIA' } })));
  sprawdz(db.prepare('SELECT sedzia_id FROM sprawy WHERE id = 2').get().sedzia_id === 'SEDZIA_OK', 'sędzia się nie zmienia');
  const kartaSprawy = JSON.stringify(karty.kartaSprawy({ sprawa: { ...db.prepare('SELECT * FROM sprawy WHERE id = 2').get(), status: 'wyrok', werdykt: 'w', kara: 'k' } }).components[0].toJSON());
  sprawdz(!kartaSprawy.includes('sad:odwol'), 'po wyroku nie ma przycisku odwołania');

  // ---------------------------------------------------------------------
  sekcja('List gończy: zgłoszenie zatrzymania z dowodem');
  const plik = { name: 'film.mp4', url: 'https://cdn.discordapp.com/x/film.mp4', size: 50 * 1024 * 1024, contentType: 'video/mp4' };
  const przed = kanaly.size;
  await bezpiecznie('zgłoszenie zatrzymania', () => znajdz('list:zglos-modal:1')(atrapa('list:zglos-modal:1', gracz, {
    user: { id: 'LOWCA', username: 'lowca' },
    fields: {
      getTextInputValue: (id) => ({ opis: 'Złapałem go przy spawnie o 20:00', link: 'https://youtu.be/abc' })[id] || '',
      getUploadedFiles: () => new Collection([['1', plik]]),
    },
  })));
  const zgl = db.prepare('SELECT * FROM listy_zgloszenia WHERE zglaszajacy_id = ?').get('LOWCA');
  sprawdz(zgl && zgl.kanal_id && kanaly.size === przed + 1, 'powstał kanał zgłoszenia dla administracji');
  sprawdz(zgl && zgl.link === 'https://youtu.be/abc', 'zapisano link do nagrania');
  await bezpiecznie('dodanie zgłaszającego', () => znajdz(`list:zgl-dodaj:${zgl.id}`)(atrapa(`list:zgl-dodaj:${zgl.id}`, staff, { channel: kanaly.get(zgl.kanal_id) })));
  sprawdz(db.prepare('SELECT zglaszajacy_dodany FROM listy_zgloszenia WHERE id = ?').get(zgl.id).zglaszajacy_dodany === 1, 'zgłaszający dodany do kanału');
  await bezpiecznie('zatwierdzenie', () => znajdz(`list:zgl:ok:${zgl.id}`)(atrapa(`list:zgl:ok:${zgl.id}`, staff, { channel: kanaly.get(zgl.kanal_id) })));
  sprawdz(db.prepare('SELECT status FROM listy_goncze WHERE id = 1').get().status === 'zrealizowany', 'list zrealizowany po zatwierdzeniu');

  // ---------------------------------------------------------------------
  console.log(`\n${testy - bledy}/${testy} sprawdzeń OK`);
  process.exit(bledy ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
