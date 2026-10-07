const automod = require('../modules/automod.js');
const tickety = require('../modules/tickety.js');
const ochrona = require('../modules/ochrona-logow.js');
const backupWiadomosci = require('../modules/backup-wiadomosci.js');

module.exports = {
  name: 'messageCreate',
  async execute(wiadomosc) {
    try {
      // Kopia logów bota (bez czekania - pobieranie załączników nie blokuje reszty)
      ochrona.zapamietaj(wiadomosc).catch((e) => console.error('[ochrona-logow] kopia', e.message));
      // Kopia zwykłych wiadomości do odtworzenia webhookiem po usunięciu kanału
      backupWiadomosci.zapamietaj(wiadomosc);
      tickety.zarejestrujAktywnosc(wiadomosc);
      await automod.obsluzWiadomosc(wiadomosc);
    } catch (e) {
      console.error('[messageCreate]', e);
    }
  },
};
