const antynuke = require('../modules/antynuke.js');
const blokadaBotow = require('../modules/blokada-botow.js');
const powitania = require('../modules/powitania.js');

module.exports = {
  name: 'guildMemberAdd',
  async execute(member) {
    try {
      if (member.user.bot) {
        await blokadaBotow.obsluzDolaczenie(member);
        return;
      }
      // Osoby wyrzucone przez anty-raid nie dostają powitania
      const wyrzucony = await antynuke.obsluzDolaczenie(member);
      if (!wyrzucony) await powitania.powitaj(member);
    } catch (e) {
      console.error('[guildMemberAdd]', e);
    }
  },
};
