const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const db = require('../database/db.js');
const config = require('../config.js');
const karty = require('../utils/karty.js');
const { jestStaff } = require('../utils/uprawnienia.js');
const { log } = require('../utils/logger.js');
const kolory = require('../utils/kolory.js');

const q = {
  wstaw: db.prepare('INSERT INTO ostrzezenia (user_id, powod, wystawca_id, data) VALUES (?, ?, ?, ?)'),
  licz: db.prepare('SELECT COUNT(*) c FROM ostrzezenia WHERE user_id = ?'),
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Wystaw ostrzeżenie użytkownikowi')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setDMPermission(false)
    .addUserOption(o => o.setName('uzytkownik').setDescription('Osoba do ostrzeżenia').setRequired(true))
    .addStringOption(o => o.setName('powod').setDescription('Powód').setRequired(true)),

  async execute(interaction) {
    if (!jestStaff(interaction.member)) {
      return interaction.reply({
        ...karty.kartaBlad('Brak uprawnień', 'Tylko staff.'),
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
    }
    const user = interaction.options.getUser('uzytkownik');
    const powod = interaction.options.getString('powod');
    const info = q.wstaw.run(user.id, powod, interaction.user.id, Date.now());
    const suma = q.licz.get(user.id).c;

    // Progi
    let auto = '';
    try {
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      if (member) {
        if (suma >= config.ostrzezenia.prog.ban) {
          await member.ban({ reason: `Automat: ${suma} ostrzeżeń` }).catch(() => {});
          auto = `\n**Autokara:** BAN po ${suma} warnach.`;
        } else if (suma >= config.ostrzezenia.prog.mute) {
          await member.timeout(config.ostrzezenia.dlugoscMuteMs, `Automat: ${suma} ostrzeżeń`).catch(() => {});
          auto = `\n**Autokara:** wyciszenie ${Math.round(config.ostrzezenia.dlugoscMuteMs / 60000)} min.`;
        }
      }
    } catch (_) {}

    await log(interaction.client, {
      tytul: 'Wystawiono ostrzeżenie',
      opis: `**Użytkownik:** <@${user.id}>\n**Powód:** ${powod}\n**Wystawca:** <@${interaction.user.id}>\n**Suma warnów:** ${suma}${auto}`,
      kolor: kolory.ostrzezenie,
    });

    await interaction.reply({
      ...karty.kartaSukces('Ostrzeżenie wystawione', `\`#${info.lastInsertRowid}\` dla <@${user.id}>. Suma: **${suma}**.${auto}`),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  },
};
