const logi = require('../modules/logi-wiadomosci.js');

module.exports = {
  name: 'messageDelete',
  async execute(wiadomosc) {
    try {
      await logi.obsluzUsuniecie(wiadomosc);
    } catch (e) {
      console.error('[messageDelete]', e);
    }
  },
};
