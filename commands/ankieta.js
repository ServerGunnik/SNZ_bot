const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, ChannelType } = require('discord.js');
const karty = require('../utils/karty.js');
const { maDostepDoModeracji } = require('../utils/uprawnienia.js');
const { log } = require('../utils/logger.js');
const kolory = require('../utils/kolory.js');
const ankiety = require('../modules/ankiety.js');

const MAX_ODPOWIEDZI = 10;
const MAX_GODZIN = 168;
const MAX_MS = MAX_GODZIN * 60 * 60 * 1000;
const MIN_MS = 60 * 1000;
const MAX_DL_PYTANIA = 300;
const MAX_DL_ODPOWIEDZI = 55;

function parsujCzas(txt) {
  if (!txt) return null;
  const m = txt.trim().toLowerCase().match(/^(\d+)\s*(s|m|h|d)?$/);
  if (!m) return null;
  const liczba = parseInt(m[1], 10);
  const jednostki = { s: 1000, m: 60 * 1000, h: 60 * 60 * 1000, d: 24 * 60 * 60 * 1000 };
  return liczba * (jednostki[m[2] || 'm']);
}

// Z linku Discord albo samego ID wyciągamy ID wiadomości
function wyciagnijIdWiadomosci(txt) {
  if (!txt) return null;
  const trimmed = txt.trim();
  // Czyste ID (17-20 cyfr)
  if (/^\d{17,20}$/.test(trimmed)) return trimmed;
  // Link w stylu https://discord.com/channels/<guild>/<channel>/<message>
  const m = trimmed.match(/\/channels\/\d+\/\d+\/(\d{17,20})/);
  return m ? m[1] : null;
}

async function stworz(interaction) {
  const pytanie = interaction.options.getString('pytanie').trim();
  const odpowiedziRaw = interaction.options.getString('odpowiedzi');
  const czasRaw = interaction.options.getString('czas');
  const wiele = interaction.options.getBoolean('wiele') ?? false;
  const anonimowa = interaction.options.getBoolean('anonimowa') ?? false;

  let czasMs = czasRaw ? parsujCzas(czasRaw) : 24 * 60 * 60 * 1000;
  if (czasRaw && !czasMs) {
    return interaction.editReply(karty.kartaBlad('Nieprawidłowy czas', 'Format: np. `30s`, `5m`, `2h`, `7d`. Jednostki: `s`, `m`, `h`, `d`.'));
  }
  if (czasMs < MIN_MS) {
    return interaction.editReply(karty.kartaBlad('Za krótki czas', 'Minimum to 1 minuta.'));
  }
  if (czasMs > MAX_MS) {
    return interaction.editReply(karty.kartaBlad('Za długi czas', 'Discord pozwala na ankietę maks. 7 dni (168h).'));
  }

  const odpowiedzi = odpowiedziRaw.split('|').map(s => s.trim()).filter(Boolean);
  if (odpowiedzi.length < 2) {
    return interaction.editReply(karty.kartaBlad('Za mało opcji', 'Podaj co najmniej 2 odpowiedzi oddzielone znakiem `|`. Przykład: `Tak|Nie|Nie wiem`.'));
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

  const koniec = Math.floor((Date.now() + czasMs) / 1000);
  const minuty = Math.round(czasMs / 60000);
  const czasOpis = minuty < 60 ? `${minuty} min`
    : minuty < 24 * 60 ? `${Math.round(minuty / 60 * 10) / 10} h`
    : `${Math.round(minuty / (24 * 60) * 10) / 10} dni`;

  if (anonimowa) {
    const wynik = await ankiety.utworzAnkiete(interaction, { pytanie, opcje: odpowiedzi, czasMs, wiele });
    if (wynik?.blad) {
      return interaction.editReply(karty.kartaBlad('Nie udało się wystawić ankiety', wynik.blad));
    }
  } else {
    const godziny = Math.max(1, Math.ceil(czasMs / (60 * 60 * 1000)));
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
    opis: `**Pytanie:** ${pytanie}\n**Opcje:** ${odpowiedzi.map(o => `\`${o}\``).join(', ')}\n**Czas:** ${czasOpis} (do <t:${koniec}:f>)\n**Wielokrotny wybór:** ${wiele ? 'tak' : 'nie'}\n**Anonimowa:** ${anonimowa ? 'tak' : 'nie'}\n**Kanał:** <#${kanal.id}>\n**Wystawił:** <@${interaction.user.id}>`,
    kolor: kolory.info,
  });

  const uwagaNatywna = (!anonimowa && czasMs < 60 * 60 * 1000)
    ? '\n-# Natywna ankieta Discorda ma minimum 1 h — czas został zaokrąglony. Jeśli chcesz krótszy, użyj `anonimowa:true`.'
    : '';

  return interaction.editReply(karty.kartaSukces('Ankieta wystawiona',
    `Głosowanie trwa do <t:${koniec}:R> (<t:${koniec}:f>).\n${anonimowa ? 'Nikt nie zobaczy kto na co głosował.' : 'Discord sam zbierze głosy i zamknie ankietę.'}${uwagaNatywna}`));
}

async function zakoncz(interaction) {
  const wejscie = interaction.options.getString('wiadomosc');
  const wiadId = wyciagnijIdWiadomosci(wejscie);
  if (!wiadId) {
    return interaction.editReply(karty.kartaBlad('Nieprawidłowe ID',
      'Podaj ID wiadomości ankiety (17-20 cyfr) albo pełny link `https://discord.com/channels/.../.../ID`.'));
  }

  // Najpierw sprawdź czy to anonimowa ankieta
  const anon = ankiety.anonimowaPoWiadomosci(wiadId);
  if (anon) {
    if (anon.zamknieta) {
      return interaction.editReply(karty.kartaOstrzezenie('Już zakończona', 'Ta anonimowa ankieta jest już zamknięta.'));
    }
    await ankiety.zamknijAnkiete(interaction.client, anon);
    await log(interaction.client, {
      tytul: 'Zakończono ankietę (anonimową) ręcznie',
      opis: `**Pytanie:** ${anon.pytanie}\n**Zakończył:** <@${interaction.user.id}>\n**Kanał:** <#${anon.kanal_id}>`,
      kolor: kolory.sukces,
    });
    return interaction.editReply(karty.kartaSukces('Zakończono', `Anonimowa ankieta „${anon.pytanie}" została zamknięta. Wyniki są widoczne na kanale.`));
  }

  // Spróbuj znaleźć natywną ankietę w aktualnym kanale
  const kanal = interaction.channel;
  const wiad = kanal ? await kanal.messages.fetch(wiadId).catch(() => null) : null;
  if (!wiad) {
    return interaction.editReply(karty.kartaBlad('Nie znaleziono wiadomości',
      'Komendy używaj NA tym kanale, na którym jest ankieta. Albo wklej pełny link do wiadomości.'));
  }
  if (!wiad.poll) {
    return interaction.editReply(karty.kartaBlad('Nie ankieta', 'Ta wiadomość nie zawiera ankiety.'));
  }
  if (wiad.poll.resultsFinalized) {
    return interaction.editReply(karty.kartaOstrzezenie('Już zakończona', 'Ta ankieta jest już zamknięta.'));
  }
  if (wiad.author?.id !== interaction.client.user.id) {
    return interaction.editReply(karty.kartaBlad('Nie moja ankieta', 'Mogę zamknąć tylko ankiety, które sam wystawił. Natywne ankiety innych botów/userów musi zamknąć ich autor.'));
  }

  const blad = await wiad.poll.end().then(() => null).catch(e => e.message);
  if (blad) {
    return interaction.editReply(karty.kartaBlad('Nie udało się zakończyć', blad));
  }

  await log(interaction.client, {
    tytul: 'Zakończono ankietę (natywną) ręcznie',
    opis: `**Pytanie:** ${wiad.poll.question.text}\n**Zakończył:** <@${interaction.user.id}>\n**Kanał:** <#${kanal.id}>`,
    kolor: kolory.sukces,
  });

  return interaction.editReply(karty.kartaSukces('Zakończono', 'Natywna ankieta Discorda została zamknięta — wyniki są teraz ostateczne.'));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ankieta')
    .setDescription('Ankiety: wystawianie i ręczne zakańczanie')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .setDMPermission(false)
    .addSubcommand(s => s.setName('stworz').setDescription('Wystaw ankietę na kanale')
      .addStringOption(o => o.setName('pytanie').setDescription('Treść pytania').setRequired(true).setMaxLength(MAX_DL_PYTANIA))
      .addStringOption(o => o.setName('odpowiedzi').setDescription('Opcje oddzielone znakiem | (np. Tak|Nie|Nie wiem). Max 10.').setRequired(true))
      .addStringOption(o => o.setName('czas').setDescription('Jak długo trwa, np. 30s, 5m, 2h, 7d (domyślnie 24h, max 7d)'))
      .addBooleanOption(o => o.setName('wiele').setDescription('Czy wolno wybrać wiele odpowiedzi (domyślnie: nie)'))
      .addBooleanOption(o => o.setName('anonimowa').setDescription('true = nikt nie zobaczy kto na co głosował (domyślnie: nie)')))
    .addSubcommand(s => s.setName('zakoncz').setDescription('Zamknij ankietę przed czasem')
      .addStringOption(o => o.setName('wiadomosc').setDescription('ID wiadomości ankiety albo pełny link do niej').setRequired(true))),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (!maDostepDoModeracji(interaction.member)) {
      return interaction.editReply(karty.kartaBlad('Brak uprawnień', 'Komenda dla staffu i helperów.'));
    }

    const sub = interaction.options.getSubcommand();
    if (sub === 'stworz') return stworz(interaction);
    if (sub === 'zakoncz') return zakoncz(interaction);
  },
};
