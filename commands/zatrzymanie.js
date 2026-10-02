const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const karty = require('../utils/karty.js');
const { jestStaff } = require('../utils/uprawnienia.js');
const { dodajZglaszajacegoNaKanale } = require('../modules/listy-goncze.js');

const EPHEMERAL_V2 = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('zatrzymanie')
    .setDescription('Zgłoszenia zatrzymania listów gończych (administracja)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .setDMPermission(false)
    .addSubcommand(s => s.setName('dodaj-zglaszajacego').setDescription('Wpuść zgłaszającego na ten kanał zgłoszenia, żeby dopytać o szczegóły')),

  async execute(interaction) {
    if (!jestStaff(interaction.member)) {
      return interaction.reply({ ...karty.kartaBlad('Brak uprawnień', 'Tylko administracja.'), flags: EPHEMERAL_V2 });
    }
    const blad = await dodajZglaszajacegoNaKanale(interaction);
    await interaction.reply({
      ...(blad ? karty.kartaBlad('Nie można dodać', blad) : karty.kartaSukces('Dodano zgłaszającego', 'Zgłaszający widzi teraz ten kanał i dostał ping.')),
      flags: EPHEMERAL_V2,
    });
  },
};
