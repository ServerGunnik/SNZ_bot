const { InteractionType, MessageFlags } = require('discord.js');
const { znajdz } = require('../handlers/componentHandler.js');
const karty = require('../utils/karty.js');

async function bezpiecznaOdpowiedz(interaction, blad) {
  const payload = karty.kartaBlad('Coś poszło nie tak', blad?.message || 'Nieznany błąd.');
  try {
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ ...payload, flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    } else {
      await interaction.reply({ ...payload, flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    }
  } catch (_) {}
}

module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {
    try {
      // Slash commands
      if (interaction.isChatInputCommand()) {
        const cmd = client.commands.get(interaction.commandName);
        if (!cmd) return;
        await cmd.execute(interaction, client);
        return;
      }

      // Autocomplete
      if (interaction.type === InteractionType.ApplicationCommandAutocomplete) {
        const cmd = client.commands.get(interaction.commandName);
        if (cmd?.autocomplete) await cmd.autocomplete(interaction, client);
        return;
      }

      // Komponenty i modale - dispatch po prefixie customId
      if (
        interaction.isButton() ||
        interaction.isStringSelectMenu() ||
        interaction.isUserSelectMenu() ||
        interaction.isChannelSelectMenu() ||
        interaction.isRoleSelectMenu() ||
        interaction.isModalSubmit()
      ) {
        const handler = znajdz(interaction.customId);
        if (!handler) {
          await interaction.reply({
            ...karty.kartaBlad('Nieznana akcja', 'Ten element mógł wygasnąć lub pochodzi ze starej wersji bota.'),
            flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
          });
          return;
        }
        await handler(interaction, client);
      }
    } catch (e) {
      console.error('[interactionCreate]', e);
      await bezpiecznaOdpowiedz(interaction, e);
    }
  },
};
