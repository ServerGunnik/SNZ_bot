const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const karty = require('../utils/karty.js');
const { jestStaff } = require('../utils/uprawnienia.js');
const { log } = require('../utils/logger.js');
const kolory = require('../utils/kolory.js');
const blokady = require('../modules/blokady.js');

const EPHEMERAL_V2 = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('blok')
    .setDescription('Globalna blokada typów treści (gify, obrazki, linki itp.)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addSubcommand(s => s.setName('wlacz').setDescription('Włącz blokadę danego typu')
      .addStringOption(o => o.setName('typ').setDescription('Co blokować').setRequired(true)
        .addChoices(
          { name: 'obrazki', value: 'obrazki' },
          { name: 'gify', value: 'gify' },
          { name: 'załączniki (wszystkie)', value: 'zalaczniki' },
          { name: 'linki', value: 'linki' },
          { name: 'video', value: 'video' },
        )))
    .addSubcommand(s => s.setName('wylacz').setDescription('Wyłącz blokadę danego typu')
      .addStringOption(o => o.setName('typ').setDescription('Co odblokować').setRequired(true)
        .addChoices(
          { name: 'obrazki', value: 'obrazki' },
          { name: 'gify', value: 'gify' },
          { name: 'załączniki (wszystkie)', value: 'zalaczniki' },
          { name: 'linki', value: 'linki' },
          { name: 'video', value: 'video' },
        )))
    .addSubcommand(s => s.setName('lista').setDescription('Pokaż aktualny stan wszystkich blokad')),

  async execute(interaction) {
    if (!jestStaff(interaction.member)) {
      return interaction.reply({
        ...karty.kartaBlad('Brak uprawnień', 'Komenda tylko dla pełnego staffu (nie helperów).'),
        flags: EPHEMERAL_V2,
      });
    }
    const sub = interaction.options.getSubcommand();

    if (sub === 'lista') {
      const opis = blokady.listaStanow()
        .map(s => `${s.emoji} **${s.typ}** — ${s.aktywna ? '🔒 zablokowane' : '✅ dozwolone'}\n-# ${s.label}`)
        .join('\n\n');
      return interaction.reply({
        ...karty.kartaInfo({ tytul: 'Blokady globalne', opis, kolor: kolory.info }),
        flags: EPHEMERAL_V2,
      });
    }

    const typ = interaction.options.getString('typ');
    const aktywna = sub === 'wlacz';
    blokady.ustawStan(typ, aktywna, interaction.user.id);

    const akcja = aktywna ? 'zablokowano' : 'odblokowano';
    await log(interaction.client, {
      tytul: `Blokada — ${akcja} ${typ}`,
      opis: `**Typ:** ${blokady.etykietaTypu(typ)}\n**Stan:** ${aktywna ? '🔒 zablokowane' : '✅ dozwolone'}\n**Zrobił:** <@${interaction.user.id}>`,
      kolor: aktywna ? kolory.ostrzezenie : kolory.sukces,
    });

    return interaction.reply({
      ...karty.kartaSukces(aktywna ? 'Zablokowano' : 'Odblokowano',
        `${blokady.emojiTypu(typ)} **${blokady.etykietaTypu(typ)}** — ${aktywna ? 'od teraz automod usuwa takie wiadomości' : 'od teraz przechodzą normalnie'}.`),
      flags: EPHEMERAL_V2,
    });
  },
};
