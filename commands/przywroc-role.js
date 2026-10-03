const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const config = require('../config.js');
const karty = require('../utils/karty.js');
const { log } = require('../utils/logger.js');
const kolory = require('../utils/kolory.js');
const { przywrocRole } = require('../modules/ochrona-logow.js');

const EPHEMERAL_V2 = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('przywroc-role')
    .setDescription('Przywróć role odebrane za usunięcie logu (właściciel / technik)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addUserOption(o => o.setName('uzytkownik').setDescription('Komu przywrócić role').setRequired(true)),

  async execute(interaction) {
    const uprawniony = interaction.user.id === interaction.guild.ownerId || config.technicy.includes(interaction.user.id);
    if (!uprawniony) {
      return interaction.reply({ ...karty.kartaBlad('Brak uprawnień', 'Role przywraca tylko właściciel serwera albo technik bota.'), flags: EPHEMERAL_V2 });
    }
    const user = interaction.options.getUser('uzytkownik');
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const wynik = await przywrocRole(interaction.guild, user.id);
    if (!wynik.ok) return interaction.editReply(karty.kartaBlad('Nie przywrócono ról', wynik.powod));
    await log(interaction.client, {
      tytul: 'Przywrócono role po usunięciu logu',
      opis: `**Komu:** <@${user.id}>\n**Role:** ${wynik.role.map(id => `<@&${id}>`).join(', ') || '_brak_'}\n**Przywrócił:** <@${interaction.user.id}>`,
      kolor: kolory.sukces,
      kanal: 'logiAntynuke',
    });
    await interaction.editReply(karty.kartaSukces('Role przywrócone', `<@${user.id}> odzyskał role (${wynik.role.length}), wyciszenie zdjęte.`));
  },
};
