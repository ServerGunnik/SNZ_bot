const antynuke = require('../modules/antynuke.js');

module.exports = {
  name: 'channelDelete',
  async execute(kanal) {
    // Zrzut kanału, żeby antynuke mógł go odtworzyć
    antynuke.zapamietajKanal(kanal);
  },
};
