const logi = require('../modules/logi-wiadomosci.js');
const ochrona = require('../modules/ochrona-logow.js');

module.exports = {
  name: 'messageDelete',
  async execute(wiadomosc) {
    try {
      // Usunięty log bota obsługuje ochrona logów (odtworzenie + kara), nie zwykłe logi wiadomości
      if (ochrona.czyChroniona(wiadomosc.id)) {
        await ochrona.obsluzUsuniecie(wiadomosc);
        return;
      }
      await logi.obsluzUsuniecie(wiadomosc);
    } catch (e) {
      console.error('[messageDelete]', e);
    }
  },
};
