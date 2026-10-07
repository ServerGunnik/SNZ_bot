const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, ChannelType } = require('discord.js');
const karty = require('../utils/karty.js');
const { jestStaff } = require('../utils/uprawnienia.js');
const { log } = require('../utils/logger.js');
const kolory = require('../utils/kolory.js');

const EPHEMERAL_V2 = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;

// Discord: bulkDelete max 100, tylko wiadomości młodsze niż 14 dni
const LIMIT_BULK = 100;
const MAX_WIEK_MS = 14 * 24 * 60 * 60 * 1000;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Usuń ostatnie wiadomości z tego kanału (staff)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .setDMPermission(false)
    .addIntegerOption(o => o.setName('ile').setDescription('Ile wiadomości usunąć (1-100)').setRequired(true).setMinValue(1).setMaxValue(100))
    .addUserOption(o => o.setName('uzytkownik').setDescription('Usuwaj tylko wiadomości tej osoby')),

  async execute(interaction) {
    // Defer PIERWSZE - Discord daje 3s na pierwszą odpowiedź, jak zrobimy sprawdzenia przed, to możemy nie zdążyć
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (!jestStaff(interaction.member)) {
      return interaction.editReply(karty.kartaBlad('Brak uprawnień', 'Ta komenda jest dla staffu.'));
    }

    const kanal = interaction.channel;
    if (!kanal || ![ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.PublicThread, ChannelType.PrivateThread, ChannelType.AnnouncementThread].includes(kanal.type)) {
      return interaction.editReply(karty.kartaBlad('Nieprawidłowy kanał', 'Czyszczenia używaj na kanałach tekstowych lub w wątkach.'));
    }

    const ile = interaction.options.getInteger('ile');
    const user = interaction.options.getUser('uzytkownik');

    // Przy filtrze po użytkowniku pobieramy więcej (do 100), potem przycinamy do żądanej liczby
    const paczka = await kanal.messages.fetch({ limit: LIMIT_BULK }).catch(() => null);
    if (!paczka) {
      return interaction.editReply(karty.kartaBlad('Błąd', 'Nie udało się pobrać wiadomości z kanału.'));
    }

    const granica = Date.now() - MAX_WIEK_MS;
    const kandydaci = [...paczka.values()]
      .filter(m => !user || m.author.id === user.id)
      .filter(m => m.createdTimestamp >= granica)
      .filter(m => !m.pinned)
      .slice(0, ile);

    if (!kandydaci.length) {
      return interaction.editReply(karty.kartaOstrzezenie('Nic do usunięcia',
        user ? `Nie znaleziono wiadomości od <@${user.id}> z ostatnich 14 dni w tym kanale.`
             : 'Nic nie można usunąć (wszystkie są starsze niż 14 dni albo przypięte).'));
    }

    const ids = kandydaci.map(m => m.id);
    const wynik = await kanal.bulkDelete(ids, true).then(c => c.size).catch((e) => ({ blad: e.message }));

    if (typeof wynik === 'object') {
      return interaction.editReply(karty.kartaBlad('Nie udało się usunąć', wynik.blad));
    }

    await log(interaction.client, {
      tytul: 'Wyczyszczono wiadomości',
      opis: `**Kanał:** <#${kanal.id}>\n**Usunięto:** ${wynik}\n**Wykonał:** <@${interaction.user.id}>` +
        (user ? `\n**Filtr autora:** <@${user.id}>` : ''),
      kolor: kolory.ostrzezenie,
    });

    return interaction.editReply(karty.kartaSukces('Wyczyszczono',
      `Usunięto **${wynik}** wiadomości${user ? ` od <@${user.id}>` : ''} z <#${kanal.id}>.` +
      (wynik < ile ? `\n_Z żądanych ${ile} tylko tyle się dało — reszta była starsza niż 14 dni, przypięta albo brak filtra pasujących._` : '')));
  },
};
