const automod = require('../modules/automod.js');
const tickety = require('../modules/tickety.js');

module.exports = {
  name: 'messageCreate',
  async execute(wiadomosc) {
    try {
      tickety.zarejestrujAktywnosc(wiadomosc);
      await automod.obsluzWiadomosc(wiadomosc);
    } catch (e) {
      console.error('[messageCreate]', e);
    }
  },
};
