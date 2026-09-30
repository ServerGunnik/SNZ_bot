const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, 'snz.db');
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

module.exports = db;
