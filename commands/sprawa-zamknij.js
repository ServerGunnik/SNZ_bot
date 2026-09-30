const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const db = require('../database/db.js');
const karty = require('../utils/karty.js');
const { jestStaff } = require('../utils/uprawnienia.js');
const { zamknijSprawe } = require('../modules/sad.js');

const q = { poNumerze: db.prepare('SELECT * FROM sprawy WHERE numer = ?') };

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sprawa-zamknij')
    .setDescription('Zamknij sprawę sądową (staff)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addStringOption(o => o.setName('numer').setDescription('Numer sprawy (SNZ-YYYY-NNNN)').setRequired(true)),
  async execute(interaction) {
    if (!jestStaff(interaction.member)) {
      return interaction.reply({
        ...karty.kartaBlad('Brak uprawnień', 'Tylko staff.'),
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
    }
    const numer = interaction.options.getString('numer').trim();
    const sprawa = q.poNumerze.get(numer);
    if (!sprawa) return interaction.reply({
      ...karty.kartaBlad('Brak sprawy', `Nie znaleziono ${numer}.`),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await zamknijSprawe(interaction.client, sprawa.id, interaction.user.id);
    await interaction.editReply(karty.kartaSukces('Sprawa zamknięta', `**${numer}** — kanał zostanie usunięty.`));
  },
};
