const antynuke = require('../modules/antynuke.js');
const tickety = require('../modules/tickety.js');
const ochronaKanalow = require('../modules/ochrona-kanalow.js');

module.exports = {
  name: 'channelDelete',
  async execute(kanal) {
    // Zrzut kanału MUSI zostać zapisany pierwszy, żeby ochrona-kanalow mogła go potem odtworzyć
    antynuke.zapamietajKanal(kanal);
    // Ręcznie usunięty kanał ticketu/narady - porządek w bazie (nie czeka na audit log)
    await tickety.obsluzUsuniecieKanalu(kanal).catch((e) => console.error('[channelDelete tickety]', e));
    // Kara za usunięcie kanału + odtworzenie (poza botem/właścicielem/technikami)
    await ochronaKanalow.obsluzUsuniecieKanalu(kanal).catch((e) => console.error('[channelDelete ochrona]', e));
  },
};
