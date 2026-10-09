const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const karty = require('../utils/karty.js');
const { jestStaff } = require('../utils/uprawnienia.js');
const { log } = require('../utils/logger.js');
const kolory = require('../utils/kolory.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unmute')
    .setDescription('Zdejmij wyciszenie z użytkownika')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setDMPermission(false)
    .addUserOption(o => o.setName('uzytkownik').setDescription('Komu zdjąć mute').setRequired(true))
    .addStringOption(o => o.setName('powod').setDescription('Powód zdjęcia')),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (!jestStaff(interaction.member)) {
      return interaction.editReply(karty.kartaBlad('Brak uprawnień', 'Komenda dla staffu.'));
    }

    const user = interaction.options.getUser('uzytkownik');
    const powod = interaction.options.getString('powod') || 'Zdjęto ręcznie';

    const czlonek = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (!czlonek) {
      return interaction.editReply(karty.kartaBlad('Brak użytkownika', 'Tej osoby nie ma na serwerze.'));
    }
    if (!czlonek.isCommunicationDisabled()) {
      return interaction.editReply(karty.kartaOstrzezenie('Bez mute', `<@${user.id}> nie jest wyciszony.`));
    }
    if (!czlonek.moderatable) {
      return interaction.editReply(karty.kartaBlad('Brak uprawnień bota', 'Bot nie ma uprawnień nad tą osobą.'));
    }

    const wynik = await czlonek.timeout(null, `${powod} (przez ${interaction.user.tag})`).then(() => null).catch(e => e.message);
    if (wynik) {
      return interaction.editReply(karty.kartaBlad('Nie udało się zdjąć mute', wynik));
    }

    await log(interaction.client, {
      tytul: 'Zdjęto mute (ręcznie)',
      opis: `**Kogo:** <@${user.id}>\n**Powód:** ${powod}\n**Zdjął:** <@${interaction.user.id}>`,
      kolor: kolory.sukces,
    });

    return interaction.editReply(karty.kartaSukces('Zdjęto mute', `<@${user.id}> może znowu pisać.`));
  },
};
