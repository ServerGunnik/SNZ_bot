const logi = require('../modules/logi-wiadomosci.js');

module.exports = {
  name: 'messageDeleteBulk',
  async execute(wiadomosci, kanal) {
    try {
      await logi.obsluzMasoweUsuniecie(wiadomosci, kanal);
    } catch (e) {
      console.error('[messageDeleteBulk]', e);
    }
  },
};
