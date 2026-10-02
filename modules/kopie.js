// Automatyczne kopie zapasowe bazy SQLite do database/kopie/ (przy starcie i co config.kopie.coGodzin)
const fs = require('fs');
const path = require('path');
const db = require('../database/db.js');
const config = require('../config.js');

const KATALOG = path.join(__dirname, '..', 'database', 'kopie');

function nazwaKopii(data = new Date()) {
  return `snz-${data.toISOString().slice(0, 16).replace(/[:T]/g, '-')}.db`;
}

function usunStareKopie() {
  const kopie = fs.readdirSync(KATALOG).filter(f => /^snz-.*\.db$/.test(f)).sort();
  for (const plik of kopie.slice(0, Math.max(0, kopie.length - config.kopie.zachowaj))) {
    fs.rmSync(path.join(KATALOG, plik), { force: true });
  }
}

async function zrobKopie() {
  if (db.sciezka === ':memory:') return null;
  fs.mkdirSync(KATALOG, { recursive: true });
  const cel = path.join(KATALOG, nazwaKopii());
  // backup() kopiuje spójny stan bazy także w trakcie pracy bota (WAL)
  await db.backup(cel);
  usunStareKopie();
  return cel;
}

function uruchomKopie() {
  const wykonaj = () => zrobKopie()
    .then(cel => cel && console.log(`[kopie] zapisano ${path.basename(cel)}`))
    .catch(e => console.error('[kopie] błąd kopii bazy:', e.message));
  wykonaj();
  if (config.kopie.coGodzin > 0) setInterval(wykonaj, config.kopie.coGodzin * 60 * 60 * 1000);
}

function rejestruj() {}

module.exports = { rejestruj, zrobKopie, uruchomKopie, KATALOG };
