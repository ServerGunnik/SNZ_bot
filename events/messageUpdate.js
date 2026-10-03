const logi = require('../modules/logi-wiadomosci.js');
const ochrona = require('../modules/ochrona-logow.js');

module.exports = {
  name: 'messageUpdate',
  async execute(stara, nowa) {
    try {
      ochrona.zaktualizuj(nowa);
      await logi.obsluzEdycje(stara, nowa);
    } catch (e) {
      console.error('[messageUpdate]', e);
    }
  },
};
