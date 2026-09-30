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
  wstaw: db.prepare("INSERT INTO tickety (kanal_id, user_id, kategoria, otwarty, temat, opis) VALUES (?, ?, ?, ?, ?, ?)"),
  zapiszWiadomosc: db.prepare('UPDATE tickety SET wiadomosc_id = ? WHERE id = ?'),
  poKanale: db.prepare('SELECT * FROM tickety WHERE kanal_id = ?'),
  przydziel: db.prepare('UPDATE tickety SET przydzielony = ? WHERE id = ?'),
  poId: db.prepare('SELECT * FROM tickety WHERE id = ?'),
  zamknij: db.prepare("UPDATE tickety SET status = 'zamkniety', zamkniety = ?, zamknal = ?, wyjasnienie = ? WHERE id = ?"),
  ocen: db.prepare('UPDATE tickety SET ocena = ? WHERE id = ?'),
  notatki: db.prepare('SELECT * FROM tickety_notatki WHERE ticket_id = ? ORDER BY id'),
  dodajNotatke: db.prepare('INSERT INTO tickety_notatki (ticket_id, autor_id, tresc, data) VALUES (?, ?, ?, ?)'),
};

const EPHEMERAL_V2 = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;

function znajdzKategorie(value) {
  return config.tickety.kategorie.find(k => k.value === value);
}

function kartaDlaTicketu(ticket) {
  return karty.kartaTicketu({
    ticketId: ticket.id,
    uzytkownik: ticket.user_id,
    kategoria: ticket.kategoria,
    przydzielony: ticket.przydzielony,
    temat: ticket.temat,
    opis: ticket.opis,
  });
}

function sprawdzLimit(interaction) {
  const otwarte = q.otwarteUsera.get(interaction.user.id).c;
  if (otwarte < config.tickety.limitOtwartych) return null;
  return interaction.reply({
    ...karty.kartaOstrzezenie('Limit ticketów', `Masz już ${otwarte} otwarte zgłoszenia. Zamknij poprzednie, aby otworzyć nowe.`),
    flags: EPHEMERAL_V2,
  });
}

// Krok 1: wybór kategorii -> formularz z tematem i opisem sprawy
async function onKategoriaSelect(interaction) {
  const kategoria = znajdzKategorie(interaction.values[0]);
  if (!kategoria) return;
  const odmowa = sprawdzLimit(interaction);
  if (odmowa) return odmowa;

  const modal = new ModalBuilder()
    .setCustomId(`ticket:formularz:${kategoria.value}`)
    .setTitle(`Zgłoszenie — ${kategoria.label}`.slice(0, 45));
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('temat').setLabel('Temat zgłoszenia')
        .setPlaceholder('Krótko, czego dotyczy sprawa')
        .setStyle(TextInputStyle.Short).setMinLength(3).setMaxLength(100).setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('opis').setLabel('Opis sprawy')
        .setPlaceholder('Opisz dokładnie sytuację: co się stało, kiedy, kogo dotyczy, dowody (linki)')
        .setStyle(TextInputStyle.Paragraph).setMinLength(10).setMaxLength(1500).setRequired(true)
    ),
  );
  await interaction.showModal(modal);
}

// Krok 2: formularz wysłany -> kanał ticketu z podsumowaniem
async function onFormularz(interaction) {
  const [, , kategoriaValue] = interaction.customId.split(':');
  const kategoria = znajdzKategorie(kategoriaValue);
  if (!kategoria) return;
  const odmowa = sprawdzLimit(interaction);
  if (odmowa) return odmowa;

  const temat = interaction.fields.getTextInputValue('temat').trim();
  const opis = interaction.fields.getTextInputValue('opis').trim();

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const kategoriaKanal = config.kanaly.kategoriaTickety || interaction.channel?.parentId;
  const staffRoleId = config.role.staff;

  const kanal = await interaction.guild.channels.create({
    name: `┊${kategoria.value}-${interaction.user.username}`.slice(0, 90),
    type: ChannelType.GuildText,
    parent: kategoriaKanal || null,
    topic: temat.slice(0, 1024),
    permissionOverwrites: [
      { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.ReadMessageHistory] },
      ...(staffRoleId ? [{ id: staffRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ReadMessageHistory] }] : []),
    ],
  });

  const info = q.wstaw.run(kanal.id, interaction.user.id, kategoria.label, Date.now(), temat, opis);
  const ticket = q.poId.get(info.lastInsertRowid);

  await kanal.send({
    content: `<@${interaction.user.id}>${staffRoleId ? ` <@&${staffRoleId}>` : ''}`,
    allowedMentions: { users: [interaction.user.id], roles: staffRoleId ? [staffRoleId] : [] },
  });
  const karta = await kanal.send(kartaDlaTicketu(ticket));
  q.zapiszWiadomosc.run(karta.id, ticket.id);

  await interaction.editReply(karty.kartaSukces('Zgłoszenie otwarte', `Twój kanał: <#${kanal.id}>`));

  await log(interaction.client, {
    tytul: 'Nowe zgłoszenie',
    opis: `**Kanał:** <#${kanal.id}>\n**Autor:** <@${interaction.user.id}>\n**Kategoria:** ${kategoria.label}\n**Temat:** ${temat}`,
    kolor: kolory.info,
    kanal: 'logiTickety',
  });
}

async function onPrzejmij(interaction) {
  if (!jestStaff(interaction.member)) {
    return interaction.reply({
      ...karty.kartaBlad('Brak uprawnień', 'Tylko staff może przejmować zgłoszenia.'),
      flags: EPHEMERAL_V2,
    });
  }
  const ticket = q.poKanale.get(interaction.channel.id);
  if (!ticket || ticket.status !== 'otwarty') {
    return interaction.reply({
      ...karty.kartaBlad('Brak ticketu', 'Ten kanał nie jest otwartym ticketem.'),
      flags: EPHEMERAL_V2,
    });
  }
  q.przydziel.run(interaction.user.id, ticket.id);
  await interaction.update(kartaDlaTicketu({ ...ticket, przydzielony: interaction.user.id }));
}

// ---- Panel staffu: notatki niewidoczne dla gracza ----------------------
// Notatki nie są wiadomościami na kanale - staff widzi je wyłącznie w odpowiedzi
// widocznej tylko dla siebie (ephemeral), a po zamknięciu trafiają do logu i transkryptu.

function ticketDlaStaffu(interaction, idStr) {
  if (!jestStaff(interaction.member)) {
    interaction.reply({
      ...karty.kartaBlad('Brak uprawnień', 'Panel staffu jest dostępny tylko dla administracji.'),
      flags: EPHEMERAL_V2,
    });
    return null;
  }
  const ticket = idStr ? q.poId.get(parseInt(idStr, 10)) : q.poKanale.get(interaction.channel.id);
  if (!ticket || ticket.status !== 'otwarty') {
    interaction.reply({
      ...karty.kartaBlad('Brak ticketu', 'Ten ticket jest już zamknięty.'),
      flags: EPHEMERAL_V2,
    });
    return null;
  }
  return ticket;
}

async function onPanelStaffu(interaction) {
  const [, , idStr] = interaction.customId.split(':');
  const ticket = ticketDlaStaffu(interaction, idStr);
  if (!ticket) return;
  const payload = karty.kartaNotatekTicketu({ ticketId: ticket.id, notatki: q.notatki.all(ticket.id) });
  // "Odśwież" w otwartym już panelu podmienia tę samą prywatną wiadomość
  if (interaction.message?.flags?.has(MessageFlags.Ephemeral)) return interaction.update(payload);
  await interaction.reply({ ...payload, flags: EPHEMERAL_V2 });
}

async function onDodajNotatke(interaction) {
  const [, , idStr] = interaction.customId.split(':');
  const ticket = ticketDlaStaffu(interaction, idStr);
  if (!ticket) return;
  const modal = new ModalBuilder()
    .setCustomId(`ticket:notatka-modal:${ticket.id}`)
    .setTitle('Notatka staffu (gracz jej nie widzi)');
  modal.addComponents(new ActionRowBuilder().addComponents(
    new TextInputBuilder().setCustomId('tresc').setLabel('Treść notatki')
      .setStyle(TextInputStyle.Paragraph).setMinLength(2).setMaxLength(500).setRequired(true)
  ));
  await interaction.showModal(modal);
}

async function onNotatkaModal(interaction) {
  const [, , idStr] = interaction.customId.split(':');
  const ticket = ticketDlaStaffu(interaction, idStr);
  if (!ticket) return;
  q.dodajNotatke.run(ticket.id, interaction.user.id, interaction.fields.getTextInputValue('tresc').trim(), Date.now());
  const payload = karty.kartaNotatekTicketu({ ticketId: ticket.id, notatki: q.notatki.all(ticket.id) });
  // Odśwież listę notatek w tej samej prywatnej wiadomości
  if (interaction.isFromMessage()) return interaction.update(payload);
  return interaction.reply({ ...payload, flags: EPHEMERAL_V2 });
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

  const notatki = q.notatki.all(ticket.id);
  const zalacznik = await transkrypt(interaction.channel, {
    dopisek: notatki.length ? [
      '=== Notatki staffu (niewidoczne dla gracza) ===',
      ...notatki.map(n => `[${new Date(n.data).toISOString()}] ${n.autor_id}: ${n.tresc}`),
    ] : [],
  }).catch(() => null);
  await wyslij(interaction.client, config.kanaly.logiTickety, {
    ...karty.kartaInfo({
      tytul: 'Ticket zamknięty',
      opis:
        `**Ticket:** ${interaction.channel.name}\n**Autor:** <@${ticket.user_id}>\n**Zamknął:** <@${interaction.user.id}>\n` +
        `**Kategoria:** ${ticket.kategoria}\n**Obsługiwał:** ${ticket.przydzielony ? `<@${ticket.przydzielony}>` : '_nikt_'}\n\n` +
        `**Temat:** ${ticket.temat || '_brak_'}\n\n` +
        `**Wyjaśnienie:**\n${wyjasnienie}` +
        (notatki.length ? `\n\n**Notatki staffu (${notatki.length}):**\n${karty.listaNotatek(notatki, 1800)}` : ''),
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
  zarejestruj('ticket:formularz', onFormularz);
  zarejestruj('ticket:notatki', onPanelStaffu);
  zarejestruj('ticket:notatka-dodaj', onDodajNotatke);
  zarejestruj('ticket:notatka-modal', onNotatkaModal);
  zarejestruj('ticket:przejmij', onPrzejmij);
  zarejestruj('ticket:zamknij-modal', onZamknijModal);
  zarejestruj('ticket:zamknij', onZamknij);
  zarejestruj('ticket:ocena', onOcena);
}

module.exports = { rejestruj };
