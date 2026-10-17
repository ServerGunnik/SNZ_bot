const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const db = require('../database/db.js');
const karty = require('../utils/karty.js');
const { maDostepDoModeracji, rangaStaffu } = require('../utils/uprawnienia.js');
const { log } = require('../utils/logger.js');
const kolory = require('../utils/kolory.js');

const EPHEMERAL_V2 = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;

const q = {
  poKanale: db.prepare("SELECT * FROM tickety WHERE kanal_id = ?"),
  przydziel: db.prepare('UPDATE tickety SET przydzielony = ? WHERE id = ?'),
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('przekaz-ticket')
    .setDescription('Przekaż ten ticket innej osobie ze staffu (tylko na kanale ticketu)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .setDMPermission(false)
    .addUserOption(o => o.setName('uzytkownik').setDescription('Komu przekazać ticket').setRequired(true)),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (!maDostepDoModeracji(interaction.member)) {
      return interaction.editReply(karty.kartaBlad('Brak uprawnień', 'Komenda dla staffu i helperów.'));
    }

    const ticket = q.poKanale.get(interaction.channel.id);
    if (!ticket || ticket.status !== 'otwarty') {
      return interaction.editReply(karty.kartaBlad('Nie ten kanał',
        'Komendy używaj NA kanale otwartego ticketu (tego, który chcesz przekazać).'));
    }

    const docelowy = interaction.options.getUser('uzytkownik');
    if (docelowy.bot) {
      return interaction.editReply(karty.kartaBlad('Nieprawidłowy cel', 'Nie można przekazać ticketa botowi.'));
    }
    if (docelowy.id === interaction.user.id) {
      return interaction.editReply(karty.kartaBlad('Nieprawidłowy cel', 'Przekazanie do samego siebie nie ma sensu.'));
    }
    if (docelowy.id === ticket.przydzielony) {
      return interaction.editReply(karty.kartaOstrzezenie('Bez zmian', `Ticket już jest u <@${docelowy.id}>.`));
    }
    if (docelowy.id === ticket.user_id) {
      return interaction.editReply(karty.kartaBlad('Nieprawidłowy cel', 'Nie można przekazać ticketa jego autorowi.'));
    }

    const docelowyCzlonek = await interaction.guild.members.fetch(docelowy.id).catch(() => null);
    if (!docelowyCzlonek) {
      return interaction.editReply(karty.kartaBlad('Brak użytkownika', 'Tej osoby nie ma na serwerze.'));
    }
    if (!maDostepDoModeracji(docelowyCzlonek)) {
      return interaction.editReply(karty.kartaBlad('Nieprawidłowy cel',
        `<@${docelowy.id}> nie jest w staffie ani w helperach — ticket może trafić tylko do osoby z moderacji.`));
    }

    // Uprawnienie do przekazania: aktualny przydzielony, osoba z wyższą rangą od obecnego, albo właściciel/technik
    const mojaRanga = rangaStaffu(interaction.member);
    const obecnyCzlonek = ticket.przydzielony
      ? await interaction.guild.members.fetch(ticket.przydzielony).catch(() => null)
      : null;
    const obecnaRanga = obecnyCzlonek ? rangaStaffu(obecnyCzlonek) : -1; // nikt nie przyjął = każdy może

    const czyMoge = !ticket.przydzielony
      || ticket.przydzielony === interaction.user.id
      || mojaRanga > obecnaRanga;
    if (!czyMoge) {
      return interaction.editReply(karty.kartaBlad('Brak uprawnień',
        `Ticket obsługuje <@${ticket.przydzielony}>. Przekazać może on sam albo osoba z wyższą rangą (lub właściciel/technik).`));
    }

    const poprzedni = ticket.przydzielony;
    q.przydziel.run(docelowy.id, ticket.id);

    const tytul = poprzedni ? 'Ticket przekazany' : 'Ticket przypisany';
    const opis = poprzedni
      ? `Przekazano <@${poprzedni}> → <@${docelowy.id}>\n**Zrobił:** <@${interaction.user.id}>`
      : `Przypisano <@${docelowy.id}>\n**Zrobił:** <@${interaction.user.id}>`;

    await interaction.channel.send({
      ...karty.kartaInfo({ tytul, opis, kolor: kolory.info }),
      allowedMentions: { users: [docelowy.id] },
    }).catch(() => null);

    // Powiadomienie na kanale narady administracji (jeśli jest)
    const narada = ticket.narada_id && interaction.guild.channels.cache.get(ticket.narada_id);
    if (narada) {
      await narada.send({
        ...karty.kartaInfo({ tytul, opis, kolor: kolory.info }),
        allowedMentions: { parse: [] },
      }).catch(() => null);
    }

    await log(interaction.client, {
      tytul: `Przekazano zgłoszenie #${ticket.id}`,
      opis: `**Kanał:** <#${ticket.kanal_id}>\n**Z:** ${poprzedni ? `<@${poprzedni}>` : '_bez przydziału_'}\n**Na:** <@${docelowy.id}>\n**Zrobił:** <@${interaction.user.id}>`,
      kolor: kolory.info,
      kanal: 'logiTickety',
    });

    return interaction.editReply(karty.kartaSukces(tytul,
      poprzedni
        ? `Ticket przekazano z <@${poprzedni}> na <@${docelowy.id}>.`
        : `Ticket przypisano do <@${docelowy.id}>.`));
  },
};
