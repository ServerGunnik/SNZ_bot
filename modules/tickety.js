const {
  ChannelType, PermissionFlagsBits, MessageFlags,
  ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
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
  poId: db.prepare('SELECT * FROM tickety WHERE id = ?'),
  zamknij: db.prepare("UPDATE tickety SET status = 'zamkniety', zamkniety = ?, zamknal = ?, wyjasnienie = ? WHERE id = ?"),
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
  if (!ticket || ticket.status !== 'otwarty') {
    return interaction.reply({
      ...karty.kartaBlad('Brak ticketu', 'Ten kanał nie jest otwartym ticketem.'),
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
  if (!ticket || ticket.status !== 'otwarty') {
    return interaction.reply({
      ...karty.kartaBlad('Brak ticketu', 'Ten kanał nie jest otwartym ticketem.'),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  }
  const czyStaff = jestStaff(interaction.member);
  const czyAutor = ticket.user_id === interaction.user.id;
  if (!czyStaff && !czyAutor) {
    return interaction.reply({
      ...karty.kartaBlad('Brak uprawnień', 'Ticket może zamknąć autor lub staff.'),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  }
  // Zamknięcie wymaga wyjaśnienia, jak sprawa została rozwiązana
  const modal = new ModalBuilder()
    .setCustomId(`ticket:zamknij-modal:${ticket.id}`)
    .setTitle('Zamknięcie zgłoszenia');
  modal.addComponents(new ActionRowBuilder().addComponents(
    new TextInputBuilder()
      .setCustomId('wyjasnienie')
      .setLabel('Wyjaśnienie — jak sprawa została rozwiązana?')
      .setPlaceholder('Opisz, co ustalono i jak rozwiązano zgłoszenie. Autor otrzyma to wyjaśnienie.')
      .setStyle(TextInputStyle.Paragraph)
      .setMinLength(config.tickety.minDlugoscWyjasnienia)
      .setMaxLength(1000)
      .setRequired(true)
  ));
  await interaction.showModal(modal);
}

async function onZamknijModal(interaction) {
  const [, , idStr] = interaction.customId.split(':');
  const ticket = q.poId.get(parseInt(idStr, 10));
  if (!ticket || ticket.status !== 'otwarty' || ticket.kanal_id !== interaction.channel?.id) {
    return interaction.reply({
      ...karty.kartaBlad('Nie można zamknąć', 'Ten ticket jest już zamknięty lub nie należy do tego kanału.'),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  }
  if (!jestStaff(interaction.member) && ticket.user_id !== interaction.user.id) {
    return interaction.reply({
      ...karty.kartaBlad('Brak uprawnień', 'Ticket może zamknąć autor lub staff.'),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  }
  const wyjasnienie = interaction.fields.getTextInputValue('wyjasnienie').trim();
  if (wyjasnienie.length < config.tickety.minDlugoscWyjasnienia) {
    return interaction.reply({
      ...karty.kartaBlad('Za krótkie wyjaśnienie', `Wyjaśnienie musi mieć co najmniej ${config.tickety.minDlugoscWyjasnienia} znaków.`),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  q.zamknij.run(Date.now(), interaction.user.id, wyjasnienie, ticket.id);

  // Wyjaśnienie widoczne w kanale (trafi też do transkryptu)
  await interaction.channel.send(karty.kartaWyjasnieniaTicketu({ zamykajacy: interaction.user.id, wyjasnienie })).catch(() => null);

  const zalacznik = await transkrypt(interaction.channel).catch(() => null);
  await wyslij(interaction.client, config.kanaly.logiTickety, {
    ...karty.kartaInfo({
      tytul: 'Ticket zamknięty',
      opis:
        `**Ticket:** ${interaction.channel.name}\n**Autor:** <@${ticket.user_id}>\n**Zamknął:** <@${interaction.user.id}>\n` +
        `**Kategoria:** ${ticket.kategoria}\n**Obsługiwał:** ${ticket.przydzielony ? `<@${ticket.przydzielony}>` : '_nikt_'}\n\n` +
        `**Wyjaśnienie:**\n${wyjasnienie}`,
      kolor: kolory.neutralny,
    }),
    ...(zalacznik ? { files: [zalacznik] } : {}),
  });

  // Ocena w DM razem z wyjaśnieniem
  const user = await interaction.client.users.fetch(ticket.user_id).catch(() => null);
  if (user) {
    await user.send(karty.kartaOcenyTicketu(ticket.id, wyjasnienie)).catch(() => null);
  }

  await interaction.editReply(karty.kartaSukces('Ticket zamknięty', 'Kanał zostanie usunięty za 5 sekund.'));
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
  zarejestruj('ticket:zamknij-modal', onZamknijModal);
  zarejestruj('ticket:zamknij', onZamknij);
  zarejestruj('ticket:ocena', onOcena);
}

module.exports = { rejestruj };
