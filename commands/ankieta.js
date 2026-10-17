const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, ChannelType } = require('discord.js');
const karty = require('../utils/karty.js');
const { maDostepDoModeracji } = require('../utils/uprawnienia.js');
const { log } = require('../utils/logger.js');
const kolory = require('../utils/kolory.js');
const ankiety = require('../modules/ankiety.js');

const MAX_ODPOWIEDZI = 10;  // Limit Discord
const MAX_GODZIN = 168;     // 7 dni - limit natywnej ankiety; dla anonimowej też trzymamy, żeby UX był spójny
const MAX_DL_PYTANIA = 300;
const MAX_DL_ODPOWIEDZI = 55;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ankieta')
    .setDescription('Wystaw ankietę na kanale')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .setDMPermission(false)
    .addStringOption(o => o.setName('pytanie').setDescription('Treść pytania').setRequired(true).setMaxLength(MAX_DL_PYTANIA))
    .addStringOption(o => o.setName('odpowiedzi').setDescription('Opcje oddzielone znakiem | (np. Tak|Nie|Nie wiem). Max 10.').setRequired(true))
    .addIntegerOption(o => o.setName('godziny').setDescription(`Jak długo głosowanie trwa (1-${MAX_GODZIN}, domyślnie 24h)`).setMinValue(1).setMaxValue(MAX_GODZIN))
    .addBooleanOption(o => o.setName('wiele').setDescription('Czy wolno wybrać wiele odpowiedzi (domyślnie: nie)'))
    .addBooleanOption(o => o.setName('anonimowa').setDescription('true = nikt nie zobaczy kto na co głosował (domyślnie: nie)')),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (!maDostepDoModeracji(interaction.member)) {
      return interaction.editReply(karty.kartaBlad('Brak uprawnień', 'Komenda dla staffu i helperów.'));
    }

    const pytanie = interaction.options.getString('pytanie').trim();
    const odpowiedziRaw = interaction.options.getString('odpowiedzi');
    const godziny = interaction.options.getInteger('godziny') || 24;
    const wiele = interaction.options.getBoolean('wiele') ?? false;
    const anonimowa = interaction.options.getBoolean('anonimowa') ?? false;

    const odpowiedzi = odpowiedziRaw.split('|').map(s => s.trim()).filter(Boolean);
    if (odpowiedzi.length < 2) {
      return interaction.editReply(karty.kartaBlad('Za mało opcji',
        'Podaj co najmniej 2 odpowiedzi oddzielone znakiem `|`. Przykład: `Tak|Nie|Nie wiem`.'));
    }
    if (odpowiedzi.length > MAX_ODPOWIEDZI) {
      return interaction.editReply(karty.kartaBlad('Za dużo opcji', `Discord pozwala na maks. ${MAX_ODPOWIEDZI} odpowiedzi w jednej ankiecie.`));
    }
    const zaDluga = odpowiedzi.find(o => o.length > MAX_DL_ODPOWIEDZI);
    if (zaDluga) {
      return interaction.editReply(karty.kartaBlad('Odpowiedź za długa', `Każda opcja do ${MAX_DL_ODPOWIEDZI} znaków. Za długa: „${zaDluga.slice(0, 60)}…".`));
    }

    const kanal = interaction.channel;
    if (!kanal || ![ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.PublicThread, ChannelType.PrivateThread].includes(kanal.type)) {
      return interaction.editReply(karty.kartaBlad('Nieprawidłowy kanał', 'Ankietę można wystawić tylko na kanale tekstowym lub w wątku.'));
    }

    const koniec = Math.floor((Date.now() + godziny * 60 * 60 * 1000) / 1000);

    if (anonimowa) {
      // Własna ankieta z przyciskami - bot sam liczy głosy, nikt nie widzi kto na co
      const wynik = await ankiety.utworzAnkiete(interaction, { pytanie, opcje: odpowiedzi, godziny, wiele });
      if (wynik?.blad) {
        return interaction.editReply(karty.kartaBlad('Nie udało się wystawić ankiety', wynik.blad));
      }
    } else {
      // Natywna ankieta Discorda - ładna, ale widać kto głosował
      const wiad = await kanal.send({
        poll: {
          question: { text: pytanie },
          answers: odpowiedzi.map(text => ({ text })),
          duration: godziny,
          allow_multiselect: wiele,
        },
      }).catch(e => ({ blad: e.message }));
      if (wiad?.blad) {
        return interaction.editReply(karty.kartaBlad('Nie udało się wystawić ankiety', wiad.blad));
      }
    }

    await log(interaction.client, {
      tytul: anonimowa ? 'Wystawiono anonimową ankietę' : 'Wystawiono ankietę',
      opis: `**Pytanie:** ${pytanie}\n**Opcje:** ${odpowiedzi.map(o => `\`${o}\``).join(', ')}\n**Czas:** ${godziny}h (do <t:${koniec}:f>)\n**Wielokrotny wybór:** ${wiele ? 'tak' : 'nie'}\n**Anonimowa:** ${anonimowa ? 'tak' : 'nie'}\n**Kanał:** <#${kanal.id}>\n**Wystawił:** <@${interaction.user.id}>`,
      kolor: kolory.info,
    });

    return interaction.editReply(karty.kartaSukces('Ankieta wystawiona',
      `Głosowanie trwa do <t:${koniec}:R> (<t:${koniec}:f>).\n${anonimowa ? 'Nikt nie zobaczy kto na co głosował.' : 'Discord sam zbierze głosy i zamknie ankietę.'}`));
  },
};
