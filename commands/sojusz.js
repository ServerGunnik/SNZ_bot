const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const karty = require('../utils/karty.js');
const { jestLider } = require('../utils/uprawnienia.js');
const { pokazPanstwo, panstwoLidera } = require('../modules/panstwa.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sojusz')
    .setDescription('Zarządzaj swoim państwem (dla liderów)')
    .setDMPermission(false),

  async execute(interaction) {
    if (!jestLider(interaction.member)) {
      return interaction.reply({
        ...karty.kartaBlad('Brak uprawnień', 'Komenda dostępna tylko dla liderów państw.'),
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
    }
    const panstwo = panstwoLidera(interaction.user.id);
    if (!panstwo) {
      return interaction.reply({
        ...karty.kartaBlad('Brak państwa', 'Nie jesteś przypisany do żadnego państwa.'),
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
    }
    await pokazPanstwo(interaction, panstwo, 1);
  },
};
