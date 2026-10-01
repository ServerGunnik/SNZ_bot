const {
  ChannelType, PermissionFlagsBits, MessageFlags,
  ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const db = require('../database/db.js');
const config = require('../config.js');
const karty = require('../utils/karty.js');
const { jestStaff } = require('../utils/uprawnienia.js');
const { walidujNick } = require('../utils/minecraft.js');
const { log } = require('../utils/logger.js');
const { transkrypt } = require('../utils/transkrypt.js');
const kolory = require('../utils/kolory.js');
const { gdzieNalezy, panstwoLidera } = require('./panstwa.js');
const { utworzList, opublikujList, aktywnyListNaNick } = require('./listy-goncze.js');

const q = {
  otwarteUsera: db.prepare("SELECT * FROM tickety WHERE user_id = ? AND status = 'otwarty'"),
  zamknijUsuniety: db.prepare("UPDATE tickety SET status = 'zamkniety', zamkniety = ?, wyjasnienie = 'Kanał ticketu został usunięty ręcznie.' WHERE id = ?"),
  zapiszNarade: db.prepare('UPDATE tickety SET narada_id = ? WHERE id = ?'),
  poNaradzie: db.prepare('SELECT * FROM tickety WHERE narada_id = ?'),
  wstaw: db.prepare(`INSERT INTO tickety (kanal_id, user_id, kategoria, kategoria_kod, formularz, temat, otwarty)
    VALUES (?, ?, ?, ?, ?, ?, ?)`),
  zapiszWiadomosc: db.prepare('UPDATE tickety SET wiadomosc_id = ? WHERE id = ?'),
  poKanale: db.prepare('SELECT * FROM tickety WHERE kanal_id = ?'),
  przydziel: db.prepare('UPDATE tickety SET przydzielony = ? WHERE id = ?'),
  poId: db.prepare('SELECT * FROM tickety WHERE id = ?'),
  zamknij: db.prepare("UPDATE tickety SET status = 'zamkniety', zamkniety = ?, zamknal = ?, wyjasnienie = ?, wynik = ? WHERE id = ?"),
  zapiszHistorie: db.prepare('UPDATE tickety SET historia_kanal_id = ?, historia_wiad_id = ? WHERE id = ?'),
  zapiszList: db.prepare('UPDATE tickety SET list_id = ? WHERE id = ?'),
  ocen: db.prepare('UPDATE tickety SET ocena = ? WHERE id = ?'),
  notatki: db.prepare('SELECT * FROM tickety_notatki WHERE ticket_id = ? ORDER BY id'),
  dodajNotatke: db.prepare('INSERT INTO tickety_notatki (ticket_id, autor_id, tresc, data) VALUES (?, ?, ?, ?)'),
};

const EPHEMERAL_V2 = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;
// Bot musi widzieć kanały, które tworzy z blokadą @everyone (gdy nie ma uprawnień administratora)
const DOSTEP_BOTA = [
  PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory,
  PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.ManageChannels,
];

function odpowiedz(interaction, payload) {
  return interaction.reply({ ...payload, flags: EPHEMERAL_V2 });
}

function znajdzKategorie(value) {
  return config.tickety.kategorie.find(k => k.value === value);
}

function polaTicketu(ticket) {
  try {
    return ticket.formularz ? JSON.parse(ticket.formularz) : [];
  } catch {
    return [];
  }
}

// Podgląd dla staffu: do jakiego państwa należy podany nick i czy ma aktywny list gończy
function informacjeONickach(ticket) {
  const kategoria = znajdzKategorie(ticket.kategoria_kod);
  if (!kategoria) return [];
  const linie = [];
  for (const pole of kategoria.pola.filter(p => p.nick)) {
    const nick = polaTicketu(ticket).find(p => p.id === pole.id)?.wartosc;
    if (!nick) continue;
    const przynaleznosc = gdzieNalezy(nick);
    linie.push(przynaleznosc
      ? `🏳️ \`${nick}\` — państwo **${przynaleznosc.panstwo.nazwa}** (${config.panstwa.statusy[przynaleznosc.status]})`
      : `🏳️ \`${nick}\` — nie należy do żadnego państwa`);
    const list = aktywnyListNaNick(nick);
    if (list) linie.push(`🎯 \`${nick}\` ma już aktywny list gończy **#${list.id}**`);
  }
  return linie;
}

function kartaDlaTicketu(ticket) {
  const kategoria = znajdzKategorie(ticket.kategoria_kod);
  return karty.kartaTicketu({
    ticketId: ticket.id,
    uzytkownik: ticket.user_id,
    kategoria: ticket.kategoria,
    przydzielony: ticket.przydzielony,
    pola: polaTicketu(ticket),
    informacje: informacjeONickach(ticket),
    listGonczy: kategoria?.listGonczy ? { id: ticket.list_id } : null,
    temat: ticket.temat,
    opis: ticket.opis,
  });
}

function kartaHistoriiDla(ticket) {
  return karty.kartaHistoriiTicketu({
    ticket,
    kategoria: znajdzKategorie(ticket.kategoria_kod)?.label || ticket.kategoria,
    pola: polaTicketu(ticket),
    wynik: config.tickety.wyniki[ticket.wynik],
    liczbaNotatek: q.notatki.all(ticket.id).length,
  });
}

// Liczba otwartych ticketów gracza; tickety, których kanał ktoś usunął ręcznie, są przy okazji zamykane
function liczbaOtwartych(interaction) {
  let otwarte = 0;
  for (const t of q.otwarteUsera.all(interaction.user.id)) {
    if (interaction.guild.channels.cache.has(t.kanal_id)) otwarte++;
    else q.zamknijUsuniety.run(Date.now(), t.id);
  }
  return otwarte;
}

function bladLimitu(otwarte) {
  return karty.kartaOstrzezenie('Limit ticketów', `Masz już ${otwarte} otwarte zgłoszenia (maksymalnie ${config.tickety.limitOtwartych} na osobę). Poczekaj, aż administracja je zamknie.`);
}

// Odświeżenie panelu czyści zaznaczoną kategorię w liście wyboru
async function resetujPanel(interaction) {
  const wiad = interaction.message;
  if (!wiad || wiad.author?.id !== interaction.client.user.id) return;
  await wiad.edit(karty.panelTicketow(config.tickety.kategorie)).catch(() => null);
}

// Ticket otwarty, a klikający jest staffem - w przeciwnym razie odpowiada błędem i zwraca null
function ticketDlaStaffu(interaction, idStr) {
  if (!jestStaff(interaction.member)) {
    odpowiedz(interaction, karty.kartaBlad('Brak uprawnień', 'Ta akcja jest dostępna tylko dla administracji.'));
    return null;
  }
  const ticket = idStr ? q.poId.get(parseInt(idStr, 10)) : q.poKanale.get(interaction.channel.id);
  if (!ticket || ticket.status !== 'otwarty') {
    odpowiedz(interaction, karty.kartaBlad('Brak ticketu', 'Ten ticket jest już zamknięty.'));
    return null;
  }
  return ticket;
}

// ---- Otwieranie: kategoria -> formularz -> kanał -----------------------

async function onKategoriaSelect(interaction) {
  const kategoria = znajdzKategorie(interaction.values[0]);
  const otwarte = kategoria ? liczbaOtwartych(interaction) : 0;
  if (!kategoria || otwarte >= config.tickety.limitOtwartych) {
    // Odpowiedź przez update panelu = reset wyboru, komunikat jako prywatna wiadomość
    await interaction.update(karty.panelTicketow(config.tickety.kategorie));
    return interaction.followUp({
      ...(kategoria ? bladLimitu(otwarte) : karty.kartaBlad('Panel nieaktualny', 'Ta kategoria już nie istnieje. Wybierz inną.')),
      flags: EPHEMERAL_V2,
    });
  }

  const modal = new ModalBuilder()
    .setCustomId(`ticket:formularz:${kategoria.value}`)
    .setTitle(kategoria.label.slice(0, 45));
  modal.addComponents(...kategoria.pola.slice(0, 5).map(pole => {
    const input = new TextInputBuilder()
      .setCustomId(pole.id)
      .setLabel(pole.label.slice(0, 45))
      .setStyle(pole.styl === 'dlugi' ? TextInputStyle.Paragraph : TextInputStyle.Short)
      .setRequired(pole.wymagane !== false)
      .setMaxLength(pole.max || 1000);
    if (pole.min && pole.wymagane !== false) input.setMinLength(pole.min);
    if (pole.placeholder) input.setPlaceholder(pole.placeholder.slice(0, 100));
    return new ActionRowBuilder().addComponents(input);
  }));
  await interaction.showModal(modal);
}

async function onFormularz(interaction) {
  const [, , kategoriaValue] = interaction.customId.split(':');
  const kategoria = znajdzKategorie(kategoriaValue);
  resetujPanel(interaction); // bez await - nie opóźnia odpowiedzi na formularz
  if (!kategoria) return odpowiedz(interaction, karty.kartaBlad('Panel nieaktualny', 'Ta kategoria już nie istnieje.'));
  const otwarte = liczbaOtwartych(interaction);
  if (otwarte >= config.tickety.limitOtwartych) return odpowiedz(interaction, bladLimitu(otwarte));

  const pola = kategoria.pola.slice(0, 5).map(pole => ({
    id: pole.id,
    label: pole.label,
    wartosc: (interaction.fields.getTextInputValue(pole.id) || '').trim(),
  }));
  const zlyNick = kategoria.pola.find(pole => {
    const wartosc = pola.find(p => p.id === pole.id)?.wartosc;
    return pole.nick && wartosc && !walidujNick(wartosc);
  });
  if (zlyNick) {
    return odpowiedz(interaction, karty.kartaBlad('Nieprawidłowy nick', `Pole „${zlyNick.label}” musi zawierać nick Minecraft: 3–16 znaków, tylko litery, cyfry i podkreślnik.`));
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const kategoriaKanal = config.kanaly.kategoriaTickety || interaction.channel?.parentId;
  const staffRoleId = config.role.staff;
  const nickPole = pola.find(p => kategoria.pola.find(k => k.id === p.id)?.nick);
  const temat = `${kategoria.label}${nickPole?.wartosc ? `: ${nickPole.wartosc}` : ''}`;

  const kanal = await interaction.guild.channels.create({
    name: `┊${kategoria.value}-${interaction.user.username}`.slice(0, 90),
    type: ChannelType.GuildText,
    parent: kategoriaKanal || null,
    topic: temat.slice(0, 1024),
    permissionOverwrites: [
      { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: interaction.client.user.id, allow: DOSTEP_BOTA },
      { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.ReadMessageHistory] },
      ...(staffRoleId ? [{ id: staffRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ReadMessageHistory] }] : []),
    ],
  });

  const info = q.wstaw.run(kanal.id, interaction.user.id, kategoria.label, kategoria.value, JSON.stringify(pola), temat, Date.now());
  const ticket = q.poId.get(info.lastInsertRowid);

  await kanal.send({
    content: `<@${interaction.user.id}>${staffRoleId ? ` <@&${staffRoleId}>` : ''}`,
    allowedMentions: { users: [interaction.user.id], roles: staffRoleId ? [staffRoleId] : [] },
  });
  const karta = await kanal.send(kartaDlaTicketu(ticket));
  q.zapiszWiadomosc.run(karta.id, ticket.id);

  await interaction.editReply(karty.kartaSukces('Zgłoszenie otwarte', `Twój kanał: <#${kanal.id}>`));

  const narada = await utworzNarade(interaction, ticket).catch((e) => { console.error('[tickety] narada', e.message); return null; });

  await log(interaction.client, {
    tytul: `Nowe zgłoszenie #${ticket.id}`,
    opis: `**Kanał:** <#${kanal.id}>\n**Narada:** ${narada ? `<#${narada.id}>` : '_nie utworzono_'}\n**Autor:** <@${interaction.user.id}>\n**Kategoria:** ${kategoria.label}${nickPole?.wartosc ? `\n**Nick:** \`${nickPole.wartosc}\`` : ''}`,
    kolor: kolory.info,
    kanal: 'logiTickety',
  });
}

async function onPrzejmij(interaction) {
  const ticket = ticketDlaStaffu(interaction);
  if (!ticket) return;
  if (ticket.przydzielony) {
    return odpowiedz(interaction, karty.kartaOstrzezenie('Już przejęte', `To zgłoszenie obsługuje już <@${ticket.przydzielony}>.`));
  }
  q.przydziel.run(interaction.user.id, ticket.id);
  await interaction.update(kartaDlaTicketu({ ...ticket, przydzielony: interaction.user.id }));
  const info = karty.kartaInfo({
    tytul: 'Zgłoszenie przejęte',
    opis: `Twoim zgłoszeniem zajmuje się <@${interaction.user.id}>.`,
    kolor: kolory.info,
  });
  await interaction.channel.send({ ...info, allowedMentions: { parse: [] } }).catch(() => null);
  const narada = ticket.narada_id && interaction.guild.channels.cache.get(ticket.narada_id);
  if (narada) await narada.send({ ...karty.kartaInfo({ tytul: 'Przejęto zgłoszenie', opis: `Obsługuje: <@${interaction.user.id}>`, kolor: kolory.info }), allowedMentions: { parse: [] } }).catch(() => null);
  await log(interaction.client, {
    tytul: `Przejęto zgłoszenie #${ticket.id}`,
    opis: `**Kanał:** <#${ticket.kanal_id}>\n**Obsługuje:** <@${interaction.user.id}>`,
    kolor: kolory.info,
    kanal: 'logiTickety',
  });
}

// ---- Kanał narady administracji -----------------------------------------
// Tworzony automatycznie razem z ticketem: sprawa-<nick discord>-<id>-administracja, widoczny tylko dla staffu

function nazwaNarady(username, ticketId) {
  const nick = username.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40) || 'gracz';
  return `sprawa-${nick}-${ticketId}-administracja`;
}

async function utworzNarade(interaction, ticket) {
  const staffRoleId = config.role.staff;
  const narada = await interaction.guild.channels.create({
    name: nazwaNarady(interaction.user.username, ticket.id),
    type: ChannelType.GuildText,
    parent: config.kanaly.kategoriaNarady || null,
    topic: `Narada administracji — ticket #${ticket.id} (${ticket.kategoria}). Gracz nie widzi tego kanału.`,
    permissionOverwrites: [
      { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: interaction.client.user.id, allow: DOSTEP_BOTA },
      ...(staffRoleId ? [{ id: staffRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.ReadMessageHistory] }] : []),
    ],
  });
  q.zapiszNarade.run(narada.id, ticket.id);
  await narada.send({
    ...karty.kartaNarady({
      ticketId: ticket.id,
      uzytkownik: ticket.user_id,
      kategoria: ticket.kategoria,
      kanalTicketu: ticket.kanal_id,
      pola: polaTicketu(ticket),
      informacje: informacjeONickach(ticket),
    }),
    allowedMentions: { parse: [] },
  });
  return narada;
}

// Ręczne usunięcie kanału ticketu lub narady (bez zamykania przyciskiem)
async function obsluzUsuniecieKanalu(kanal) {
  const ticket = q.poKanale.get(kanal.id);
  if (ticket && ticket.status === 'otwarty') {
    q.zamknijUsuniety.run(Date.now(), ticket.id);
    const narada = ticket.narada_id && kanal.guild.channels.cache.get(ticket.narada_id);
    if (narada) await narada.delete('Kanał ticketu usunięty ręcznie').catch(() => null);
    await log(kanal.client, {
      tytul: `Ticket #${ticket.id} usunięty ręcznie`,
      opis: `**Kanał:** #${kanal.name}\n**Autor:** <@${ticket.user_id}>\nTicket oznaczono jako zamknięty (bez wyniku).`,
      kolor: kolory.ostrzezenie,
      kanal: 'logiTickety',
    });
    return;
  }
  const zNarada = q.poNaradzie.get(kanal.id);
  if (zNarada) q.zapiszNarade.run(null, zNarada.id);
}

// ---- List gończy z ticketu ---------------------------------------------

async function onWystawList(interaction) {
  const [, , idStr] = interaction.customId.split(':');
  const ticket = ticketDlaStaffu(interaction, idStr);
  if (!ticket) return;
  const kategoria = znajdzKategorie(ticket.kategoria_kod);
  if (!kategoria?.listGonczy) return odpowiedz(interaction, karty.kartaBlad('Zła kategoria', 'Ten ticket nie dotyczy listu gończego.'));
  if (ticket.list_id) return odpowiedz(interaction, karty.kartaOstrzezenie('Już wystawiony', `Z tego ticketu wystawiono list **#${ticket.list_id}**.`));

  const pola = polaTicketu(ticket);
  const wartosc = (id) => pola.find(p => p.id === id)?.wartosc || null;
  const nick = wartosc(kategoria.listGonczy.nick);
  if (!nick || !walidujNick(nick)) return odpowiedz(interaction, karty.kartaBlad('Nieprawidłowy nick', 'W formularzu nie ma poprawnego nicku poszukiwanego.'));

  const listId = utworzList({
    nick,
    powod: wartosc(kategoria.listGonczy.powod) || `Ticket #${ticket.id}`,
    nagroda: wartosc(kategoria.listGonczy.nagroda),
    wystawcaId: ticket.user_id,
    panstwoId: panstwoLidera(ticket.user_id)?.id || null,
  });
  q.zapiszList.run(listId, ticket.id);
  const blad = await opublikujList(interaction.client, listId);

  await interaction.update(kartaDlaTicketu({ ...ticket, list_id: listId }));
  await interaction.followUp({
    ...(blad
      ? karty.kartaOstrzezenie('List aktywny, ale nieopublikowany', `List **#${listId}** na \`${nick}\` jest aktywny, ale nie trafił na kanał: ${blad}.`)
      : karty.kartaSukces('List gończy wystawiony', `List **#${listId}** na \`${nick}\` został opublikowany.`)),
    flags: EPHEMERAL_V2,
  });
  await interaction.channel.send(karty.kartaSukces('List gończy wystawiony', `Administracja wystawiła list gończy **#${listId}** na \`${nick}\`.`)).catch(() => null);
  await log(interaction.client, {
    tytul: 'List gończy wystawiony z ticketu',
    opis: `**Ticket:** #${ticket.id}\n**List:** #${listId} — \`${nick}\`\n**Wnioskodawca:** <@${ticket.user_id}>\n**Zatwierdził:** <@${interaction.user.id}>`,
    kolor: kolory.sukces,
  });
}

// ---- Panel staffu: notatki niewidoczne dla gracza ----------------------
// Notatki nie są wiadomościami na kanale - staff widzi je wyłącznie w odpowiedzi
// widocznej tylko dla siebie (ephemeral), a po zamknięciu trafiają do historii i transkryptu.

async function onPanelStaffu(interaction) {
  const [, , idStr] = interaction.customId.split(':');
  const ticket = ticketDlaStaffu(interaction, idStr);
  if (!ticket) return;
  const payload = karty.kartaNotatekTicketu({ ticketId: ticket.id, notatki: q.notatki.all(ticket.id), naradaId: ticket.narada_id });
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
  const payload = karty.kartaNotatekTicketu({ ticketId: ticket.id, notatki: q.notatki.all(ticket.id), naradaId: ticket.narada_id });
  // Odśwież listę notatek w tej samej prywatnej wiadomości
  if (interaction.isFromMessage()) return interaction.update(payload);
  return interaction.reply({ ...payload, flags: EPHEMERAL_V2 });
}

// ---- Zamykanie: wynik -> wyjaśnienie -> historia ------------------------

async function onZamknij(interaction) {
  // Zgłoszenie zamyka wyłącznie administracja
  const ticket = ticketDlaStaffu(interaction);
  if (!ticket) return;
  await odpowiedz(interaction, karty.kartaWynikuTicketu(ticket.id, config.tickety.wyniki));
}

async function onWynik(interaction) {
  const [, , idStr, kod] = interaction.customId.split(':');
  const ticket = ticketDlaStaffu(interaction, idStr);
  if (!ticket) return;
  const wynik = config.tickety.wyniki[kod];
  if (!wynik) return odpowiedz(interaction, karty.kartaBlad('Nieznany wynik', 'Wybierz wynik ponownie.'));
  const modal = new ModalBuilder()
    .setCustomId(`ticket:zamknij-modal:${ticket.id}:${kod}`)
    .setTitle(`Zamknięcie — ${wynik.label}`.slice(0, 45));
  modal.addComponents(new ActionRowBuilder().addComponents(
    new TextInputBuilder()
      .setCustomId('wyjasnienie')
      .setLabel('Wyjaśnienie dla gracza i do historii')
      .setPlaceholder('Co ustalono, co zrobiono, dlaczego taki wynik. Gracz otrzyma to wyjaśnienie.')
      .setStyle(TextInputStyle.Paragraph)
      .setMinLength(config.tickety.minDlugoscWyjasnienia)
      .setMaxLength(1000)
      .setRequired(true)
  ));
  await interaction.showModal(modal);
}

// Wpis na kanale historii (osobnym niż logi) + transkrypt pod nim
async function wyslijHistorie(client, ticket, zalacznik, zalacznikNarady = null) {
  const kanalId = config.kanaly.historiaTicketow || config.kanaly.logiTickety;
  if (!kanalId) return null;
  const kanal = await client.channels.fetch(kanalId).catch(() => null);
  if (!kanal) return null;
  const wiad = await kanal.send(kartaHistoriiDla(ticket))
    .catch((e) => { console.error('[tickety] historia', e.message); return null; });
  if (!wiad) return null;
  q.zapiszHistorie.run(kanal.id, wiad.id, ticket.id);
  if (zalacznik) {
    await kanal.send({
      ...karty.kartaPliku({ tytul: `Transkrypt ticketu #${ticket.id}`, nazwaPliku: zalacznik.name }),
      files: [zalacznik],
    }).catch(() => null);
  }
  if (zalacznikNarady) {
    await kanal.send({
      ...karty.kartaPliku({ tytul: `Transkrypt narady administracji — ticket #${ticket.id}`, nazwaPliku: zalacznikNarady.name }),
      files: [zalacznikNarady],
    }).catch(() => null);
  }
  return wiad;
}

async function onZamknijModal(interaction) {
  const [, , idStr, kod] = interaction.customId.split(':');
  const ticket = ticketDlaStaffu(interaction, idStr);
  if (!ticket) return;
  const wynik = config.tickety.wyniki[kod];
  if (!wynik || ticket.kanal_id !== interaction.channel?.id) {
    return odpowiedz(interaction, karty.kartaBlad('Nie można zamknąć', 'Zamknij zgłoszenie ponownie przyciskiem na karcie ticketu.'));
  }
  const wyjasnienie = interaction.fields.getTextInputValue('wyjasnienie').trim();
  if (wyjasnienie.length < config.tickety.minDlugoscWyjasnienia) {
    return odpowiedz(interaction, karty.kartaBlad('Za krótkie wyjaśnienie', `Wyjaśnienie musi mieć co najmniej ${config.tickety.minDlugoscWyjasnienia} znaków.`));
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  q.zamknij.run(Date.now(), interaction.user.id, wyjasnienie, kod, ticket.id);
  const zamkniety = q.poId.get(ticket.id);

  // Wynik i wyjaśnienie widoczne w kanale (trafi też do transkryptu)
  await interaction.channel.send(karty.kartaWyjasnieniaTicketu({ zamykajacy: interaction.user.id, wyjasnienie, wynik, wynikKod: kod })).catch(() => null);

  const pola = polaTicketu(zamkniety);
  const notatki = q.notatki.all(ticket.id);
  const zalacznik = await transkrypt(interaction.channel, {
    dopisek: [
      ...(pola.length ? ['=== Formularz ===', ...pola.map(p => `${p.label}: ${p.wartosc || '-'}`), ''] : []),
      `=== Wynik: ${wynik.label} ===`,
      `Zamknął: ${interaction.user.tag} (${interaction.user.id})`,
      `Wyjaśnienie: ${wyjasnienie}`,
      ...(notatki.length ? [
        '',
        '=== Notatki staffu (niewidoczne dla gracza) ===',
        ...notatki.map(n => `[${new Date(n.data).toISOString()}] ${n.autor_id}: ${n.tresc}`),
      ] : []),
    ],
  }).catch(() => null);

  const narada = ticket.narada_id && await interaction.client.channels.fetch(ticket.narada_id).catch(() => null);
  const zalacznikNarady = narada ? await transkrypt(narada).catch(() => null) : null;
  const historia = await wyslijHistorie(interaction.client, zamkniety, zalacznik, zalacznikNarady);

  await log(interaction.client, {
    tytul: `Zamknięto zgłoszenie #${ticket.id}`,
    opis:
      `**Kategoria:** ${ticket.kategoria}\n**Autor:** <@${ticket.user_id}>\n**Zamknął:** <@${interaction.user.id}>\n` +
      `**Wynik:** ${wynik.emoji} ${wynik.label}` +
      (historia ? `\n**Historia:** ${historia.url}` : '\n**Historia:** _nie zapisano — ustaw KANAL_HISTORIA_TICKETOW_'),
    kolor: kolory.neutralny,
    kanal: 'logiTickety',
  });

  // Ocena w DM razem z wynikiem i wyjaśnieniem
  const user = await interaction.client.users.fetch(ticket.user_id).catch(() => null);
  if (user) await user.send(karty.kartaOcenyTicketu(ticket.id, wyjasnienie, wynik)).catch(() => null);

  await interaction.editReply(karty.kartaSukces('Ticket zamknięty', 'Kanał zostanie usunięty za 5 sekund.'));
  setTimeout(() => {
    interaction.channel.delete('Ticket zamknięty').catch(() => null);
    if (narada) narada.delete('Ticket zamknięty').catch(() => null);
  }, 5000);
}

async function onOcena(interaction) {
  const [, , idStr, ocenaStr] = interaction.customId.split(':');
  const ticket = q.poId.get(parseInt(idStr, 10));
  const ocena = parseInt(ocenaStr, 10);
  if (!ticket || ticket.user_id !== interaction.user.id || !(ocena >= 1 && ocena <= 5)) {
    return interaction.update(karty.kartaBlad('Nie można ocenić', 'To zgłoszenie nie istnieje.'));
  }
  q.ocen.run(ocena, ticket.id);
  await interaction.update(karty.kartaSukces('Dziękujemy', `Twoja ocena: **${ocena}/5**. Dzięki za feedback.`));

  // Ocena trafia też do wpisu w historii ticketów
  if (ticket.historia_kanal_id && ticket.historia_wiad_id) {
    const kanal = await interaction.client.channels.fetch(ticket.historia_kanal_id).catch(() => null);
    const wiad = kanal && await kanal.messages.fetch(ticket.historia_wiad_id).catch(() => null);
    if (wiad) await wiad.edit(kartaHistoriiDla(q.poId.get(ticket.id))).catch(() => null);
  }
}

function rejestruj({ zarejestruj }) {
  zarejestruj('ticket:kategoria', onKategoriaSelect);
  zarejestruj('ticket:formularz', onFormularz);
  zarejestruj('ticket:notatki', onPanelStaffu);
  zarejestruj('ticket:notatka-dodaj', onDodajNotatke);
  zarejestruj('ticket:notatka-modal', onNotatkaModal);
  zarejestruj('ticket:przejmij', onPrzejmij);
  zarejestruj('ticket:wystaw-list', onWystawList);
  zarejestruj('ticket:zamknij', onZamknij);
  zarejestruj('ticket:wynik', onWynik);
  zarejestruj('ticket:zamknij-modal', onZamknijModal);
  zarejestruj('ticket:ocena', onOcena);
}

module.exports = { rejestruj, obsluzUsuniecieKanalu };
