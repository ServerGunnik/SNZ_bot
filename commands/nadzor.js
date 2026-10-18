const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, ChannelType } = require('discord.js');
const db = require('../database/db.js');
const karty = require('../utils/karty.js');
const { maDostepDoModeracji, wszechwladny } = require('../utils/uprawnienia.js');
const { log } = require('../utils/logger.js');
const kolory = require('../utils/kolory.js');
const { pozwolPisacUserowi, zabierzOverwriteUserowi } = require('../modules/tickety.js');

const EPHEMERAL_V2 = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;

const q = {
  poKanale: db.prepare("SELECT * FROM tickety WHERE kanal_id = ?"),
};

// Komendę może używać przydzielony do ticketa, wszechwładny (owner/technik)
function czyMozeZarzadzacNadzorem(interaction, ticket) {
  if (wszechwladny(interaction.member)) return true;
  return ticket.przydzielony === interaction.user.id;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('nadzor')
    .setDescription('Dodaj / usuń osobę nadzorującą ticket (osoba poza przydzielonym może pisać na kanale)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .setDMPermission(false)
    .addSubcommand(s => s.setName('dodaj').setDescription('Dodaj osobę nadzorującą do tego ticketu')
      .addUserOption(o => o.setName('osoba').setDescription('Kogo dodać').setRequired(true)))
    .addSubcommand(s => s.setName('usun').setDescription('Zdejmij osobie prawo pisania na tym tickecie')
      .addUserOption(o => o.setName('osoba').setDescription('Kogo zdjąć').setRequired(true))),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (!maDostepDoModeracji(interaction.member)) {
      return interaction.editReply(karty.kartaBlad('Brak uprawnień', 'Komenda dla staffu i helperów.'));
    }

    const kanal = interaction.channel;
    if (!kanal || kanal.type !== ChannelType.GuildText) {
      return interaction.editReply(karty.kartaBlad('Nieprawidłowy kanał', 'Komendy używaj na kanale ticketu (tego, który chcesz nadzorować).'));
    }

    const ticket = q.poKanale.get(kanal.id);
    if (!ticket || ticket.status !== 'otwarty') {
      return interaction.editReply(karty.kartaBlad('Nie ten kanał', 'Komendy używaj NA kanale otwartego ticketu.'));
    }

    if (!czyMozeZarzadzacNadzorem(interaction, ticket)) {
      return interaction.editReply(karty.kartaBlad('Brak uprawnień',
        ticket.przydzielony
          ? `Nadzór dodać/zdjąć może tylko <@${ticket.przydzielony}> (osoba, która przejęła), właściciel albo technik.`
          : 'Najpierw ktoś musi przejąć ten ticket. Dopiero wtedy przydzielony może dodawać nadzór.'));
    }

    const sub = interaction.options.getSubcommand();
    const osoba = interaction.options.getUser('osoba');

    if (osoba.bot) {
      return interaction.editReply(karty.kartaBlad('Nieprawidłowy cel', 'Nie dodawaj botów jako nadzorujących.'));
    }
    if (osoba.id === ticket.user_id) {
      return interaction.editReply(karty.kartaBlad('To autor ticketu', 'Autor zgłoszenia pisze tam domyślnie — nie musisz go dodawać.'));
    }
    if (osoba.id === ticket.przydzielony) {
      return interaction.editReply(karty.kartaBlad('To osoba przydzielona', 'Osoba, która przejęła ticket, i tak może pisać.'));
    }

    if (sub === 'dodaj') {
      await pozwolPisacUserowi(kanal, osoba.id);
      await kanal.send({
        ...karty.kartaInfo({
          tytul: 'Dodano nadzór',
          opis: `<@${osoba.id}> otrzymał prawo pisania na tym tickecie.\n**Dodał:** <@${interaction.user.id}>`,
          kolor: kolory.info,
        }),
        allowedMentions: { users: [osoba.id] },
      }).catch(() => null);
      await log(interaction.client, {
        tytul: `Nadzór — dodano #${ticket.id}`,
        opis: `**Kanał:** <#${ticket.kanal_id}>\n**Nadzór:** <@${osoba.id}>\n**Dodał:** <@${interaction.user.id}>`,
        kolor: kolory.info,
        kanal: 'logiTickety',
      });
      return interaction.editReply(karty.kartaSukces('Nadzór dodany', `<@${osoba.id}> może teraz pisać na tym kanale.`));
    }

    if (sub === 'usun') {
      await zabierzOverwriteUserowi(kanal, osoba.id);
      await kanal.send({
        ...karty.kartaInfo({
          tytul: 'Zdjęto nadzór',
          opis: `<@${osoba.id}> stracił prawo pisania na tym tickecie.\n**Zdjął:** <@${interaction.user.id}>`,
          kolor: kolory.ostrzezenie,
        }),
        allowedMentions: { parse: [] },
      }).catch(() => null);
      await log(interaction.client, {
        tytul: `Nadzór — usunięto #${ticket.id}`,
        opis: `**Kanał:** <#${ticket.kanal_id}>\n**Nadzór:** <@${osoba.id}>\n**Zdjął:** <@${interaction.user.id}>`,
        kolor: kolory.ostrzezenie,
        kanal: 'logiTickety',
      });
      return interaction.editReply(karty.kartaSukces('Nadzór zdjęty', `<@${osoba.id}> nie może już pisać na tym kanale.`));
    }
  },
};
