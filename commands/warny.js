const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const karty = require('../utils/karty.js');
const { jestStaff } = require('../utils/uprawnienia.js');
const config = require('../config.js');
const { ostrzezeniaUzytkownika, powodNieaktywnosci } = require('../modules/ostrzezenia.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warny')
    .setDescription('Historia ostrzeżeń użytkownika')
    .setDMPermission(false)
    .addUserOption(o => o.setName('uzytkownik').setDescription('Osoba').setRequired(true)),
  async execute(interaction) {
    const user = interaction.options.getUser('uzytkownik');
    if (!jestStaff(interaction.member) && interaction.user.id !== user.id) {
      return interaction.reply({
        ...karty.kartaBlad('Brak uprawnień', 'Możesz sprawdzić tylko własne ostrzeżenia.'),
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
    }
    const warny = ostrzezeniaUzytkownika(user.id).map(w => ({ ...w, nieaktywne: powodNieaktywnosci(w) }));
    await interaction.reply({
      ...karty.kartaOstrzezen({
        user_id: user.id, warny, avatar: user.displayAvatarURL({ size: 128 }),
        waznoscDni: config.ostrzezenia.waznoscDni, progi: config.ostrzezenia.prog,
      }),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  },
};
