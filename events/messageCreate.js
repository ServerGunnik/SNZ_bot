const automod = require('../modules/automod.js');
const tickety = require('../modules/tickety.js');
const ochrona = require('../modules/ochrona-logow.js');

module.exports = {
  name: 'messageCreate',
  async execute(wiadomosc) {
    try {
      // Kopia logów bota (bez czekania - pobieranie załączników nie blokuje reszty)
      ochrona.zapamietaj(wiadomosc).catch((e) => console.error('[ochrona-logow] kopia', e.message));
      tickety.zarejestrujAktywnosc(wiadomosc);
      await automod.obsluzWiadomosc(wiadomosc);
    } catch (e) {
      console.error('[messageCreate]', e);
    }
  },
};
