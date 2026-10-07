const antynuke = require('../modules/antynuke.js');
const blokadaBotow = require('../modules/blokada-botow.js');
const powitania = require('../modules/powitania.js');
const logiSerwera = require('../modules/logi-serwera.js');

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
      // Log dołączenia tylko gdy ktoś faktycznie zostaje na serwerze
      if (!wyrzucony) {
        await logiSerwera.onCzlonekDolaczyl(member).catch((e) => console.error('[guildMemberAdd log]', e));
        await powitania.powitaj(member);
      }
    } catch (e) {
      console.error('[guildMemberAdd]', e);
    }
  },
};
