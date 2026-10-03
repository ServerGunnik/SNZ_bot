const logi = require('../modules/logi-wiadomosci.js');
const ochrona = require('../modules/ochrona-logow.js');

module.exports = {
  name: 'messageDeleteBulk',
  async execute(wiadomosci, kanal) {
    try {
      await ochrona.obsluzMasoweUsuniecie(wiadomosci, kanal);
      await logi.obsluzMasoweUsuniecie(wiadomosci.filter(w => !w.author || w.author.id !== kanal.client.user.id), kanal);
    } catch (e) {
      console.error('[messageDeleteBulk]', e);
    }
  },
};
