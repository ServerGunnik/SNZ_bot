const antynuke = require('../modules/antynuke.js');
const powitania = require('../modules/powitania.js');

module.exports = {
  name: 'guildMemberAdd',
  async execute(member) {
    try {
      // Osoby wyrzucone przez anty-raid nie dostają powitania
      const wyrzucony = await antynuke.obsluzDolaczenie(member);
      if (!wyrzucony) await powitania.powitaj(member);
    } catch (e) {
      console.error('[guildMemberAdd]', e);
    }
  },
};
