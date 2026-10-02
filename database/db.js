const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// SNZ_DB_PATH pozwala podmienić bazę (np. ':memory:' w testach)
const dbPath = process.env.SNZ_DB_PATH || path.join(__dirname, 'snz.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

// Migracje dla istniejących baz (CREATE TABLE IF NOT EXISTS nie dodaje nowych kolumn)
function dodajKolumne(tabela, kolumna, definicja) {
  const kolumny = db.prepare(`PRAGMA table_info(${tabela})`).all().map(k => k.name);
  if (!kolumny.includes(kolumna)) db.exec(`ALTER TABLE ${tabela} ADD COLUMN ${kolumna} ${definicja}`);
}

dodajKolumne('tickety', 'zamknal', 'TEXT');
dodajKolumne('tickety', 'wyjasnienie', 'TEXT');
dodajKolumne('tickety', 'temat', 'TEXT');
dodajKolumne('tickety', 'opis', 'TEXT');
dodajKolumne('tickety', 'wiadomosc_id', 'TEXT');
for (const k of ['kategoria_kod', 'formularz', 'wynik', 'historia_kanal_id', 'historia_wiad_id']) dodajKolumne('tickety', k, 'TEXT');
dodajKolumne('tickety', 'list_id', 'INTEGER');
dodajKolumne('tickety', 'narada_id', 'TEXT');
for (const k of ['ostatnia_aktywnosc', 'przypomniano', 'ostrzezono_nieaktywnosc']) dodajKolumne('tickety', k, 'INTEGER');
dodajKolumne('mod_call', 'pomoc_kanal_id', 'TEXT');
dodajKolumne('mod_call', 'sprzatniete', 'INTEGER DEFAULT 0');
for (const k of ['link', 'kanal_id', 'wiadomosc_id']) dodajKolumne('listy_zgloszenia', k, 'TEXT');
dodajKolumne('listy_zgloszenia', 'zglaszajacy_dodany', 'INTEGER DEFAULT 0');

// Odwołania zostały wyłączone - sprawy w toku odwołania wracają do sędziego albo do kolejki
db.exec(`UPDATE sprawy SET status = CASE WHEN sedzia_id IS NULL THEN 'zlozona' ELSE 'w_toku' END WHERE status = 'odwolanie'`);
dodajKolumne('panstwa', 'sojusznik', 'INTEGER NOT NULL DEFAULT 1');
dodajKolumne('panstwa_czlonkowie', 'status', "TEXT NOT NULL DEFAULT 'czlonek'");

db.sciezka = dbPath;

module.exports = db;
