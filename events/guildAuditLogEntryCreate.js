const antynuke = require('../modules/antynuke.js');
const blokadaBotow = require('../modules/blokada-botow.js');

module.exports = {
  name: 'guildAuditLogEntryCreate',
  async execute(wpis, guild) {
    // Blokada botów działa także wobec osób z whitelisty antynuke - uprawnienia botów zmienia tylko właściciel
    try {
      await blokadaBotow.obsluzWpisAudytu(wpis, guild);
    } catch (e) {
      console.error('[guildAuditLogEntryCreate] blokada botów', e);
    }
    try {
      await antynuke.obsluzWpisAudytu(wpis, guild);
    } catch (e) {
      console.error('[guildAuditLogEntryCreate]', e);
    }
  },
};
