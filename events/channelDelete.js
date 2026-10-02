const antynuke = require('../modules/antynuke.js');
const tickety = require('../modules/tickety.js');

module.exports = {
  name: 'channelDelete',
  async execute(kanal) {
    // Zrzut kanału, żeby antynuke mógł go odtworzyć
    antynuke.zapamietajKanal(kanal);
    // Ręcznie usunięty kanał ticketu/narady - porządek w bazie
    await tickety.obsluzUsuniecieKanalu(kanal).catch((e) => console.error('[channelDelete]', e));
  },
};
