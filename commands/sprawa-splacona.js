const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const karty = require('../utils/karty.js');
const { znajdzSprawe, mozeProwadzicSprawe, oznaczSplate } = require('../modules/sad.js');

const EPHEMERAL_V2 = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sprawa-splacona')
    .setDescription('Oznacz, że osoba wykonała (spłaciła) swoją karę z wyroku sądu')
    .setDMPermission(false)
    .addUserOption(o => o.setName('osoba').setDescription('Kto spłacił karę').setRequired(true))
    .addStringOption(o => o.setName('numer').setDescription('Numer sprawy (SNZ-RRRR-NNNN) — niepotrzebny na kanale sprawy')),

  async execute(interaction) {
    const numer = interaction.options.getString('numer')?.trim();
    const osoba = interaction.options.getUser('osoba');
    const sprawa = znajdzSprawe(numer, interaction.channelId);
    if (!sprawa) {
      return interaction.reply({
        ...karty.kartaBlad('Brak sprawy', numer ? `Nie znaleziono sprawy **${numer}**.` : 'Użyj komendy na kanale sprawy albo podaj jej numer w opcji `numer`.'),
        flags: EPHEMERAL_V2,
      });
    }
    if (!mozeProwadzicSprawe(interaction.member, sprawa)) {
      return interaction.reply({ ...karty.kartaBlad('Brak uprawnień', 'Spłatę oznacza sędzia sprawy, ranga sądu albo administracja.'), flags: EPHEMERAL_V2 });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const wynik = await oznaczSplate(interaction.client, sprawa, osoba.id, interaction.user.id);
    if (wynik.blad) return interaction.editReply(karty.kartaBlad('Nie oznaczono', wynik.blad));
    return interaction.editReply(wynik.stan.splacona
      ? karty.kartaSukces('Sprawa spłacona', `<@${osoba.id}> spłacił(a) karę. Wszystkie kary w sprawie **${sprawa.numer}** zostały wykonane — karta wyroku jest oznaczona jako spłacona.`)
      : karty.kartaSukces('Spłata zapisana', `<@${osoba.id}> spłacił(a) karę w sprawie **${sprawa.numer}**.\n⏳ Jeszcze nie spłacili: ${wynik.pozostali.map(z => `<@${z.userId}>`).join(', ')}`));
  },
};
