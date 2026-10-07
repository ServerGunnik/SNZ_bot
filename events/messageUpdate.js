const logi = require('../modules/logi-wiadomosci.js');
const ochrona = require('../modules/ochrona-logow.js');
const backupWiadomosci = require('../modules/backup-wiadomosci.js');

module.exports = {
  name: 'messageUpdate',
  async execute(stara, nowa) {
    try {
      ochrona.zaktualizuj(nowa);
      backupWiadomosci.aktualizuj(nowa);
      await logi.obsluzEdycje(stara, nowa);
    } catch (e) {
      console.error('[messageUpdate]', e);
    }
  },
};
