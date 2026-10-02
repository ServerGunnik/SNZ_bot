// Powitanie nowego członka na kanale KANAL_POWITANIA (puste = wyłączone)
const config = require('../config.js');
const karty = require('../utils/karty.js');

async function powitaj(member) {
  if (!config.kanaly.powitania || member.user.bot) return;
  if (config.guildId && member.guild.id !== config.guildId) return;
  const kanal = await member.client.channels.fetch(config.kanaly.powitania).catch(() => null);
  if (!kanal) return;
  await kanal.send({
    ...karty.kartaPowitania({
      userId: member.id,
      liczbaCzlonkow: member.guild.memberCount,
      kanalWeryfikacji: config.kanaly.weryfikacja,
      kanalTicketow: config.kanaly.ticket,
    }),
    allowedMentions: { users: [member.id] },
  }).catch((e) => console.error('[powitania]', e.message));
}

function rejestruj() {}

module.exports = { rejestruj, powitaj };
