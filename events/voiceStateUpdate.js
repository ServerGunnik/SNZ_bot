const modCall = require('../modules/wolanie-moda.js');
const rekrutacja = require('../modules/rekrutacja.js');

module.exports = {
  name: 'voiceStateUpdate',
  async execute(oldState, newState, client) {
    try {
      await modCall.obsluzZmianeStanuGlosowego(oldState, newState, client);
    } catch (e) {
      console.error('[voiceStateUpdate wolanie-moda]', e);
    }
    try {
      await rekrutacja.obsluzZmianeStanuGlosowego(oldState, newState);
    } catch (e) {
      console.error('[voiceStateUpdate rekrutacja]', e);
    }
  },
};
