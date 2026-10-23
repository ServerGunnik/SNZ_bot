const { SlashCommandBuilder, MessageFlags } = require('discord.js');
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
      `${wynik.blad}\n\n**Sprawdź:** bot musi mieć na serwerze uprawnienia „Zarządzanie kanałami” i „Zarządzanie rolami”.`));
  }

  await log(interaction.client, {
    tytul: 'Rekrutacja — utworzono kanały',
    opis: `**Poczekalnia:** <#${wynik.poczekalnia.id}>\n**Pokój rekrutacyjny:** <#${wynik.pokoj.id}>\n**Kategoria:** ${wynik.kategoria.name}\n**Utworzył:** <@${interaction.user.id}>`,
    kolor: kolory.info,
  });

  return interaction.editReply(karty.kartaSukces('Rekrutacja uruchomiona',
    `**Poczekalnia:** <#${wynik.poczekalnia.id}> — kandydaci dołączają tutaj i nie mogą mówić.\n` +
    `**Rekrutacja:** <#${wynik.pokoj.id}> — widoczna tylko dla staffu. Przenieś kandydata z poczekalni (prawy klik → Przenieś do) — tutaj może normalnie rozmawiać.\n\n` +
    'Po skończeniu rekrutacji: `/recru usun` — bot usunie kanały rekrutacji.' +
    (wynik.brakMoveMembers ? '\n-# Bot nie ma uprawnienia „Przenieś członków” — przenosić kandydatów musi staff z tym uprawnieniem.' : '')));
}

async function usunKanaly(interaction) {
  const wynik = await rekrutacja.usun(interaction.guild, interaction.user.tag);

  if (wynik.nic) {
    return interaction.editReply(karty.kartaOstrzezenie('Brak aktywnej rekrutacji', 'Nic do usunięcia. Użyj `/recru stworz` żeby zacząć.'));
  }

  const usuniete = wynik.usuniete.length ? wynik.usuniete.join(', ') : '_nic — kanały już nie istniały_';
  await log(interaction.client, {
    tytul: 'Rekrutacja — usunięto kanały',
    opis: `**Usunięto:** ${usuniete}` +
      (wynik.nieUsuniete.length ? `\n**Nie udało się usunąć:** ${wynik.nieUsuniete.join(', ')}` : '') +
      `\n**Zakończył:** <@${interaction.user.id}>`,
    kolor: kolory.neutralny,
  });

  if (wynik.nieUsuniete.length) {
    return interaction.editReply(karty.kartaOstrzezenie('Nie wszystko usunięto',
      `Usunięto: ${usuniete}\nNie udało się usunąć: **${wynik.nieUsuniete.join(', ')}** — sprawdź uprawnienia bota i użyj \`/recru usun\` ponownie.`));
  }
  return interaction.editReply(karty.kartaSukces('Rekrutacja zakończona', `Usunięto: ${usuniete}`));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('recru')
    .setDescription('System rekrutacji: poczekalnia + kanał rozmów (staff)')
    // Bez domyślnego wymogu „Zarządzanie kanałami” - inaczej staff bez tego uprawnienia nie widział komendy.
    // Dostęp sprawdza jestStaff poniżej.
    .setDMPermission(false)
    .addSubcommand(s => s.setName('stworz').setDescription('Utwórz poczekalnię rekrutacyjną i kanał Rekrutacja'))
    .addSubcommand(s => s.setName('usun').setDescription('Usuń wszystkie kanały utworzone przez rekrutację')),

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
