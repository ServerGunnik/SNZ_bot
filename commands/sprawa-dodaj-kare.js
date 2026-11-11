const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const karty = require('../utils/karty.js');
const { znajdzSprawe, mozeProwadzicSprawe, dodajKare } = require('../modules/sad.js');

const EPHEMERAL_V2 = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sprawa-dodaj-kare')
    .setDescription('Nałóż dodatkową karę na uczestnika rozprawy (widz, świadek, obrońca…)')
    .setDMPermission(false)
    .addUserOption(o => o.setName('osoba').setDescription('Kogo ukarać').setRequired(true))
    .addStringOption(o => o.setName('kara').setDescription('Jaka kara (np. 5 diamentów, mute 1h)').setRequired(true).setMaxLength(300))
    .addStringOption(o => o.setName('powod').setDescription('Za co (np. przeszkadzanie w rozprawie)').setMaxLength(300))
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
      return interaction.reply({ ...karty.kartaBlad('Brak uprawnień', 'Kary na rozprawie nakłada sędzia sprawy, ranga sądu albo administracja.'), flags: EPHEMERAL_V2 });
    }
    const osoba = interaction.options.getUser('osoba');
    if (osoba.bot) return interaction.reply({ ...karty.kartaBlad('Nie można', 'Nie można ukarać bota.'), flags: EPHEMERAL_V2 });

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const kara = interaction.options.getString('kara').trim();
    const powod = interaction.options.getString('powod')?.trim();
    const wynik = await dodajKare(interaction.client, sprawa, osoba.id, kara, powod, interaction.user.id);
    if (wynik.blad) return interaction.editReply(karty.kartaBlad('Nie nałożono kary', wynik.blad));
    return interaction.editReply(karty.kartaSukces('Kara nałożona',
      `<@${osoba.id}> — **${kara}**${powod ? ` (${powod})` : ''}\n**Sprawa:** ${sprawa.numer}${wynik.kanalId ? ` — <#${wynik.kanalId}>` : ''}\n` +
      'Kara trafiła do logów sądu i historii ostrzeżeń; po jej wykonaniu oznacz ją przez `/sprawa-splacona`.'));
  },
};
