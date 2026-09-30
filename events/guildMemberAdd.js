const antynuke = require('../modules/antynuke.js');

module.exports = {
  name: 'guildMemberAdd',
  async execute(member) {
    try {
      await antynuke.obsluzDolaczenie(member);
    } catch (e) {
      console.error('[guildMemberAdd]', e);
    }
  },
};
