const antynuke = require('../modules/antynuke.js');

module.exports = {
  name: 'roleDelete',
  async execute(rola) {
    // Zrzut roli, żeby antynuke mógł ją odtworzyć
    antynuke.zapamietajRole(rola);
  },
};
