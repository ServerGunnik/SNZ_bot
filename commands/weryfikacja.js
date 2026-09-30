const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const karty = require('../utils/karty.js');
const { jestStaff } = require('../utils/uprawnienia.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('panel-weryfikacji')
    .setDescription('Wystawia panel weryfikacji w bieżącym kanale')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false),
  async execute(interaction) {
    if (!jestStaff(interaction.member)) {
      return interaction.reply({
        ...karty.kartaBlad('Brak uprawnień', 'Ta komenda jest przeznaczona wyłącznie dla staffu.'),
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
    }
    await interaction.channel.send(karty.panelWeryfikacji());
    await interaction.reply({
      ...karty.kartaSukces('Panel wystawiony', 'Panel weryfikacji został opublikowany w tym kanale.'),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  },
};
