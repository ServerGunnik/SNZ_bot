const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { widokListy } = require('../modules/sojusz-lista.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sojusz-lista')
    .setDescription('Lista państw sojuszu i ich graczy (z configiem dla moda)')
    .setDMPermission(false),

  async execute(interaction) {
    await interaction.reply({ ...widokListy(1), flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
  },
};
