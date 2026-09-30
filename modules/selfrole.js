const { MessageFlags } = require('discord.js');
const db = require('../database/db.js');
const karty = require('../utils/karty.js');

const q = {
  grupa: db.prepare('SELECT * FROM selfrole_grupy WHERE id = ?'),
  role: db.prepare('SELECT * FROM selfrole_role WHERE grupa_id = ? ORDER BY id'),
};

async function onSelect(interaction) {
  const [, , grupaIdStr] = interaction.customId.split(':');
  const grupaId = parseInt(grupaIdStr, 10);
  const grupa = q.grupa.get(grupaId);
  if (!grupa) {
    return interaction.reply({
      ...karty.kartaBlad('Grupa nie istnieje', 'Ten panel jest już nieaktywny.'),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  }

  const dostepne = q.role.all(grupaId);
  const wybraneIds = new Set(interaction.values.map(v => parseInt(v, 10)));
  const dodane = [];
  const usuniete = [];

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const member = interaction.member;
  for (const wpis of dostepne) {
    const rola = interaction.guild.roles.cache.get(wpis.role_id);
    if (!rola) continue;
    const czyMa = member.roles.cache.has(rola.id);
    const czyChce = wybraneIds.has(wpis.id);

    // W trybie single, jeśli nie w wybranych - usuń
    if (grupa.tryb === 'single') {
      if (czyChce && !czyMa) { await member.roles.add(rola).catch(() => {}); dodane.push(rola.name); }
      else if (!czyChce && czyMa) { await member.roles.remove(rola).catch(() => {}); usuniete.push(rola.name); }
    } else {
      // multi: toggle względem wybranych vs stanu obecnego
      if (czyChce && !czyMa) { await member.roles.add(rola).catch(() => {}); dodane.push(rola.name); }
      else if (!czyChce && czyMa) { await member.roles.remove(rola).catch(() => {}); usuniete.push(rola.name); }
    }
  }

  const linie = [];
  if (dodane.length) linie.push(`**Dodano:** ${dodane.join(', ')}`);
  if (usuniete.length) linie.push(`**Usunięto:** ${usuniete.join(', ')}`);
  if (!linie.length) linie.push('Nie dokonano zmian.');

  await interaction.editReply(karty.kartaSukces('Role zaktualizowane', linie.join('\n')));
}

function rejestruj({ zarejestruj }) {
  zarejestruj('selfrole:pick', onSelect);
}

module.exports = { rejestruj };
