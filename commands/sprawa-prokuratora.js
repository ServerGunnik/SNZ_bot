const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const db = require('../database/db.js');
const karty = require('../utils/karty.js');
const { jestProkuratorem } = require('../utils/uprawnienia.js');
const { przypiszProkuratora } = require('../modules/sad.js');

const EPHEMERAL_V2 = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;

const q = {
  poNumerze: db.prepare('SELECT * FROM sprawy WHERE numer = ? COLLATE NOCASE'),
  poKanale: db.prepare('SELECT * FROM sprawy WHERE kanal_id = ?'),
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sprawa-prokuratora')
    .setDescription('Prokurator: przypisz siebie jako oskarżającego w sprawie sądowej')
    .setDMPermission(false)
    .addStringOption(o => o.setName('numer').setDescription('Numer sprawy (SNZ-RRRR-NNNN) — niepotrzebny na kanale sprawy')),

  async execute(interaction) {
    if (!jestProkuratorem(interaction.member)) {
      return interaction.reply({ ...karty.kartaBlad('Brak uprawnień', 'Ta komenda jest tylko dla rangi Prokurator.'), flags: EPHEMERAL_V2 });
    }
    const numer = interaction.options.getString('numer')?.trim();
    const sprawa = numer ? q.poNumerze.get(numer) : q.poKanale.get(interaction.channelId);
    if (!sprawa) {
      return interaction.reply({
        ...karty.kartaBlad('Brak sprawy', numer
          ? `Nie znaleziono sprawy **${numer}**.`
          : 'Użyj komendy na kanale sprawy sądowej albo podaj jej numer w opcji `numer`.'),
        flags: EPHEMERAL_V2,
      });
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const wynik = await przypiszProkuratora(interaction.guild, sprawa, interaction.member);
    if (wynik.blad) return interaction.editReply(karty.kartaBlad('Nie przypisano', wynik.blad));
    return interaction.editReply(karty.kartaSukces('Jesteś oskarżającym',
      `⚖️ **Oskarżający:** Prokurator — ${wynik.nick}\n**Sprawa:** ${sprawa.numer}` +
      (sprawa.kanal_id ? ` — <#${sprawa.kanal_id}>` : '')));
  },
};
