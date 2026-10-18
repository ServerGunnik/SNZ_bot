const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const db = require('../database/db.js');
const karty = require('../utils/karty.js');
const { maDostepDoModeracji, rangaStaffu, pingRol } = require('../utils/uprawnienia.js');
const { log } = require('../utils/logger.js');
const kolory = require('../utils/kolory.js');
const config = require('../config.js');
const { odswiezKarteTicketu, przywrocPisanieStaffu, zabierzOverwriteUserowi } = require('../modules/tickety.js');

const EPHEMERAL_V2 = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;

const q = {
  poKanale: db.prepare("SELECT * FROM tickety WHERE kanal_id = ?"),
  eskaluj: db.prepare('UPDATE tickety SET eskalowany_przez = ?, eskalowany_z_rangi = ?, przydzielony = NULL WHERE id = ?'),
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('przekaz-wyzej')
    .setDescription('Przekaż ticket wyżej — tylko wyższa ranga będzie mogła go przejąć')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .setDMPermission(false)
    .addStringOption(o => o.setName('powod').setDescription('Dlaczego nie dajesz rady (opcjonalne)')),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (!maDostepDoModeracji(interaction.member)) {
      return interaction.editReply(karty.kartaBlad('Brak uprawnień', 'Komenda dla staffu i helperów.'));
    }

    const ticket = q.poKanale.get(interaction.channel.id);
    if (!ticket || ticket.status !== 'otwarty') {
      return interaction.editReply(karty.kartaBlad('Nie ten kanał',
        'Komendy używaj NA kanale otwartego ticketu — tego, który chcesz przekazać wyżej.'));
    }

    // Przekazywać może albo obecny przydzielony, albo osoba z moderacji na niczyim tickecie
    if (ticket.przydzielony && ticket.przydzielony !== interaction.user.id) {
      return interaction.editReply(karty.kartaBlad('To nie Twoje zgłoszenie',
        `Przekazać wyżej może tylko <@${ticket.przydzielony}>, który obecnie obsługuje ticket.`));
    }

    const mojaRanga = rangaStaffu(interaction.member);
    const powod = interaction.options.getString('powod') || null;

    q.eskaluj.run(interaction.user.id, Number.isFinite(mojaRanga) ? mojaRanga : Number.MAX_SAFE_INTEGER, ticket.id);
    // Odśwież kartę - przycisk „Przejmij" ma znów być aktywny, „Obsługuje" ma pokazać „nikt jeszcze"
    await odswiezKarteTicketu(interaction.client, ticket.id);
    // Nadzór: zabierz pisanie dotychczasowemu eskalującemu, przywróć pisanie dla staffu/helpera
    // żeby wyższa ranga mogła od razu pisać przed przejęciem
    await zabierzOverwriteUserowi(interaction.channel, interaction.user.id);
    await przywrocPisanieStaffu(interaction.channel);

    // Ping wyższej administracji - używamy staffu (ROLA_STAFF), żeby helperzy się nie bili o eskalowany ticket
    const ping = pingRol(config.role.staff);
    const trescPing = ping.pusta ? '' : `${ping.tekst} `;
    const opis =
      `**Zrobił:** <@${interaction.user.id}>` +
      (powod ? `\n**Powód:** ${powod}` : '') +
      `\n\nTicket jest teraz dostępny do przejęcia **tylko przez osoby z wyższą rangą** niż eskalujący.`;

    await interaction.channel.send({
      content: `${trescPing}🔺 **Ticket eskalowany wyżej**`,
      allowedMentions: ping.pusta ? { parse: [] } : { roles: ping.role },
    }).catch(() => null);
    await interaction.channel.send({
      ...karty.kartaInfo({ tytul: 'Ticket przekazany wyżej', opis, kolor: kolory.ostrzezenie }),
      allowedMentions: { parse: [] },
    }).catch(() => null);

    const narada = ticket.narada_id && interaction.guild.channels.cache.get(ticket.narada_id);
    if (narada) {
      await narada.send({
        ...karty.kartaInfo({
          tytul: 'Eskalacja ticketu',
          opis: `**Ticket:** <#${ticket.kanal_id}>\n${opis}`,
          kolor: kolory.ostrzezenie,
        }),
        allowedMentions: { parse: [] },
      }).catch(() => null);
    }

    await log(interaction.client, {
      tytul: `Eskalowano zgłoszenie #${ticket.id}`,
      opis: `**Kanał:** <#${ticket.kanal_id}>\n**Eskalował:** <@${interaction.user.id}>` +
        (powod ? `\n**Powód:** ${powod}` : ''),
      kolor: kolory.ostrzezenie,
      kanal: 'logiTickety',
    });

    return interaction.editReply(karty.kartaSukces('Przekazane wyżej',
      `Ticket oczekuje na przejęcie przez wyższą rangę.${powod ? `\n**Powód:** ${powod}` : ''}`));
  },
};
