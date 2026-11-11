const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const karty = require('../utils/karty.js');
const { znajdzSprawe, mozeProwadzicSprawe, dodajUczestnika } = require('../modules/sad.js');

const EPHEMERAL_V2 = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sprawa-dodaj')
    .setDescription('Dodaj osobę do rozprawy sądowej (dostęp do kanału sprawy)')
    .setDMPermission(false)
    .addUserOption(o => o.setName('osoba').setDescription('Kogo dodać do rozprawy').setRequired(true))
    .addStringOption(o => o.setName('numer').setDescription('Numer sprawy (SNZ-RRRR-NNNN) — niepotrzebny na kanale sprawy')),

  async execute(interaction) {
    const numer = interaction.options.getString('numer')?.trim();
    const sprawa = znajdzSprawe(numer, interaction.channelId);
    if (!sprawa) {
      return interaction.reply({
        ...karty.kartaBlad('Brak sprawy', numer ? `Nie znaleziono sprawy **${numer}**.` : 'Użyj komendy na kanale sprawy albo podaj jej numer w opcji `numer`.'),
        flags: EPHEMERAL_V2,
      });
    }
    if (!mozeProwadzicSprawe(interaction.member, sprawa)) {
      return interaction.reply({ ...karty.kartaBlad('Brak uprawnień', 'Osoby do rozprawy dodaje sędzia sprawy, ranga sądu albo administracja.'), flags: EPHEMERAL_V2 });
    }
    const osoba = interaction.options.getUser('osoba');

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const wynik = await dodajUczestnika(interaction.client, sprawa, osoba.id, interaction.user.id);
    if (wynik.blad) return interaction.editReply(karty.kartaBlad('Nie dodano', wynik.blad));
    return interaction.editReply(karty.kartaSukces('Dodano do rozprawy', `<@${osoba.id}> ma teraz dostęp do <#${wynik.kanalId}> (sprawa **${sprawa.numer}**).`));
  },
};
