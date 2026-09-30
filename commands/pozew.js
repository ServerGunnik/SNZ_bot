const {
  SlashCommandBuilder, ChannelType, PermissionFlagsBits, MessageFlags,
} = require('discord.js');
const db = require('../database/db.js');
const config = require('../config.js');
const karty = require('../utils/karty.js');
const { jestLider } = require('../utils/uprawnienia.js');
const { walidujNick } = require('../utils/minecraft.js');
const { log, wyslij } = require('../utils/logger.js');
const kolory = require('../utils/kolory.js');

const q = {
  utworz: db.prepare(`INSERT INTO sprawy
    (numer, pozywajacy_id, pozwany_typ, pozwany_wartosc, zarzut, opis, dowody, utworzona)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`),
  zapiszKanal: db.prepare('UPDATE sprawy SET kanal_id = ?, wiadomosc_id = ? WHERE id = ?'),
  ostatnia: db.prepare("SELECT numer FROM sprawy ORDER BY id DESC LIMIT 1"),
  panstwaPoNazwie: db.prepare('SELECT * FROM panstwa WHERE nazwa = ? COLLATE NOCASE'),
};

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
    .setDescription('Złóż pozew do Sądu Sojuszniczego (dla liderów)')
    .setDMPermission(false)
    .addStringOption(o => o.setName('typ-pozwanego').setDescription('Kogo pozywasz').setRequired(true)
      .addChoices({ name: 'gracza (nick)', value: 'nick' }, { name: 'państwo', value: 'panstwo' }))
    .addStringOption(o => o.setName('pozwany').setDescription('Nick lub nazwa państwa').setRequired(true))
    .addStringOption(o => o.setName('zarzut').setDescription('Krótki zarzut').setRequired(true))
    .addStringOption(o => o.setName('opis').setDescription('Szczegółowy opis').setRequired(true))
    .addStringOption(o => o.setName('dowody').setDescription('Dowody wstępne (linki, opis)')),

  async execute(interaction) {
    if (!jestLider(interaction.member)) {
      return interaction.reply({
        ...karty.kartaBlad('Brak uprawnień', 'Pozew może złożyć wyłącznie lider państwa.'),
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
    }
    const typ = interaction.options.getString('typ-pozwanego');
    const pozwany = interaction.options.getString('pozwany').trim();
    if (typ === 'nick' && !walidujNick(pozwany)) {
      return interaction.reply({
        ...karty.kartaBlad('Nieprawidłowy nick', 'Nick musi mieć 3–16 znaków.'),
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
    }
    if (typ === 'panstwo' && !q.panstwaPoNazwie.get(pozwany)) {
      return interaction.reply({
        ...karty.kartaBlad('Brak państwa', `Państwo **${pozwany}** nie istnieje w rejestrze.`),
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
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
    const kanal = await interaction.guild.channels.create({
      name: `${config.sad.prefixSprawy}${numer.toLowerCase()}`.slice(0, 90),
      type: ChannelType.GuildText,
      parent: kategoria,
      permissionOverwrites: [
        { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.ReadMessageHistory] },
        ...(staff ? [{ id: staff, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }] : []),
      ],
    });

    const sprawa = db.prepare('SELECT * FROM sprawy WHERE id = ?').get(sprawaId);
    const wiad = await kanal.send(karty.kartaSprawy({ sprawa }));
    q.zapiszKanal.run(kanal.id, wiad.id, sprawaId);

    await log(interaction.client, {
      tytul: 'Nowy pozew',
      opis: `**Sprawa:** ${numer}\n**Pozywający:** <@${interaction.user.id}>\n**Pozwany:** ${typ === 'nick' ? `\`${pozwany}\`` : `Państwo **${pozwany}**`}\n**Kanał:** <#${kanal.id}>`,
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
