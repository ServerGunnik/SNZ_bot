const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { jestStaff } = require('../utils/uprawnienia.js');
const { widokListow } = require('../modules/listy-goncze.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('listy-goncze')
    .setDescription('Przegląd listów gończych')
    .setDMPermission(false)
    .addStringOption(o => o.setName('status').setDescription('Które listy pokazać')
      .addChoices(
        { name: 'aktywne', value: 'aktywne' },
        { name: 'zakończone', value: 'zakonczone' },
        { name: 'oczekujące na zatwierdzenie (administracja)', value: 'oczekujace' },
      )),

  async execute(interaction) {
    await interaction.reply({
      ...widokListow(interaction.options.getString('status') || 'aktywne', 1, {
        guildId: interaction.guild.id,
        czyStaff: jestStaff(interaction.member),
      }),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  },
};
