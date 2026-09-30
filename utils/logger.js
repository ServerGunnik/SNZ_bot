const config = require('../config.js');
const karty = require('./karty.js');
const kolory = require('./kolory.js');

async function wyslij(client, kanalId, payload) {
  if (!kanalId) return;
  try {
    const kanal = await client.channels.fetch(kanalId).catch(() => null);
    if (!kanal) return;
    await kanal.send(payload);
  } catch (e) {
    console.error('[logger] błąd wysyłki logu:', e.message);
  }
}

async function log(client, { tytul, opis, kolor = kolory.info, kanal = 'logi', stopka = null }) {
  const kanalId = config.kanaly[kanal] || config.kanaly.logi;
  await wyslij(client, kanalId, karty.kartaInfo({ tytul, opis, kolor, stopka }));
}

module.exports = { log, wyslij };
