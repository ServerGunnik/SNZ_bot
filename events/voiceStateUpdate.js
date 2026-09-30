const modCall = require('../modules/wolanie-moda.js');

module.exports = {
  name: 'voiceStateUpdate',
  async execute(oldState, newState, client) {
    // Delegacja do modułu
    try {
      await modCall.obsluzZmianeStanuGlosowego(oldState, newState, client);
    } catch (e) {
      console.error('[voiceStateUpdate]', e);
    }
  },
};
