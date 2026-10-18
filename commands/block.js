const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const karty = require('../utils/karty.js');
const { jestStaff } = require('../utils/uprawnienia.js');
const { log } = require('../utils/logger.js');
const kolory = require('../utils/kolory.js');
const blokady = require('../modules/blokady.js');

const EPHEMERAL_V2 = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;

// Typy globalnej blokady (toggle on/off)
const TYPY_GLOBALNE = new Set(['obrazki', 'gify', 'zalaczniki', 'linki', 'video']);
// Typy filtrów tekstowych (wymagają 'tresc')
const TYPY_TEKSTOWE = new Set(['slowo', 'fraza', 'regex']);

module.exports = {
  data: new SlashCommandBuilder()
    .setName('block')
    .setDescription('Globalne blokady treści: słowa, frazy, regex, obrazki, gify, linki, załączniki, video')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addSubcommand(s => s.setName('dodaj').setDescription('Dodaj blokadę (globalny typ albo konkretne słowo/frazę)')
      .addStringOption(o => o.setName('typ').setDescription('Co blokować').setRequired(true)
        .addChoices(
          { name: 'słowo (cały wyraz, np. „kurwa")', value: 'slowo' },
          { name: 'fraza (dowolny fragment, np. „viva la france")', value: 'fraza' },
          { name: 'regex (zaawansowane)', value: 'regex' },
          { name: 'obrazki', value: 'obrazki' },
          { name: 'gify', value: 'gify' },
          { name: 'wszystkie załączniki', value: 'zalaczniki' },
          { name: 'linki', value: 'linki' },
          { name: 'video', value: 'video' },
        ))
      .addStringOption(o => o.setName('tresc').setDescription('Treść do zablokowania (dla słowa/frazy/regex)').setMaxLength(500)))
    .addSubcommand(s => s.setName('usun').setDescription('Usuń blokadę')
      .addStringOption(o => o.setName('typ').setDescription('Co odblokować').setRequired(true)
        .addChoices(
          { name: 'słowo/fraza/regex (po ID)', value: 'filtr' },
          { name: 'obrazki', value: 'obrazki' },
          { name: 'gify', value: 'gify' },
          { name: 'wszystkie załączniki', value: 'zalaczniki' },
          { name: 'linki', value: 'linki' },
          { name: 'video', value: 'video' },
        ))
      .addIntegerOption(o => o.setName('id').setDescription('ID filtru tekstowego (dla typu „filtr")').setMinValue(1)))
    .addSubcommand(s => s.setName('lista').setDescription('Pokaż wszystkie aktywne blokady i filtry')),

  async execute(interaction) {
    if (!jestStaff(interaction.member)) {
      return interaction.reply({
        ...karty.kartaBlad('Brak uprawnień', 'Komenda tylko dla pełnego staffu (nie helperów).'),
        flags: EPHEMERAL_V2,
      });
    }
    const sub = interaction.options.getSubcommand();

    if (sub === 'lista') {
      const globalne = blokady.listaStanow()
        .map(s => `${s.emoji} \`${s.typ}\` — ${s.aktywna ? '🔒 zablokowane' : '✅ dozwolone'}`)
        .join('\n');
      const filtry = blokady.listaFiltrow()
        .map(f => `**#${f.id}** [${f.typ}] \`${f.tresc.slice(0, 80)}\` — dodał <@${f.dodal}> <t:${Math.floor(f.data / 1000)}:d>`)
        .join('\n') || '_brak filtrów tekstowych_';
      return interaction.reply({
        ...karty.kartaInfo({
          tytul: 'Blokady globalne',
          opis: `**Typy globalne:**\n${globalne}\n\n**Filtry tekstowe:**\n${filtry}`,
          kolor: kolory.info,
        }),
        flags: EPHEMERAL_V2,
      });
    }

    if (sub === 'dodaj') {
      const typ = interaction.options.getString('typ');
      const tresc = interaction.options.getString('tresc');

      if (TYPY_TEKSTOWE.has(typ)) {
        if (!tresc || !tresc.trim()) {
          return interaction.reply({
            ...karty.kartaBlad('Brak treści', `Dla typu \`${typ}\` musisz podać opcję \`tresc\` — co dokładnie zablokować.`),
            flags: EPHEMERAL_V2,
          });
        }
        // Walidacja regex-u, żeby nie dodać wyrażenia, które się wywali przy pierwszej wiadomości
        if (typ === 'regex') {
          try { new RegExp(tresc, 'i'); }
          catch (e) {
            return interaction.reply({
              ...karty.kartaBlad('Nieprawidłowy regex', `Twoje wyrażenie się nie kompiluje: ${e.message}`),
              flags: EPHEMERAL_V2,
            });
          }
        }
        const id = blokady.dodajFiltr(typ, tresc.trim(), interaction.user.id);
        await log(interaction.client, {
          tytul: `Blokada tekstowa — dodano #${id}`,
          opis: `**Typ:** ${typ}\n**Treść:** \`${tresc}\`\n**Dodał:** <@${interaction.user.id}>`,
          kolor: kolory.ostrzezenie,
        });
        return interaction.reply({
          ...karty.kartaSukces(`Dodano filtr #${id}`,
            `**Typ:** ${typ}\n**Treść:** \`${tresc}\`\n\nOd teraz automod usuwa wiadomości zawierające ten wzorzec.`),
          flags: EPHEMERAL_V2,
        });
      }

      if (TYPY_GLOBALNE.has(typ)) {
        blokady.ustawStan(typ, true, interaction.user.id);
        await log(interaction.client, {
          tytul: `Blokada globalna — włączono ${typ}`,
          opis: `**Typ:** ${blokady.etykietaTypu(typ)}\n**Włączył:** <@${interaction.user.id}>`,
          kolor: kolory.ostrzezenie,
        });
        return interaction.reply({
          ...karty.kartaSukces('Zablokowano',
            `${blokady.emojiTypu(typ)} **${blokady.etykietaTypu(typ)}** — automod usuwa takie wiadomości.`),
          flags: EPHEMERAL_V2,
        });
      }

      return interaction.reply({ ...karty.kartaBlad('Nieznany typ', `Typ „${typ}" nie jest rozpoznawany.`), flags: EPHEMERAL_V2 });
    }

    if (sub === 'usun') {
      const typ = interaction.options.getString('typ');
      const id = interaction.options.getInteger('id');

      if (typ === 'filtr') {
        if (!id) {
          return interaction.reply({
            ...karty.kartaBlad('Brak ID', 'Dla typu `filtr` podaj `id` filtru do usunięcia. ID znajdziesz w `/block lista`.'),
            flags: EPHEMERAL_V2,
          });
        }
        const przed = blokady.filtrPoId(id);
        if (!przed) {
          return interaction.reply({
            ...karty.kartaOstrzezenie('Brak filtru', `Nie ma filtru o ID #${id}. Sprawdź listę: \`/block lista\`.`),
            flags: EPHEMERAL_V2,
          });
        }
        blokady.usunFiltr(id);
        await log(interaction.client, {
          tytul: `Blokada tekstowa — usunięto #${id}`,
          opis: `**Typ:** ${przed.typ}\n**Treść:** \`${przed.tresc}\`\n**Usunął:** <@${interaction.user.id}>`,
          kolor: kolory.sukces,
        });
        return interaction.reply({
          ...karty.kartaSukces(`Usunięto filtr #${id}`, `Automod przestał blokować wzorzec \`${przed.tresc.slice(0, 100)}\`.`),
          flags: EPHEMERAL_V2,
        });
      }

      if (TYPY_GLOBALNE.has(typ)) {
        blokady.ustawStan(typ, false, interaction.user.id);
        await log(interaction.client, {
          tytul: `Blokada globalna — wyłączono ${typ}`,
          opis: `**Typ:** ${blokady.etykietaTypu(typ)}\n**Wyłączył:** <@${interaction.user.id}>`,
          kolor: kolory.sukces,
        });
        return interaction.reply({
          ...karty.kartaSukces('Odblokowano',
            `${blokady.emojiTypu(typ)} **${blokady.etykietaTypu(typ)}** — od teraz przechodzą normalnie.`),
          flags: EPHEMERAL_V2,
        });
      }

      return interaction.reply({ ...karty.kartaBlad('Nieznany typ', `Typ „${typ}" nie jest rozpoznawany.`), flags: EPHEMERAL_V2 });
    }
  },
};
