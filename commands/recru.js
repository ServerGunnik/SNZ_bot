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
      `Istniejące kanały: ${poczekalnia ? `<#${poczekalnia.id}>` : '_poczekalnia usunięta_'} / ${pokoj ? `<#${pokoj.id}>` : '_rekrutacja usunięta_'}\nNajpierw zakończ: \`/recru usun\``));
  }
  if (wynik.blad) {
    return interaction.editReply(karty.kartaBlad('Nie udało się utworzyć',
      `${wynik.blad}\n\n**Sprawdź:** bot musi mieć na serwerze uprawnienia „Zarządzanie kanałami”, „Zarządzanie rolami” i „Przenoszenie członków”.`));
  }

  const bezStaffu = wynik.staffyIds.length ? '' : '\n\n⚠️ Nie znaleziono na serwerze żadnej roli staffu z `.env` — kanały widzą tylko bot i administratorzy.';

  await log(interaction.client, {
    tytul: 'Rekrutacja — utworzono kanały',
    opis: `**Poczekalnia:** <#${wynik.poczekalnia.id}>\n**Rekrutacja:** <#${wynik.pokoj.id}>\n**Kategoria:** ${wynik.kategoria.name}\n**Utworzył:** <@${interaction.user.id}>`,
    kolor: kolory.info,
  });

  return interaction.editReply(karty.kartaSukces('Rekrutacja uruchomiona',
    `**Poczekalnia:** <#${wynik.poczekalnia.id}> — kandydaci dołączają tutaj, ale nie mogą mówić.\n` +
    `**Rekrutacja:** <#${wynik.pokoj.id}> — widoczna tylko dla staffu. Przenieś kandydata z poczekalni (prawy klik → Przenieś do) — bot da mu prawo mówienia na tym kanale.\n\n` +
    `Po skończeniu rekrutacji: \`/recru usun\` — bot skasuje kanały.${bezStaffu}`));
}

async function usunKanaly(interaction) {
  const wynik = await rekrutacja.usun(interaction.guild, interaction.user.tag);

  if (wynik.nic) {
    return interaction.editReply(karty.kartaOstrzezenie('Brak aktywnej rekrutacji', 'Nic do usunięcia. Użyj `/recru stworz` żeby zacząć.'));
  }

  const lista = wynik.usuniete.length ? wynik.usuniete.join(', ') : '_nic (kanały już nie istniały)_';
  if (wynik.bledy.length) {
    return interaction.editReply(karty.kartaBlad('Nie wszystko udało się usunąć',
      `**Usunięto:** ${lista}\n**Błędy:**\n${wynik.bledy.join('\n')}\n\nSprawdź uprawnienie bota „Zarządzanie kanałami” i spróbuj ponownie \`/recru usun\`.`));
  }

  await log(interaction.client, {
    tytul: 'Rekrutacja — usunięto kanały',
    opis: `**Usunięto:** ${lista}\n**Zakończył:** <@${interaction.user.id}>`,
    kolor: kolory.neutralny,
  });

  return interaction.editReply(karty.kartaSukces('Rekrutacja zakończona', `**Usunięto:** ${lista}`));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('recru')
    .setDescription('System rekrutacji: poczekalnia + kanał do rozmów')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .setDMPermission(false)
    .addSubcommand(s => s.setName('stworz').setNameLocalizations({ pl: 'stwórz' })
      .setDescription('Utwórz poczekalnię i kanał rekrutacji'))
    .addSubcommand(s => s.setName('usun').setNameLocalizations({ pl: 'usuń' })
      .setDescription('Usuń kanały rekrutacyjne (zakończ sesję)')),

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
