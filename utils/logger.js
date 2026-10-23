const config = require('../config.js');
const karty = require('./karty.js');
const kolory = require('./kolory.js');

// Zwraca wysłaną wiadomość albo null (brak kanału / brak dostępu)
async function wyslij(client, kanalId, payload) {
  if (!kanalId) return null;
  try {
    const kanal = await client.channels.fetch(kanalId).catch(() => null);
    if (!kanal) return null;
    return await kanal.send(payload);
  } catch (e) {
    console.error('[logger] błąd wysyłki logu:', e.message);
    return null;
  }
}

async function log(client, { tytul, opis, kolor = kolory.info, kanal = 'logi', stopka = null }) {
  const kanalId = config.kanaly[kanal] || config.kanaly.logi;
  await wyslij(client, kanalId, { ...karty.kartaInfo({ tytul, opis, kolor, stopka }), allowedMentions: { parse: [] } });
}

module.exports = { log, wyslij };
