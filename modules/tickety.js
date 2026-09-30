const {
  ChannelType, PermissionFlagsBits, MessageFlags,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
} = require('discord.js');
const db = require('../database/db.js');
const config = require('../config.js');
const karty = require('../utils/karty.js');
const { jestStaff } = require('../utils/uprawnienia.js');
const { log, wyslij } = require('../utils/logger.js');
const { transkrypt } = require('../utils/transkrypt.js');
const kolory = require('../utils/kolory.js');

const q = {
  otwarteUsera: db.prepare("SELECT COUNT(*) c FROM tickety WHERE user_id = ? AND status = 'otwarty'"),
  wstaw: db.prepare("INSERT INTO tickety (kanal_id, user_id, kategoria, otwarty) VALUES (?, ?, ?, ?)"),
  poKanale: db.prepare('SELECT * FROM tickety WHERE kanal_id = ?'),
  przydziel: db.prepare('UPDATE tickety SET przydzielony = ? WHERE id = ?'),
  zamknij: db.prepare("UPDATE tickety SET status = 'zamkniety', zamkniety = ? WHERE id = ?"),
  ocen: db.prepare('UPDATE tickety SET ocena = ? WHERE id = ?'),
};

function znajdzKategorie(value) {
  return config.tickety.kategorie.find(k => k.value === value);
}

async function onKategoriaSelect(interaction) {
  const kategoria = znajdzKategorie(interaction.values[0]);
  if (!kategoria) return;

  const otwarte = q.otwarteUsera.get(interaction.user.id).c;
  if (otwarte >= config.tickety.limitOtwartych) {
    return interaction.reply({
      ...karty.kartaOstrzezenie('Limit ticketów', `Masz już ${otwarte} otwarte zgłoszenia. Zamknij poprzednie, aby otworzyć nowe.`),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const kategoriaKanal = config.kanaly.kategoriaTickety || interaction.channel.parentId;
  const staffRoleId = config.role.staff;

  const kanal = await interaction.guild.channels.create({
    name: `┊${kategoria.value}-${interaction.user.username}`.slice(0, 90),
    type: ChannelType.GuildText,
    parent: kategoriaKanal || null,
    permissionOverwrites: [
      { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.ReadMessageHistory] },
      ...(staffRoleId ? [{ id: staffRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ReadMessageHistory] }] : []),
    ],
  });

  const info = q.wstaw.run(kanal.id, interaction.user.id, kategoria.label, Date.now());

  await kanal.send({
    content: `<@${interaction.user.id}>${staffRoleId ? ` <@&${staffRoleId}>` : ''}`,
    allowedMentions: { users: [interaction.user.id], roles: staffRoleId ? [staffRoleId] : [] },
  });
  await kanal.send(karty.kartaTicketu({ uzytkownik: interaction.user.id, kategoria: kategoria.label }));

  await interaction.editReply(karty.kartaSukces('Zgłoszenie otwarte', `Twój kanał: <#${kanal.id}>`));

  await log(interaction.client, {
    tytul: 'Nowe zgłoszenie',
    opis: `**Kanał:** <#${kanal.id}>\n**Autor:** <@${interaction.user.id}>\n**Kategoria:** ${kategoria.label}`,
    kolor: kolory.info,
    kanal: 'logiTickety',
  });
  void info;
}

async function onPrzejmij(interaction) {
  if (!jestStaff(interaction.member)) {
    return interaction.reply({
      ...karty.kartaBlad('Brak uprawnień', 'Tylko staff może przejmować zgłoszenia.'),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  }
  const ticket = q.poKanale.get(interaction.channel.id);
  if (!ticket) {
    return interaction.reply({
      ...karty.kartaBlad('Brak ticketu', 'Ten kanał nie jest ticketem.'),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  }
  q.przydziel.run(interaction.user.id, ticket.id);
  await interaction.update(karty.kartaTicketu({
    uzytkownik: ticket.user_id,
    kategoria: ticket.kategoria,
    przydzielony: interaction.user.id,
  }));
}

async function onZamknij(interaction) {
  const ticket = q.poKanale.get(interaction.channel.id);
  if (!ticket) return;
  const czyStaff = jestStaff(interaction.member);
  const czyAutor = ticket.user_id === interaction.user.id;
  if (!czyStaff && !czyAutor) {
    return interaction.reply({
      ...karty.kartaBlad('Brak uprawnień', 'Ticket może zamknąć autor lub staff.'),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  }
  const c = karty.kontener(0xf1c40f);
  c.addTextDisplayComponents(karty.tekst('## Potwierdź zamknięcie'));
  c.addSeparatorComponents(karty.separator(true));
  c.addTextDisplayComponents(karty.tekst('Ta operacja jest nieodwracalna. Kanał zostanie usunięty, a autor otrzyma prośbę o ocenę.'));
  c.addSeparatorComponents(karty.separator(false));
  c.addActionRowComponents(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ticket:zamknij-potw:${ticket.id}`).setLabel('Tak, zamknij').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('ticket:zamknij-anuluj').setLabel('Anuluj').setStyle(ButtonStyle.Secondary),
  ));
  await interaction.reply({ components: [c], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
}

async function onZamknijAnuluj(interaction) {
  await interaction.update(karty.kartaSukces('Anulowano', 'Ticket pozostaje otwarty.'));
}

async function onZamknijPotwierdz(interaction) {
  const [, , idStr] = interaction.customId.split(':');
  const ticket = db.prepare('SELECT * FROM tickety WHERE id = ?').get(parseInt(idStr, 10));
  if (!ticket) return;

  await interaction.update(karty.kartaOstrzezenie('Zamykanie...', 'Generuję transkrypt i usuwam kanał.'));

  // Transkrypt
  const zalacznik = await transkrypt(interaction.channel);
  await wyslij(interaction.client, config.kanaly.logiTickety, {
    ...karty.kartaInfo({
      tytul: 'Ticket zamknięty',
      opis: `**Ticket:** ${interaction.channel.name}\n**Autor:** <@${ticket.user_id}>\n**Zamknął:** <@${interaction.user.id}>\n**Kategoria:** ${ticket.kategoria}`,
      kolor: kolory.neutralny,
    }),
    files: [zalacznik],
  });

  q.zamknij.run(Date.now(), ticket.id);

  // Ocena w DM
  const user = await interaction.client.users.fetch(ticket.user_id).catch(() => null);
  if (user) {
    await user.send(karty.kartaOcenyTicketu(ticket.id)).catch(() => null);
  }

  await interaction.channel.send(karty.kartaSukces('Ticket zamknięty', 'Kanał zostanie usunięty za 5 sekund.'));
  setTimeout(() => interaction.channel.delete('Ticket zamknięty').catch(() => null), 5000);
}

async function onOcena(interaction) {
  const [, , idStr, ocenaStr] = interaction.customId.split(':');
  q.ocen.run(parseInt(ocenaStr, 10), parseInt(idStr, 10));
  await interaction.update(karty.kartaSukces('Dziękujemy', `Twoja ocena: **${ocenaStr}/5**. Dzięki za feedback.`));
}

function rejestruj({ zarejestruj }) {
  zarejestruj('ticket:kategoria', onKategoriaSelect);
  zarejestruj('ticket:przejmij', onPrzejmij);
  zarejestruj('ticket:zamknij-potw', onZamknijPotwierdz);
  zarejestruj('ticket:zamknij-anuluj', onZamknijAnuluj);
  zarejestruj('ticket:zamknij', onZamknij);
  zarejestruj('ticket:ocena', onOcena);
}

module.exports = { rejestruj };
