const logiSerwera = require('../modules/logi-serwera.js');

module.exports = {
  name: 'guildMemberRemove',
  async execute(member) {
    try {
      await logiSerwera.onCzlonekOpuscil(member);
    } catch (e) {
      console.error('[guildMemberRemove]', e);
    }
  },
};
