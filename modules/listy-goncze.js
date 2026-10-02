const {
  MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder,
} = require('discord.js');
const db = require('../database/db.js');
const config = require('../config.js');
const karty = require('../utils/karty.js');
const { glowaUrl } = require('../utils/minecraft.js');
const { jestStaff } = require('../utils/uprawnienia.js');
const { log, wyslij } = require('../utils/logger.js');
const kolory = require('../utils/kolory.js');

const EPHEMERAL_V2 = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;

const q = {
  poId: db.prepare('SELECT * FROM listy_goncze WHERE id = ?'),
  zapiszWiad: db.prepare('UPDATE listy_goncze SET wiadomosc_id = ?, kanal_id = ? WHERE id = ?'),
  aktualizujStatus: db.prepare('UPDATE listy_goncze SET status = ?, zamkniety = ?, zamkniety_przez = ? WHERE id = ?'),
  aktywneOWygasajaceDo: db.prepare("SELECT * FROM listy_goncze WHERE status = 'aktywny' AND wygasa IS NOT NULL AND wygasa <= ?"),
  panstwoId: db.prepare('SELECT * FROM panstwa WHERE id = ?'),
  utworz: db.prepare('INSERT INTO listy_goncze (nick, powod, nagroda, wystawca_id, wystawca_panstwo_id, status, wygasa, utworzony) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'),
  nagrody: db.prepare('SELECT * FROM listy_nagrody WHERE list_id = ? ORDER BY id'),
  dodajNagrode: db.prepare('INSERT INTO listy_nagrody (list_id, user_id, nagroda, data) VALUES (?, ?, ?, ?)'),
  edytuj: db.prepare('UPDATE listy_goncze SET powod = ?, nagroda = ?, wygasa = ? WHERE id = ?'),
  wgStatusu: {
    aktywne: db.prepare("SELECT * FROM listy_goncze WHERE status = 'aktywny' ORDER BY id DESC"),
    oczekujace: db.prepare("SELECT * FROM listy_goncze WHERE status = 'oczekuje' ORDER BY id DESC"),
    zakonczone: db.prepare("SELECT * FROM listy_goncze WHERE status IN ('zrealizowany', 'wygasly', 'odrzucony') ORDER BY id DESC LIMIT 200"),
  },
  liczbaNagrod: db.prepare('SELECT list_id, COUNT(*) c FROM listy_nagrody GROUP BY list_id'),
  aktywnyNaNick: db.prepare("SELECT * FROM listy_goncze WHERE status = 'aktywny' AND nick = ? COLLATE NOCASE ORDER BY id DESC LIMIT 1"),
  wstawZgloszenie: db.prepare('INSERT INTO listy_zgloszenia (list_id, zglaszajacy_id, dowod, utworzone) VALUES (?, ?, ?, ?)'),
  zgloszenie: db.prepare('SELECT * FROM listy_zgloszenia WHERE id = ?'),
  aktualizujZgloszenie: db.prepare("UPDATE listy_zgloszenia SET status = ?, rozpatrzone = ?, rozpatrzyl = ? WHERE id = ?"),
};

function kartaListuDoWiadomosci(list) {
  const panstwo = list.wystawca_panstwo_id ? q.panstwoId.get(list.wystawca_panstwo_id) : null;
  return karty.kartaListuGonczego({
    list,
    glowaUrl: glowaUrl(list.nick),
    panstwoWystawcy: panstwo?.nazwa || null,
    nagrody: q.nagrody.all(list.id),
  });
}

// Zwraca null przy sukcesie albo opis problemu (żeby nie raportować fałszywego "opublikowano")
async function opublikujList(client, id) {
  const list = q.poId.get(id);
  if (!list) return 'list nie istnieje';
  if (!config.kanaly.listyGoncze) return 'brak KANAL_LISTY_GONCZE w .env';
  const kanal = await client.channels.fetch(config.kanaly.listyGoncze).catch(() => null);
  if (!kanal) return 'kanał listów gończych nie istnieje lub bot go nie widzi';
  const wiad = await kanal.send(kartaListuDoWiadomosci(list)).catch(() => null);
  if (!wiad) return 'bot nie może pisać na kanale listów gończych';
  q.zapiszWiad.run(wiad.id, kanal.id, id);
  return null;
}

async function aktualizujWiadomosc(client, id) {
  const list = q.poId.get(id);
  if (!list || !list.wiadomosc_id || !list.kanal_id) return;
  const kanal = await client.channels.fetch(list.kanal_id).catch(() => null);
  if (!kanal) return;
  const wiad = await kanal.messages.fetch(list.wiadomosc_id).catch(() => null);
  if (!wiad) return;
  await wiad.edit(kartaListuDoWiadomosci(list)).catch(() => {});
}

async function zamknijList(client, id, status, przezUserId) {
  q.aktualizujStatus.run(status, Date.now(), przezUserId, id);
  await aktualizujWiadomosc(client, id);
  await log(client, {
    tytul: 'List gończy zamknięty',
    opis: `**#${id}** — status: **${status}**\n**Zamknął:** <@${przezUserId}>`,
    kolor: kolory.info,
  });
}

const DZIEN_MS = 24 * 60 * 60 * 1000;
const MAX_DOLOZONYCH_NAGROD = 25;

// waznoscDni = 0 -> list bezterminowy
function utworzList({ nick, powod, nagroda = null, wystawcaId, panstwoId = null, status = 'aktywny', waznoscDni = config.listyGoncze.domyslnaWaznoscDni }) {
  const teraz = Date.now();
  const wygasa = waznoscDni === 0 ? null : teraz + waznoscDni * DZIEN_MS;
  const info = q.utworz.run(nick, powod.slice(0, 500), nagroda, wystawcaId, panstwoId, status, wygasa, teraz);
  return info.lastInsertRowid;
}

function aktywnyListNaNick(nick) {
  return q.aktywnyNaNick.get(nick);
}

// Handlery interakcji

async function onZglos(interaction) {
  const [, , idStr] = interaction.customId.split(':');
  const modal = new ModalBuilder().setCustomId(`list:zglos-modal:${idStr}`).setTitle('Zgłoszenie zatrzymania');
  modal.addComponents(new ActionRowBuilder().addComponents(
    new TextInputBuilder().setCustomId('dowod').setLabel('Dowód (opis + link do screena)')
      .setStyle(TextInputStyle.Paragraph).setMinLength(10).setMaxLength(1500).setRequired(true)
  ));
  await interaction.showModal(modal);
}

async function onZglosModal(interaction) {
  const [, , idStr] = interaction.customId.split(':');
  const id = parseInt(idStr, 10);
  const list = q.poId.get(id);
  if (!list || list.status !== 'aktywny') {
    return interaction.reply({
      ...karty.kartaBlad('List zamknięty', 'Ten list nie jest już aktywny.'),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  }
  const dowod = interaction.fields.getTextInputValue('dowod').trim();
  const info = q.wstawZgloszenie.run(id, interaction.user.id, dowod, Date.now());
  const zgloszenie = q.zgloszenie.get(info.lastInsertRowid);
  await wyslij(interaction.client, config.kanaly.logi, karty.kartaZgloszeniaListu({ list, zgloszenie }));
  await interaction.reply({
    ...karty.kartaSukces('Zgłoszenie wysłane', 'Staff rozpatrzy Twoje zgłoszenie.'),
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  });
}

async function onZglosDecyzja(interaction) {
  if (!jestStaff(interaction.member)) {
    return interaction.reply({
      ...karty.kartaBlad('Brak uprawnień', 'Tylko staff.'),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  }
  const [, , decyzja, idStr] = interaction.customId.split(':');
  const zgloszenie = q.zgloszenie.get(parseInt(idStr, 10));
  if (!zgloszenie || zgloszenie.status !== 'oczekuje') {
    return interaction.reply({
      ...karty.kartaOstrzezenie('Już rozpatrzone', 'Ktoś już zajął się tym zgłoszeniem.'),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  }
  const noweStatus = decyzja === 'ok' ? 'zatwierdzone' : 'odrzucone';
  q.aktualizujZgloszenie.run(noweStatus, Date.now(), interaction.user.id, zgloszenie.id);

  if (decyzja === 'ok' && q.poId.get(zgloszenie.list_id)?.status === 'aktywny') {
    await zamknijList(interaction.client, zgloszenie.list_id, 'zrealizowany', interaction.user.id);
  }

  await interaction.update({
    ...karty.kartaSukces('Rozpatrzone', `Zgłoszenie #${zgloszenie.id} → **${noweStatus}**.`),
    flags: MessageFlags.IsComponentsV2,
  });
}

async function onZamknij(interaction) {
  const [, , idStr] = interaction.customId.split(':');
  const id = parseInt(idStr, 10);
  const list = q.poId.get(id);
  if (!list || list.status !== 'aktywny') {
    return interaction.reply({
      ...karty.kartaOstrzezenie('List nieaktywny', 'Ten list gończy jest już zamknięty.'),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  }
  if (!jestStaff(interaction.member) && list.wystawca_id !== interaction.user.id) {
    return interaction.reply({
      ...karty.kartaBlad('Brak uprawnień', 'Zamknąć może wystawca lub staff.'),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  }
  await zamknijList(interaction.client, id, 'zrealizowany', interaction.user.id);
  await interaction.reply({
    ...karty.kartaSukces('Zamknięto', `List **#${id}** oznaczony jako zrealizowany.`),
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  });
}

// ---- Przegląd listów (/listy-goncze) -------------------------------------

const LISTOW_NA_STRONE = 8;

function widokListow(status, strona, { guildId, czyStaff }) {
  // Oczekujące na zatwierdzenie widzi tylko administracja
  if (!q.wgStatusu[status] || (status === 'oczekujace' && !czyStaff)) status = 'aktywne';
  const listy = q.wgStatusu[status].all();
  const nagrody = new Map(q.liczbaNagrod.all().map(r => [r.list_id, r.c]));
  const stron = Math.max(1, Math.ceil(listy.length / LISTOW_NA_STRONE));
  const s = Math.min(Math.max(1, strona), stron);
  return karty.kartaListyListow({
    status,
    listy: listy.slice((s - 1) * LISTOW_NA_STRONE, s * LISTOW_NA_STRONE).map(l => ({ ...l, dolozone: nagrody.get(l.id) || 0 })),
    total: listy.length,
    strona: s,
    stron,
    guildId,
    czyStaff,
  });
}

async function onStronaListow(interaction) {
  const [, , status, stronaStr] = interaction.customId.split(':');
  await interaction.update(widokListow(status, parseInt(stronaStr, 10) || 1, {
    guildId: interaction.guild.id,
    czyStaff: jestStaff(interaction.member),
  }));
}

// ---- Dokładanie nagród (każdy gracz) -----------------------------------

async function onNagroda(interaction) {
  const [, , idStr] = interaction.customId.split(':');
  const list = q.poId.get(parseInt(idStr, 10));
  if (!list || list.status !== 'aktywny') {
    return interaction.reply({ ...karty.kartaOstrzezenie('List nieaktywny', 'Ten list gończy jest już zamknięty.'), flags: EPHEMERAL_V2 });
  }
  if (q.nagrody.all(list.id).length >= MAX_DOLOZONYCH_NAGROD) {
    return interaction.reply({ ...karty.kartaOstrzezenie('Limit nagród', `Do listu dołożono już ${MAX_DOLOZONYCH_NAGROD} nagród.`), flags: EPHEMERAL_V2 });
  }
  const modal = new ModalBuilder().setCustomId(`list:nagroda-modal:${list.id}`).setTitle(`Dołóż nagrodę — ${list.nick}`.slice(0, 45));
  modal.addComponents(new ActionRowBuilder().addComponents(
    new TextInputBuilder().setCustomId('nagroda').setLabel('Co dokładasz do nagrody?')
      .setPlaceholder('np. 5 diamentów, zestaw netherite')
      .setStyle(TextInputStyle.Short).setMinLength(2).setMaxLength(100).setRequired(true)
  ));
  await interaction.showModal(modal);
}

async function onNagrodaModal(interaction) {
  const [, , idStr] = interaction.customId.split(':');
  const list = q.poId.get(parseInt(idStr, 10));
  if (!list || list.status !== 'aktywny') {
    return interaction.reply({ ...karty.kartaOstrzezenie('List nieaktywny', 'Ten list gończy jest już zamknięty.'), flags: EPHEMERAL_V2 });
  }
  const nagroda = interaction.fields.getTextInputValue('nagroda').trim();
  q.dodajNagrode.run(list.id, interaction.user.id, nagroda, Date.now());
  await aktualizujWiadomosc(interaction.client, list.id);
  await log(interaction.client, {
    tytul: 'Dołożono nagrodę do listu gończego',
    opis: `**List:** #${list.id} — \`${list.nick}\`\n**Nagroda:** ${nagroda}\n**Dołożył:** <@${interaction.user.id}>`,
    kolor: kolory.info,
  });
  await interaction.reply({ ...karty.kartaSukces('Nagroda dołożona', `Do listu **#${list.id}** na \`${list.nick}\` dodano: **${nagroda}**.`), flags: EPHEMERAL_V2 });
}

// ---- Edycja (wystawca lub staff) ---------------------------------------

function pozostaloDni(list) {
  return list.wygasa ? Math.max(1, Math.ceil((list.wygasa - Date.now()) / DZIEN_MS)) : 0;
}

async function onEdytuj(interaction) {
  const [, , idStr] = interaction.customId.split(':');
  const list = q.poId.get(parseInt(idStr, 10));
  if (!list || list.status !== 'aktywny') {
    return interaction.reply({ ...karty.kartaOstrzezenie('List nieaktywny', 'Ten list gończy jest już zamknięty.'), flags: EPHEMERAL_V2 });
  }
  if (!jestStaff(interaction.member) && list.wystawca_id !== interaction.user.id) {
    return interaction.reply({ ...karty.kartaBlad('Brak uprawnień', 'Edytować może wystawca listu lub administracja.'), flags: EPHEMERAL_V2 });
  }
  const modal = new ModalBuilder().setCustomId(`list:edytuj-modal:${list.id}`).setTitle(`Edycja listu #${list.id}`);
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('powod').setLabel('Powód').setStyle(TextInputStyle.Paragraph)
        .setMinLength(3).setMaxLength(500).setRequired(true).setValue(list.powod.slice(0, 500))
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('nagroda').setLabel('Nagroda główna (puste = brak)').setStyle(TextInputStyle.Short)
        .setMaxLength(100).setRequired(false).setValue((list.nagroda || '').slice(0, 100))
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('dni').setLabel('Ważność od dziś w dniach (0 = bez limitu)').setStyle(TextInputStyle.Short)
        .setMinLength(1).setMaxLength(3).setRequired(true).setValue(String(pozostaloDni(list)))
    ),
  );
  await interaction.showModal(modal);
}

async function onEdytujModal(interaction) {
  const [, , idStr] = interaction.customId.split(':');
  const list = q.poId.get(parseInt(idStr, 10));
  if (!list || list.status !== 'aktywny') {
    return interaction.reply({ ...karty.kartaOstrzezenie('List nieaktywny', 'Ten list gończy jest już zamknięty.'), flags: EPHEMERAL_V2 });
  }
  if (!jestStaff(interaction.member) && list.wystawca_id !== interaction.user.id) {
    return interaction.reply({ ...karty.kartaBlad('Brak uprawnień', 'Edytować może wystawca listu lub administracja.'), flags: EPHEMERAL_V2 });
  }
  const dniTekst = interaction.fields.getTextInputValue('dni').trim();
  const dni = /^\d+$/.test(dniTekst) ? parseInt(dniTekst, 10) : NaN;
  if (Number.isNaN(dni) || dni > 365) {
    return interaction.reply({ ...karty.kartaBlad('Zła ważność', 'Podaj liczbę dni od 0 do 365 (0 = bez limitu czasu).'), flags: EPHEMERAL_V2 });
  }
  const powod = interaction.fields.getTextInputValue('powod').trim();
  const nagroda = interaction.fields.getTextInputValue('nagroda').trim() || null;
  const wygasa = dni === 0 ? null : Date.now() + dni * DZIEN_MS;
  q.edytuj.run(powod, nagroda, wygasa, list.id);
  await aktualizujWiadomosc(interaction.client, list.id);
  await log(interaction.client, {
    tytul: 'Edytowano list gończy',
    opis:
      `**List:** #${list.id} — \`${list.nick}\`\n**Edytował:** <@${interaction.user.id}>\n` +
      `**Nagroda:** ${list.nagroda || 'brak'} → ${nagroda || 'brak'}\n` +
      `**Ważność:** ${dni === 0 ? 'bez limitu czasu' : `${dni} dni`}` +
      (powod !== list.powod ? `\n**Nowy powód:** ${powod}` : ''),
    kolor: kolory.info,
  });
  await interaction.reply({
    ...karty.kartaSukces('List zaktualizowany', `List **#${list.id}** — ważność: **${dni === 0 ? 'bez limitu czasu' : `${dni} dni`}**.`),
    flags: EPHEMERAL_V2,
  });
}

// Cykliczne wygasanie

function uruchomZadaniaCykliczne(client) {
  const tick = async () => {
    const wygasajace = q.aktywneOWygasajaceDo.all(Date.now());
    for (const l of wygasajace) {
      await zamknijList(client, l.id, 'wygasly', client.user.id).catch(() => {});
    }
  };
  setInterval(tick, config.listyGoncze.interwalWygasaniaMs);
  tick();
}

function rejestruj({ zarejestruj }) {
  zarejestruj('list:zglos', onZglos);
  zarejestruj('list:zglos-modal', onZglosModal);
  zarejestruj('list:zgl', onZglosDecyzja);
  zarejestruj('list:zamknij', onZamknij);
  zarejestruj('list:nagroda', onNagroda);
  zarejestruj('list:nagroda-modal', onNagrodaModal);
  zarejestruj('list:edytuj', onEdytuj);
  zarejestruj('list:edytuj-modal', onEdytujModal);
  zarejestruj('listy:str', onStronaListow);
}

module.exports = {
  rejestruj,
  opublikujList,
  utworzList,
  aktywnyListNaNick,
  widokListow,
  zamknijList,
  aktualizujWiadomosc,
  kartaListuDoWiadomosci,
  uruchomZadaniaCykliczne,
};
