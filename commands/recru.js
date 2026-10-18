const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const karty = require('../utils/karty.js');
const { jestStaff } = require('../utils/uprawnienia.js');
const { log } = require('../utils/logger.js');
const kolory = require('../utils/kolory.js');
const rekrutacja = require('../modules/rekrutacja.js');

async function stworzKanaly(interaction) {
  const wynik = await rekrutacja.stworz(interaction.guild, interaction.user.id);

  if (wynik.blad === 'już trwa') {
    const poczekalnia = interaction.guild.channels.cache.get(wynik.istniejaca.poczekalnia_id);
    const pokoj = interaction.guild.channels.cache.get(wynik.istniejaca.pokoj_id);
    return interaction.editReply(karty.kartaOstrzezenie('Rekrutacja już trwa',
      `Istniejące kanały: ${poczekalnia ? `<#${poczekalnia.id}>` : '_poczekalnia usunięta_'} / ${pokoj ? `<#${pokoj.id}>` : '_pokój usunięty_'}\nNajpierw zakończ: \`/recru usun\``));
  }
  if (wynik.blad) {
    return interaction.editReply(karty.kartaBlad('Nie udało się utworzyć',
      `${wynik.blad}\n\n**Sprawdź:** bot musi mieć uprawnienie "Zarządzanie kanałami" na serwerze, a jego rola musi być **wyżej** niż role staff/helper (żeby mógł na nich ustawić overwrite'y).`));
  }

  await log(interaction.client, {
    tytul: 'Rekrutacja — utworzono kanały',
    opis: `**Poczekalnia:** <#${wynik.poczekalnia.id}>\n**Pokój rekrutacyjny:** <#${wynik.pokoj.id}>\n**Kategoria:** ${wynik.kategoria.name}\n**Utworzył:** <@${interaction.user.id}>`,
    kolor: kolory.info,
  });

  return interaction.editReply(karty.kartaSukces('Rekrutacja uruchomiona',
    `**Poczekalnia:** <#${wynik.poczekalnia.id}> — kandydaci dołączają tutaj. Bot ich automatycznie wycisza przy wejściu (mikrofon zablokowany).\n` +
    `**Pokój rekrutacyjny:** <#${wynik.pokoj.id}> — widoczny tylko dla staffu. Przenieś kandydata z poczekalni (prawy klik → Przenieś) — bot auto-odciszy go po opuszczeniu poczekalni.\n\n` +
    'Po skończeniu rekrutacji: `/recru usun` — bot skasuje oba kanały.'));
}

async function usunKanaly(interaction) {
  const wynik = await rekrutacja.usun(interaction.guild, interaction.user.tag);

  if (wynik.nic) {
    return interaction.editReply(karty.kartaOstrzezenie('Brak aktywnej rekrutacji', 'Nic do usunięcia. Użyj `/recru stworz` żeby zacząć.'));
  }

  await log(interaction.client, {
    tytul: 'Rekrutacja — usunięto kanały',
    opis: `**Usunięto:** ${wynik.usuniete.length ? wynik.usuniete.join(', ') : '_nic (kanały już nie istniały)_'}\n**Zakończył:** <@${interaction.user.id}>`,
    kolor: kolory.neutralny,
  });

  return interaction.editReply(karty.kartaSukces('Rekrutacja zakończona',
    `Usunięto: ${wynik.usuniete.length ? wynik.usuniete.join(', ') : '_nic — kanały już nie istniały_'}`));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('recru')
    .setDescription('System rekrutacji: poczekalnia + pokój do rozmów')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .setDMPermission(false)
    .addSubcommand(s => s.setName('stworz').setDescription('Utwórz poczekalnię i pokój rekrutacyjny'))
    .addSubcommand(s => s.setName('usun').setDescription('Usuń kanały rekrutacyjne (zakończ sesję)')),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (!jestStaff(interaction.member)) {
      return interaction.editReply(karty.kartaBlad('Brak uprawnień', 'Komenda tylko dla pełnego staffu.'));
    }

    const sub = interaction.options.getSubcommand();
    if (sub === 'stworz') return stworzKanaly(interaction);
    if (sub === 'usun') return usunKanaly(interaction);
  },
};
