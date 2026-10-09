const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const karty = require('../utils/karty.js');
const { jestStaff } = require('../utils/uprawnienia.js');
const { log } = require('../utils/logger.js');
const kolory = require('../utils/kolory.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Zbanuj użytkownika (może być też osoba spoza serwera - po ID)')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .setDMPermission(false)
    .addStringOption(o => o.setName('uzytkownik').setDescription('@wzmianka lub ID użytkownika').setRequired(true))
    .addStringOption(o => o.setName('powod').setDescription('Powód bana').setRequired(true))
    .addIntegerOption(o => o.setName('usun-dni').setDescription('Skasuj wiadomości sprawcy z ostatnich N dni (0-7)').setMinValue(0).setMaxValue(7)),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (!jestStaff(interaction.member)) {
      return interaction.editReply(karty.kartaBlad('Brak uprawnień', 'Komenda dla staffu.'));
    }

    // Przyjmujemy wzmiankę <@123> albo gołe ID
    const wejscie = interaction.options.getString('uzytkownik').trim();
    const idDopasowanie = wejscie.match(/^(?:<@!?)?(\d{17,20})>?$/);
    if (!idDopasowanie) {
      return interaction.editReply(karty.kartaBlad('Nieprawidłowe ID', 'Podaj wzmiankę `@osoba` albo samo ID (17-20 cyfr).'));
    }
    const userId = idDopasowanie[1];
    const powod = interaction.options.getString('powod');
    const usunDni = interaction.options.getInteger('usun-dni') || 0;

    if (userId === interaction.user.id) {
      return interaction.editReply(karty.kartaBlad('Nieprawidłowy cel', 'Nie możesz zbanować samego siebie.'));
    }
    if (userId === interaction.client.user.id) {
      return interaction.editReply(karty.kartaBlad('Nieprawidłowy cel', 'Nie możesz zbanować bota.'));
    }
    if (userId === interaction.guild.ownerId) {
      return interaction.editReply(karty.kartaBlad('Nieprawidłowy cel', 'Właściciela serwera nie da się zbanować.'));
    }

    // Jeśli użytkownik jest na serwerze - sprawdź hierarchię ról
    const czlonek = await interaction.guild.members.fetch(userId).catch(() => null);
    if (czlonek && !czlonek.bannable) {
      return interaction.editReply(karty.kartaBlad('Nie można zbanować', 'Ta osoba ma wyższą rolę niż bot.'));
    }

    const wynik = await interaction.guild.members.ban(userId, {
      reason: `${powod} (przez ${interaction.user.tag})`,
      deleteMessageSeconds: usunDni * 24 * 60 * 60,
    }).then(() => null).catch(e => e.message);
    if (wynik) {
      return interaction.editReply(karty.kartaBlad('Ban nieudany', wynik));
    }

    await log(interaction.client, {
      tytul: 'Ban (ręczny)',
      opis: `**Kogo:** <@${userId}> (\`${userId}\`)\n**Powód:** ${powod}\n` +
        (usunDni ? `**Skasowano wiadomości z:** ostatnich ${usunDni} dni\n` : '') +
        `**Zbanował:** <@${interaction.user.id}>`,
      kolor: kolory.blad,
    });

    return interaction.editReply(karty.kartaSukces('Zbanowano', `<@${userId}> zbanowany.\n**Powód:** ${powod}`));
  },
};
