// Kanał „update-log”: przy starcie bot publikuje wpisy z aktualizacje.json, których jeszcze nie wysłał.
// Każda zmiana w bocie = nowy wpis na końcu aktualizacje.json (po wdrożeniu i restarcie pojawi się na kanale).
const fs = require('fs');
const path = require('path');
const db = require('../database/db.js');
const config = require('../config.js');
const karty = require('../utils/karty.js');
const { wyslij } = require('../utils/logger.js');
const { wersjaKodu } = require('../utils/wersja.js');

const PLIK = path.join(__dirname, '..', 'aktualizacje.json');
// Po odtworzeniu bazy z kopii nie zasypujemy kanału całą historią - tylko najnowsze wpisy
const MAX_NA_START = 5;

const q = {
  wyslany: db.prepare('SELECT 1 FROM update_log WHERE id = ?'),
  zapisz: db.prepare('INSERT OR IGNORE INTO update_log (id, wiadomosc_id, data) VALUES (?, ?, ?)'),
};

function wczytajAktualizacje() {
  return JSON.parse(fs.readFileSync(PLIK, 'utf8'));
}

async function opublikujNowe(client) {
  if (!config.kanaly.updateLog) return;
  let wpisy;
  try {
    wpisy = wczytajAktualizacje();
  } catch (e) {
    console.error('[update-log] nie można wczytać aktualizacje.json:', e.message);
    return;
  }
  const nowe = wpisy.filter(w => !q.wyslany.get(w.id));
  // Starsze ponad limit oznaczamy jako wysłane bez publikacji
  for (const w of nowe.slice(0, Math.max(0, nowe.length - MAX_NA_START))) q.zapisz.run(w.id, null, Date.now());

  const wersja = wersjaKodu();
  for (const wpis of nowe.slice(-MAX_NA_START)) {
    const wiad = await wyslij(client, config.kanaly.updateLog, {
      ...karty.kartaAktualizacji({ wpis, wersja }),
      allowedMentions: { parse: [] },
    });
    // Nieudana wysyłka (brak dostępu) - spróbujemy przy następnym starcie
    if (!wiad) {
      console.error(`[update-log] nie udało się wysłać wpisu ${wpis.id} na kanał ${config.kanaly.updateLog}`);
      return;
    }
    q.zapisz.run(wpis.id, wiad.id, Date.now());
  }
}

function rejestruj() {}

module.exports = { rejestruj, opublikujNowe, wczytajAktualizacje };
