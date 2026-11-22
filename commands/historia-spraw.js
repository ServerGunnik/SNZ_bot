const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const karty = require('../utils/karty.js');
const { widokHistorii, widokSzczegolow, pelnyDostep, q } = require('../modules/historia-spraw.js');

const EPHEMERAL_V2 = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('historia-spraw')
    .setDescription('Historia spraw sądowych: wyroki, kary i spłaty')
    .setDMPermission(false)
    .addUserOption(o => o.setName('gracz').setDescription('Sprawy tej osoby (pozwany, pozywający, sędzia, prokurator, ukarany)'))
    .addUserOption(o => o.setName('sedzia').setDescription('Sprawy prowadzone przez tego sędziego'))
    .addStringOption(o => o.setName('status').setDescription('Które sprawy pokazać (domyślnie wszystkie)')
      .addChoices(
        { name: 'wszystkie', value: 'wszystkie' },
        { name: 'w toku', value: 'w_toku' },
        { name: 'zakończone (wyrok / zamknięte)', value: 'zakonczone' },
      ))
    .addStringOption(o => o.setName('numer').setDescription('Szczegóły jednej sprawy (SNZ-RRRR-NNNN)')),

  async execute(interaction) {
    const numer = interaction.options.getString('numer')?.trim();
    if (numer) {
      const wynik = widokSzczegolow(interaction.member, q.poNumerze.get(numer), { guildId: interaction.guild.id });
      if (wynik.blad) {
        return interaction.reply({
          ...karty.kartaBlad('Brak sprawy', wynik.blad === 'Nie znaleziono takiej sprawy.' ? `Nie znaleziono sprawy **${numer}**.` : wynik.blad),
          flags: EPHEMERAL_V2,
        });
      }
      return interaction.reply({ ...wynik, flags: EPHEMERAL_V2 });
    }

    const gracz = interaction.options.getUser('gracz');
    const sedzia = interaction.options.getUser('sedzia');
    // Bez uprawnień administracji/sądu filtry innych osób są ignorowane - widać tylko własne sprawy
    if (!pelnyDostep(interaction.member) && ((gracz && gracz.id !== interaction.user.id) || sedzia)) {
      return interaction.reply({
        ...karty.kartaBlad('Brak uprawnień', 'Historię innych osób i sędziów przegląda administracja i ranga sądu. Możesz zobaczyć swoje sprawy: `/historia-spraw` bez opcji.'),
        flags: EPHEMERAL_V2,
      });
    }
    return interaction.reply({
      ...widokHistorii(interaction.member, {
        gracz: gracz?.id || null,
        sedzia: sedzia?.id || null,
        status: interaction.options.getString('status') || 'wszystkie',
        strona: 1,
        guildId: interaction.guild.id,
      }),
      flags: EPHEMERAL_V2,
    });
  },
};
