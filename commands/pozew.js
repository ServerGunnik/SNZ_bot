const {
  SlashCommandBuilder, ChannelType, PermissionFlagsBits, MessageFlags,
} = require('discord.js');
const db = require('../database/db.js');
const config = require('../config.js');
const karty = require('../utils/karty.js');
const { log, wyslij } = require('../utils/logger.js');
const kolory = require('../utils/kolory.js');

const q = {
  utworz: db.prepare(`INSERT INTO sprawy
    (numer, pozywajacy_id, pozwany_typ, pozwany_wartosc, zarzut, opis, dowody, utworzona)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`),
  zapiszKanal: db.prepare('UPDATE sprawy SET kanal_id = ?, wiadomosc_id = ? WHERE id = ?'),
  ostatnia: db.prepare("SELECT numer FROM sprawy ORDER BY id DESC LIMIT 1"),
  // Najświeższa sprawa w oknie cooldownu dla danego pozywającego - do rate-limitu
  ostatniaUzytkownika: db.prepare('SELECT utworzona FROM sprawy WHERE pozywajacy_id = ? AND utworzona >= ? ORDER BY utworzona DESC LIMIT 1'),
  panstwaPoNazwie: db.prepare('SELECT * FROM panstwa WHERE nazwa = ? COLLATE NOCASE'),
  wszystkiePanstwa: db.prepare('SELECT nazwa FROM panstwa ORDER BY nazwa COLLATE NOCASE'),
  panstwoLidera: db.prepare('SELECT * FROM panstwa WHERE lider_id = ?'),
};

function blad(interaction, tytul, opis) {
  return interaction.reply({ ...karty.kartaBlad(tytul, opis), flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
}

function nastepnyNumer() {
  const rok = new Date().getFullYear();
  const ostatnia = q.ostatnia.get();
  let n = 1;
  if (ostatnia?.numer) {
    const m = ostatnia.numer.match(/^SNZ-(\d{4})-(\d+)$/);
    if (m && parseInt(m[1], 10) === rok) n = parseInt(m[2], 10) + 1;
  }
  return `SNZ-${rok}-${String(n).padStart(4, '0')}`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('pozew')
    .setDescription('Złóż pozew do Sądu Sojuszniczego (jeden na dobę)')
    .setDMPermission(false)
    .addStringOption(o => o.setName('typ-pozwanego').setDescription('Kogo pozywasz').setRequired(true)
      .addChoices({ name: 'gracza (konto Discord)', value: 'gracz' }, { name: 'państwo', value: 'panstwo' }))
    .addStringOption(o => o.setName('zarzut').setDescription('Krótki zarzut').setRequired(true))
    .addStringOption(o => o.setName('opis').setDescription('Szczegółowy opis').setRequired(true))
    .addUserOption(o => o.setName('gracz').setDescription('Pozwany gracz (wybierz konto Discord) — przy typie „gracz”'))
    .addStringOption(o => o.setName('panstwo').setDescription('Pozwane państwo — przy typie „państwo”').setAutocomplete(true))
    .addStringOption(o => o.setName('dowody').setDescription('Dowody wstępne (linki, opis)')),

  async autocomplete(interaction) {
    const wpis = interaction.options.getFocused().toLowerCase();
    await interaction.respond(
      q.wszystkiePanstwa.all().filter(p => p.nazwa.toLowerCase().includes(wpis)).slice(0, 25)
        .map(p => ({ name: p.nazwa, value: p.nazwa }))
    );
  },

  async execute(interaction) {
    // Każdy może złożyć pozew niezależnie od rangi, ale tylko jeden na dobę
    const cooldownMs = config.pozew.cooldownMs;
    const ostatnia = q.ostatniaUzytkownika.get(interaction.user.id, Date.now() - cooldownMs);
    if (ostatnia) {
      const kolejny = Math.floor((ostatnia.utworzona + cooldownMs) / 1000);
      return interaction.reply({
        ...karty.kartaBlad('Masz już pozew w tej dobie',
          `Możesz złożyć jeden pozew na ${Math.round(cooldownMs / (60 * 60 * 1000))} h. Kolejny możesz złożyć <t:${kolejny}:R> (<t:${kolejny}:t>).`),
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
    }
    const typ = interaction.options.getString('typ-pozwanego');
    let pozwany;
    let pozwanyId;
    if (typ === 'gracz') {
      // Pozwany to konto Discord, nie nick - nikt nie podszyje się pod cudzy nick, a sędzia-pozwany jest zawsze rozpoznany
      const user = interaction.options.getUser('gracz');
      if (!user) return blad(interaction, 'Brak pozwanego', 'Przy typie „gracz” wybierz pozwanego w opcji `gracz`.');
      if (user.id === interaction.user.id) return blad(interaction, 'Nieprawidłowy pozwany', 'Nie możesz pozwać samego siebie.');
      if (user.bot) return blad(interaction, 'Nieprawidłowy pozwany', 'Nie można pozwać bota.');
      pozwany = user.id;
      pozwanyId = user.id;
    } else {
      const nazwa = (interaction.options.getString('panstwo') || '').trim();
      const panstwo = nazwa && q.panstwaPoNazwie.get(nazwa);
      if (!panstwo) return blad(interaction, 'Brak państwa', nazwa ? `Państwo **${nazwa}** nie istnieje w rejestrze.` : 'Przy typie „państwo” wybierz państwo w opcji `panstwo`.');
      if (q.panstwoLidera.get(interaction.user.id)?.id === panstwo.id) return blad(interaction, 'Nieprawidłowy pozwany', 'Nie możesz pozwać własnego państwa.');
      pozwany = panstwo.nazwa;
      pozwanyId = panstwo.lider_id;
    }
    const zarzut = interaction.options.getString('zarzut');
    const opis = interaction.options.getString('opis');
    const dowody = interaction.options.getString('dowody') || null;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const numer = nastepnyNumer();
    const info = q.utworz.run(numer, interaction.user.id, typ, pozwany, zarzut, opis, dowody, Date.now());
    const sprawaId = info.lastInsertRowid;

    // Kanał prywatny
    const staff = config.role.staff;
    const kategoria = config.kanaly.kategoriaSprawy || null;
    // Nadpisanie uprawnień dla osoby spoza serwera wysypałoby tworzenie kanału
    const pozwanyNaSerwerze = pozwanyId && await interaction.guild.members.fetch(pozwanyId).catch(() => null);
    const dostepStrony = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.ReadMessageHistory];
    const kanal = await interaction.guild.channels.create({
      name: `${config.sad.prefixSprawy}${numer.toLowerCase()}`.slice(0, 90),
      type: ChannelType.GuildText,
      parent: kategoria,
      permissionOverwrites: [
        { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
        // Bot musi widzieć kanał, który tworzy (gdy nie ma uprawnień administratora)
        { id: interaction.client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.ManageChannels] },
        { id: interaction.user.id, allow: dostepStrony },
        ...(pozwanyNaSerwerze && pozwanyId !== interaction.user.id ? [{ id: pozwanyId, allow: dostepStrony }] : []),
        ...staff.map(id => ({ id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] })),
      ],
    });

    const sprawa = db.prepare('SELECT * FROM sprawy WHERE id = ?').get(sprawaId);
    const wiad = await kanal.send(karty.kartaSprawy({ sprawa }));
    q.zapiszKanal.run(kanal.id, wiad.id, sprawaId);

    await log(interaction.client, {
      tytul: 'Nowy pozew',
      opis: `**Sprawa:** ${numer}\n**Pozywający:** <@${interaction.user.id}>\n**Pozwany:** ${typ === 'gracz' ? `<@${pozwany}>` : `Państwo **${pozwany}**`}\n**Kanał:** <#${kanal.id}>`,
      kolor: kolory.info,
      kanal: 'logiSad',
    });

    // Ping staffu do przyjęcia
    if (staff) {
      await wyslij(interaction.client, config.kanaly.logiSad || config.kanaly.logi, {
        content: `<@&${staff}> — nowa sprawa **${numer}** czeka na sędziego.`,
        allowedMentions: { roles: [staff] },
      });
    }

    await interaction.editReply(karty.kartaSukces('Pozew złożony', `Sprawa **${numer}** — kanał <#${kanal.id}>`));
  },
};
