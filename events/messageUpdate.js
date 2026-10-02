const logi = require('../modules/logi-wiadomosci.js');

module.exports = {
  name: 'messageUpdate',
  async execute(stara, nowa) {
    try {
      await logi.obsluzEdycje(stara, nowa);
    } catch (e) {
      console.error('[messageUpdate]', e);
    }
  },
};
