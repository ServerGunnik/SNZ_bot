// Kanał update-log: przy starcie bot publikuje wpisy z aktualizacje.js, których jeszcze nie wysłał.
// Wpis jest oznaczany jako opublikowany dopiero po udanej wysyłce - przy błędzie spróbuje przy kolejnym starcie.
const db = require('../database/db.js');
const config = require('../config.js');
const karty = require('../utils/karty.js');
const kolory = require('../utils/kolory.js');
const { wyslij } = require('../utils/logger.js');
const aktualizacje = require('../aktualizacje.js');

const q = {
  opublikowana: db.prepare('SELECT 1 FROM aktualizacje_opublikowane WHERE id = ?'),
  oznacz: db.prepare('INSERT OR IGNORE INTO aktualizacje_opublikowane (id, wiadomosc_id, data) VALUES (?, ?, ?)'),
};

const lista = (pozycje) => pozycje.map(p => `• ${p}`).join('\n');

function kartaAktualizacji(wpis) {
  const czesci = [];
  if (wpis.dodano?.length) czesci.push(`### 🆕 Dodano / zmieniono\n${lista(wpis.dodano)}`);
  if (wpis.naprawiono?.length) czesci.push(`### 🔧 Naprawiono\n${lista(wpis.naprawiono)}`);
  if (wpis.opis) czesci.push(`### 📝 Jak to działa\n${wpis.opis}`);
  return karty.kartaInfo({
    tytul: `📋 ${wpis.tytul}`,
    opis: czesci.join('\n\n'),
    kolor: kolory.info,
    stopka: wpis.data,
  });
}

async function opublikujNowe(client) {
  if (!config.kanaly.updateLog) return 0;
  let wyslane = 0;
  for (const wpis of aktualizacje) {
    if (q.opublikowana.get(wpis.id)) continue;
    const wiadomosc = await wyslij(client, config.kanaly.updateLog, { ...kartaAktualizacji(wpis), allowedMentions: { parse: [] } });
    if (!wiadomosc) {
      console.error(`[update-log] nie udało się wysłać wpisu ${wpis.id} - spróbuję przy następnym starcie`);
      break;
    }
    q.oznacz.run(wpis.id, wiadomosc.id, Date.now());
    wyslane++;
  }
  return wyslane;
}

module.exports = { opublikujNowe, kartaAktualizacji };
