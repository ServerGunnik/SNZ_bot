const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const karty = require('../utils/karty.js');
const { jestStaff } = require('../utils/uprawnienia.js');
const { log } = require('../utils/logger.js');
const kolory = require('../utils/kolory.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unban')
    .setDescription('Odbanuj użytkownika (po ID)')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .setDMPermission(false)
    .addStringOption(o => o.setName('id').setDescription('ID zbanowanego').setRequired(true))
    .addStringOption(o => o.setName('powod').setDescription('Powód odbanowania')),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (!jestStaff(interaction.member)) {
      return interaction.editReply(karty.kartaBlad('Brak uprawnień', 'Komenda dla staffu.'));
    }

    const wejscie = interaction.options.getString('id').trim();
    const idDopasowanie = wejscie.match(/^(?:<@!?)?(\d{17,20})>?$/);
    if (!idDopasowanie) {
      return interaction.editReply(karty.kartaBlad('Nieprawidłowe ID', 'Podaj samo ID (17-20 cyfr) albo wzmiankę.'));
    }
    const userId = idDopasowanie[1];
    const powod = interaction.options.getString('powod') || 'Zdjęto ręcznie';

    const banInfo = await interaction.guild.bans.fetch(userId).catch(() => null);
    if (!banInfo) {
      return interaction.editReply(karty.kartaOstrzezenie('Brak bana', 'Ta osoba nie jest zbanowana na tym serwerze.'));
    }

    const wynik = await interaction.guild.members.unban(userId, `${powod} (przez ${interaction.user.tag})`)
      .then(() => null).catch(e => e.message);
    if (wynik) {
      return interaction.editReply(karty.kartaBlad('Odban nieudany', wynik));
    }

    await log(interaction.client, {
      tytul: 'Odbanowano (ręcznie)',
      opis: `**Kogo:** <@${userId}> (\`${userId}\`)\n**Powód:** ${powod}\n**Odbanował:** <@${interaction.user.id}>`,
      kolor: kolory.sukces,
    });

    return interaction.editReply(karty.kartaSukces('Odbanowano', `<@${userId}> może znowu dołączyć na serwer.`));
  },
};
