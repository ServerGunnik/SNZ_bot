const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const db = require('../database/db.js');
const karty = require('../utils/karty.js');
const { jestStaff } = require('../utils/uprawnienia.js');
const { log } = require('../utils/logger.js');
const kolory = require('../utils/kolory.js');

const q = {
  poId: db.prepare('SELECT * FROM ostrzezenia WHERE id = ?'),
  usun: db.prepare('DELETE FROM ostrzezenia WHERE id = ?'),
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('usun-warn')
    .setDescription('Usuń ostrzeżenie po ID')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setDMPermission(false)
    .addIntegerOption(o => o.setName('id').setDescription('ID ostrzeżenia').setRequired(true)),
  async execute(interaction) {
    if (!jestStaff(interaction.member)) {
      return interaction.reply({
        ...karty.kartaBlad('Brak uprawnień', 'Tylko staff.'),
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
    }
    const id = interaction.options.getInteger('id');
    const w = q.poId.get(id);
    if (!w) return interaction.reply({
      ...karty.kartaBlad('Brak ostrzeżenia', `Nie znaleziono #${id}.`),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
    q.usun.run(id);
    await log(interaction.client, {
      tytul: 'Usunięto ostrzeżenie',
      opis: `**#${id}** dla <@${w.user_id}>\n**Powód pierwotny:** ${w.powod}\n**Usunął:** <@${interaction.user.id}>`,
      kolor: kolory.sukces,
    });
    await interaction.reply({
      ...karty.kartaSukces('Usunięto', `Ostrzeżenie **#${id}** zostało usunięte.`),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  },
};
