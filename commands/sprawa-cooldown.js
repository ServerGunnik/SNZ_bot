const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const karty = require('../utils/karty.js');
const { mozeZdjacCooldownSadu } = require('../utils/uprawnienia.js');
const { log } = require('../utils/logger.js');
const kolory = require('../utils/kolory.js');
const { stanCooldownu, zdejmijCooldown } = require('../modules/sad.js');

const EPHEMERAL_V2 = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sprawa-cooldown')
    .setDescription('Usuń cooldown na tworzenie rozpraw wybranej osobie (Admin/Sędzia, Założyciel, Technik)')
    .setDMPermission(false)
    .addUserOption(o => o.setName('uzytkownik').setDescription('Komu zdjąć cooldown').setRequired(true)),

  async execute(interaction) {
    if (!mozeZdjacCooldownSadu(interaction.member)) {
      return interaction.reply({
        ...karty.kartaBlad('Brak uprawnień', 'Cooldown rozpraw może zdjąć tylko Admin/Sędzia, Założyciel albo Technik.'),
        flags: EPHEMERAL_V2,
      });
    }
    const user = interaction.options.getUser('uzytkownik');
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    const { kolejnyMozliwy } = stanCooldownu(member, user.id);
    zdejmijCooldown(user.id, interaction.user.id);
    await log(interaction.client, {
      tytul: 'Zdjęto cooldown rozpraw',
      opis: `**Komu:** <@${user.id}>\n**Zdjął:** <@${interaction.user.id}>\n**Cooldown był aktywny:** ${kolejnyMozliwy ? `tak (do <t:${Math.floor(kolejnyMozliwy / 1000)}:t>)` : 'nie'}`,
      kolor: kolory.ostrzezenie,
      kanal: 'logiSad',
    });
    return interaction.reply({
      ...karty.kartaSukces('Cooldown zdjęty', kolejnyMozliwy
        ? `<@${user.id}> może od razu utworzyć kolejną rozprawę.`
        : `<@${user.id}> nie miał aktywnego cooldownu — i tak może utworzyć rozprawę.`),
      flags: EPHEMERAL_V2,
    });
  },
};
