const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const db = require('../database/db.js');
const config = require('../config.js');
const karty = require('../utils/karty.js');
const { jestStaff } = require('../utils/uprawnienia.js');

const LIMIT = 15;
const q = {
  tickety: db.prepare(`SELECT * FROM tickety WHERE user_id = ? ORDER BY id DESC LIMIT ${LIMIT}`),
  liczba: db.prepare('SELECT COUNT(*) c FROM tickety WHERE user_id = ?'),
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('historia-ticketow')
    .setDescription('Historia zgłoszeń gracza (administracja)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .setDMPermission(false)
    .addUserOption(o => o.setName('uzytkownik').setDescription('Gracz').setRequired(true)),

  async execute(interaction) {
    if (!jestStaff(interaction.member)) {
      return interaction.reply({
        ...karty.kartaBlad('Brak uprawnień', 'Historia ticketów jest dostępna tylko dla administracji.'),
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
    }
    const user = interaction.options.getUser('uzytkownik');
    const tickety = q.tickety.all(user.id).map(t => ({ ...t, guild_id: interaction.guild.id }));
    await interaction.reply({
      ...karty.kartaHistoriiUzytkownika({
        userId: user.id,
        tickety,
        total: q.liczba.get(user.id).c,
        nazwyKategorii: Object.fromEntries(config.tickety.kategorie.map(k => [k.value, k.label])),
        wyniki: config.tickety.wyniki,
      }),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  },
};
