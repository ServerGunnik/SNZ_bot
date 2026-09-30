const antynuke = require('../modules/antynuke.js');

module.exports = {
  name: 'guildAuditLogEntryCreate',
  async execute(wpis, guild) {
    try {
      await antynuke.obsluzWpisAudytu(wpis, guild);
    } catch (e) {
      console.error('[guildAuditLogEntryCreate]', e);
    }
  },
};
