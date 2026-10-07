const {
  MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder,
  LabelBuilder, FileUploadBuilder, AttachmentBuilder, ChannelType, PermissionFlagsBits,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
} = require('discord.js');
const db = require('../database/db.js');
const config = require('../config.js');
const karty = require('../utils/karty.js');
const { glowaUrl } = require('../utils/minecraft.js');
const { jestStaff, jestLider } = require('../utils/uprawnienia.js');
const { log, wyslij } = require('../utils/logger.js');
const { transkrypt } = require('../utils/transkrypt.js');
const kolory = require('../utils/kolory.js');

const EPHEMERAL_V2 = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;

const q = {
  poId: db.prepare('SELECT * FROM listy_goncze WHERE id = ?'),
  zapiszWiad: db.prepare('UPDATE listy_goncze SET wiadomosc_id = ?, kanal_id = ? WHERE id = ?'),
  aktualizujStatus: db.prepare('UPDATE listy_goncze SET status = ?, zamkniety = ?, zamkniety_przez = ? WHERE id = ?'),
  aktywneOWygasajaceDo: db.prepare("SELECT * FROM listy_goncze WHERE status = 'aktywny' AND wygasa IS NOT NULL AND wygasa <= ?"),
  panstwoId: db.prepare('SELECT * FROM panstwa WHERE id = ?'),
  panstwoLidera: db.prepare('SELECT * FROM panstwa WHERE lider_id = ?'),
  utworz: db.prepare('INSERT INTO listy_goncze (nick, powod, nagroda, wystawca_id, wystawca_panstwo_id, status, wygasa, utworzony) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'),
  nagrody: db.prepare('SELECT * FROM listy_nagrody WHERE list_id = ? ORDER BY id'),
  dodajNagrode: db.prepare('INSERT INTO listy_nagrody (list_id, user_id, nagroda, data) VALUES (?, ?, ?, ?)'),
  nagrodaId: db.prepare('SELECT * FROM listy_nagrody WHERE id = ?'),
  zmienNagrode: db.prepare('UPDATE listy_nagrody SET nagroda = ? WHERE id = ?'),
  usunNagrode: db.prepare('DELETE FROM listy_nagrody WHERE id = ?'),
  edytuj: db.prepare('UPDATE listy_goncze SET powod = ?, nagroda = ?, wygasa = ? WHERE id = ?'),
  wgStatusu: {
    aktywne: db.prepare("SELECT * FROM listy_goncze WHERE status = 'aktywny' ORDER BY id DESC"),
    oczekujace: db.prepare("SELECT * FROM listy_goncze WHERE status = 'oczekuje' ORDER BY id DESC"),
    zakonczone: db.prepare("SELECT * FROM listy_goncze WHERE status IN ('zrealizowany', 'wygasly', 'odrzucony') ORDER BY id DESC LIMIT 200"),
  },
  liczbaNagrod: db.prepare('SELECT list_id, COUNT(*) c FROM listy_nagrody GROUP BY list_id'),
  aktywnyNaNick: db.prepare("SELECT * FROM listy_goncze WHERE status = 'aktywny' AND nick = ? COLLATE NOCASE ORDER BY id DESC LIMIT 1"),
  wstawZgloszenie: db.prepare('INSERT INTO listy_zgloszenia (list_id, zglaszajacy_id, dowod, link, utworzone) VALUES (?, ?, ?, ?, ?)'),
  oczekujaceZKanalem: db.prepare("SELECT * FROM listy_zgloszenia WHERE status = 'oczekuje' AND kanal_id IS NOT NULL AND wiadomosc_id IS NOT NULL"),
  oczekujaceZgloszenieUsera: db.prepare("SELECT * FROM listy_zgloszenia WHERE list_id = ? AND zglaszajacy_id = ? AND status = 'oczekuje'"),
  zapiszKanalZgloszenia: db.prepare('UPDATE listy_zgloszenia SET kanal_id = ?, wiadomosc_id = ? WHERE id = ?'),
  zglaszajacyDodany: db.prepare('UPDATE listy_zgloszenia SET zglaszajacy_dodany = 1 WHERE id = ?'),
  zgloszenieNaKanale: db.prepare('SELECT * FROM listy_zgloszenia WHERE kanal_id = ?'),
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
  const list = q.poId.get(id);
  q.aktualizujStatus.run(status, Date.now(), przezUserId, id);
  await aktualizujWiadomosc(client, id);
  await log(client, {
    tytul: 'List gończy zamknięty',
    opis: `**List:** #${id}${list ? ` — \`${list.nick}\`` : ''}\n**Status:** ${list?.status || '?'} → **${status}**\n**Zamknął:** <@${przezUserId}>`,
    kolor: kolory.info,
  });
}

// Edytować i zamykać listy może staff (każdy list) oraz lider państwa (listy swojego państwa lub wystawione przez siebie)
function mozeZarzadzacListem(member, list) {
  if (jestStaff(member)) return true;
  if (!jestLider(member)) return false;
  if (list.wystawca_id === member.id) return true;
  const panstwo = q.panstwoLidera.get(member.id);
  return Boolean(panstwo && list.wystawca_panstwo_id === panstwo.id);
}

const BRAK_UPRAWNIEN_LISTU = 'Edytować i zamykać listy gończe może administracja oraz lider państwa, które wystawiło list.';

function zmiana(lista, pole, przed, po) {
  lista.push(`**${pole}:**\n> ${String(przed).slice(0, 700)}\n→ ${String(po).slice(0, 700)}`);
}

function opisWaznosci(wygasa) {
  return wygasa ? `do <t:${Math.floor(wygasa / 1000)}:f>` : 'bez limitu czasu';
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

// ---- Zgłoszenie zatrzymania (realizacja listu) -------------------------
// Gracz opisuje zatrzymanie i dołącza plik (zdjęcie/nagranie) + opcjonalny link.
// Powstaje kanał widoczny tylko dla administracji; administracja może dodać do niego zgłaszającego.

const LIMIT_PLIKU = 10 * 1024 * 1024; // limit wysyłki plików przez bota na serwerze bez boosta

async function onZglos(interaction) {
  const [, , idStr] = interaction.customId.split(':');
  const list = q.poId.get(parseInt(idStr, 10));
  if (!list || list.status !== 'aktywny') {
    return interaction.reply({ ...karty.kartaOstrzezenie('List nieaktywny', 'Ten list gończy jest już zamknięty.'), flags: EPHEMERAL_V2 });
  }
  const oczekujace = q.oczekujaceZgloszenieUsera.get(list.id, interaction.user.id);
  if (oczekujace) {
    return interaction.reply({ ...karty.kartaOstrzezenie('Zgłoszenie w trakcie', 'Twoje zgłoszenie do tego listu czeka już na decyzję administracji.'), flags: EPHEMERAL_V2 });
  }
  const modal = new ModalBuilder().setCustomId(`list:zglos-modal:${list.id}`).setTitle(`Zatrzymanie — ${list.nick}`.slice(0, 45));
  modal.addLabelComponents(
    new LabelBuilder().setLabel('Opis zatrzymania')
      .setDescription('Gdzie, kiedy i jak zatrzymałeś poszukiwanego?')
      .setTextInputComponent(new TextInputBuilder().setCustomId('opis').setStyle(TextInputStyle.Paragraph)
        .setMinLength(10).setMaxLength(1500).setRequired(true)),
    new LabelBuilder().setLabel('Dowód — zdjęcie lub nagranie')
      .setDescription('Wymagany co najmniej 1 plik (maks. 5)')
      .setFileUploadComponent(new FileUploadBuilder().setCustomId('pliki').setMinValues(1).setMaxValues(5).setRequired(true)),
    new LabelBuilder().setLabel('Link do nagrania (opcjonalnie)')
      .setDescription('Np. YouTube, gdy nagranie jest za duże na Discorda')
      .setTextInputComponent(new TextInputBuilder().setCustomId('link').setStyle(TextInputStyle.Short)
        .setMaxLength(300).setRequired(false)),
  );
  await interaction.showModal(modal);
}

// Pobiera pliki z formularza i wysyła je ponownie (linki z formularza po czasie wygasają)
async function przygotujDowody(zalaczniki) {
  const pliki = [];
  const zaDuze = [];
  for (const z of zalaczniki) {
    if (z.size > LIMIT_PLIKU) { zaDuze.push(z); continue; }
    const dane = await fetch(z.url).then(r => (r.ok ? r.arrayBuffer() : null)).catch(() => null);
    if (!dane) { zaDuze.push(z); continue; }
    const nazwa = `dowod-${pliki.length + 1}-${z.name}`.replace(/[^\w.-]/g, '_').slice(0, 90);
    pliki.push({ zalacznik: new AttachmentBuilder(Buffer.from(dane), { name: nazwa }), nazwa, typ: z.contentType || '' });
  }
  return { pliki, zaDuze };
}

async function onZglosModal(interaction) {
  const [, , idStr] = interaction.customId.split(':');
  const list = q.poId.get(parseInt(idStr, 10));
  if (!list || list.status !== 'aktywny') {
    return interaction.reply({ ...karty.kartaBlad('List zamknięty', 'Ten list nie jest już aktywny.'), flags: EPHEMERAL_V2 });
  }
  if (q.oczekujaceZgloszenieUsera.get(list.id, interaction.user.id)) {
    return interaction.reply({ ...karty.kartaOstrzezenie('Zgłoszenie w trakcie', 'Twoje zgłoszenie do tego listu czeka już na decyzję administracji.'), flags: EPHEMERAL_V2 });
  }
  const opis = interaction.fields.getTextInputValue('opis').trim();
  const link = (interaction.fields.getTextInputValue('link') || '').trim() || null;
  const zalaczniki = [...(interaction.fields.getUploadedFiles('pliki', true)?.values() || [])];
  if (!zalaczniki.length) {
    return interaction.reply({ ...karty.kartaBlad('Brak dowodu', 'Dołącz co najmniej jedno zdjęcie lub nagranie.'), flags: EPHEMERAL_V2 });
  }
  if (link && !/^https?:\/\/\S+$/i.test(link)) {
    return interaction.reply({ ...karty.kartaBlad('Nieprawidłowy link', 'Link musi zaczynać się od http:// lub https://.'), flags: EPHEMERAL_V2 });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const zgloszenieId = q.wstawZgloszenie.run(list.id, interaction.user.id, opis, link, Date.now()).lastInsertRowid;

  // Kanał tylko dla administracji (i bota)
  const staff = config.role.staff;
  const kanal = await interaction.guild.channels.create({
    name: `zatrzymanie-${list.nick}-${zgloszenieId}`.toLowerCase().slice(0, 90),
    type: ChannelType.GuildText,
    parent: config.kanaly.kategoriaNarady || null,
    topic: `Zgłoszenie zatrzymania #${zgloszenieId} — list gończy #${list.id} (${list.nick}). Zgłaszający nie widzi kanału, dopóki administracja go nie doda.`,
    permissionOverwrites: [
      { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: interaction.client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.ManageChannels] },
      ...staff.map(id => ({ id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] })),
    ],
  });

  // Kanał zapisany PRZED wysłaniem karty - od niego zależy przycisk "Dodaj zgłaszającego"
  q.zapiszKanalZgloszenia.run(kanal.id, null, zgloszenieId);
  if (staff.length) {
    const ping = staff.map(id => `<@&${id}>`).join(' ');
    await kanal.send({ content: `${ping} nowe zgłoszenie zatrzymania do rozpatrzenia.`, allowedMentions: { roles: staff } }).catch(() => null);
  }
  const karta = await kanal.send({ ...karty.kartaZgloszeniaListu({ list, zgloszenie: q.zgloszenie.get(zgloszenieId) }), allowedMentions: { parse: [] } });
  q.zapiszKanalZgloszenia.run(kanal.id, karta.id, zgloszenieId);

  // Dowody w osobnej wiadomości (karta z przyciskami jest później edytowana)
  const { pliki, zaDuze } = await przygotujDowody(zalaczniki);
  await kanal.send({
    ...karty.kartaDowodowZatrzymania({
      pliki: pliki.map(p => ({ nazwa: p.nazwa, typ: p.typ })),
      linki: [...zaDuze.map(z => `[${z.name}](${z.url}) _(za duży do przesłania — link może wygasnąć)_`), ...(link ? [link] : [])],
    }),
    files: pliki.map(p => p.zalacznik),
    allowedMentions: { parse: [] },
  }).catch((e) => {
    console.error('[listy-goncze] dowody', e.message);
    return kanal.send(karty.kartaOstrzezenie('Nie udało się przesłać dowodów', zalaczniki.map(z => z.url).join('\n'))).catch(() => null);
  });

  await log(interaction.client, {
    tytul: 'Zgłoszenie zatrzymania',
    opis: `**List:** #${list.id} — \`${list.nick}\`\n**Zgłaszający:** <@${interaction.user.id}>\n**Kanał:** <#${kanal.id}>`,
    kolor: kolory.info,
  });
  await interaction.editReply(karty.kartaSukces('Zgłoszenie wysłane',
    'Administracja sprawdzi Twój dowód. Jeśli będzie potrzebować więcej szczegółów, doda Cię do kanału zgłoszenia.'));
}

// Wpuszcza zgłaszającego na kanał zgłoszenia (przycisk na karcie albo /zatrzymanie dodaj-zglaszajacego).
// Zwraca null przy sukcesie albo opis błędu.
async function dodajZglaszajacego(kanal, zgloszenie, przezTag) {
  if (!zgloszenie || zgloszenie.status !== 'oczekuje' || !zgloszenie.kanal_id) return 'To zgłoszenie jest już zamknięte.';
  const ok = await kanal.permissionOverwrites.edit(zgloszenie.zglaszajacy_id, {
    ViewChannel: true, SendMessages: true, AttachFiles: true, ReadMessageHistory: true,
  }, { reason: `Zgłoszenie zatrzymania #${zgloszenie.id}: dodał ${przezTag}` }).then(() => true).catch((e) => {
    console.error('[listy-goncze] dodanie zgłaszającego', e.message);
    return false;
  });
  if (!ok) return 'Bot nie może zmienić uprawnień tego kanału (potrzebuje uprawnienia „Zarządzanie kanałami”).';
  q.zglaszajacyDodany.run(zgloszenie.id);
  await kanal.send({
    content: `<@${zgloszenie.zglaszajacy_id}>, administracja ma pytania do Twojego zgłoszenia zatrzymania — odpowiedz tutaj.`,
    allowedMentions: { users: [zgloszenie.zglaszajacy_id] },
  }).catch(() => null);
  return null;
}

function kartaZgloszeniaPoId(id) {
  const zgloszenie = q.zgloszenie.get(id);
  const list = zgloszenie && q.poId.get(zgloszenie.list_id);
  return list ? { ...karty.kartaZgloszeniaListu({ list, zgloszenie }), allowedMentions: { parse: [] } } : null;
}

async function onDodajZglaszajacego(interaction) {
  if (!jestStaff(interaction.member)) {
    return interaction.reply({ ...karty.kartaBlad('Brak uprawnień', 'Tylko administracja.'), flags: EPHEMERAL_V2 });
  }
  const [, , idStr] = interaction.customId.split(':');
  const zgloszenie = q.zgloszenie.get(parseInt(idStr, 10));
  const blad = await dodajZglaszajacego(interaction.channel, zgloszenie, interaction.user.tag);
  if (blad) return interaction.reply({ ...karty.kartaBlad('Nie można dodać', blad), flags: EPHEMERAL_V2 });
  await interaction.update(kartaZgloszeniaPoId(zgloszenie.id));
}

// /zatrzymanie dodaj-zglaszajacego - działa na kanale zgłoszenia także bez przycisku na karcie
async function dodajZglaszajacegoNaKanale(interaction) {
  const zgloszenie = q.zgloszenieNaKanale.get(interaction.channel.id);
  if (!zgloszenie) return 'To nie jest kanał zgłoszenia zatrzymania.';
  const blad = await dodajZglaszajacego(interaction.channel, zgloszenie, interaction.user.tag);
  if (blad) return blad;
  const wiad = zgloszenie.wiadomosc_id && await interaction.channel.messages.fetch(zgloszenie.wiadomosc_id).catch(() => null);
  if (wiad) await wiad.edit(kartaZgloszeniaPoId(zgloszenie.id)).catch(() => null);
  return null;
}

async function onZglosDecyzja(interaction) {
  if (!jestStaff(interaction.member)) {
    return interaction.reply({ ...karty.kartaBlad('Brak uprawnień', 'Tylko staff.'), flags: EPHEMERAL_V2 });
  }
  const [, , decyzja, idStr] = interaction.customId.split(':');
  const zgloszenie = q.zgloszenie.get(parseInt(idStr, 10));
  if (!zgloszenie || zgloszenie.status !== 'oczekuje') {
    return interaction.reply({ ...karty.kartaOstrzezenie('Już rozpatrzone', 'Ktoś już zajął się tym zgłoszeniem.'), flags: EPHEMERAL_V2 });
  }
  const zatwierdzone = decyzja === 'ok';
  const noweStatus = zatwierdzone ? 'zatwierdzone' : 'odrzucone';
  q.aktualizujZgloszenie.run(noweStatus, Date.now(), interaction.user.id, zgloszenie.id);
  const list = q.poId.get(zgloszenie.list_id);
  if (zatwierdzone && list?.status === 'aktywny') {
    await zamknijList(interaction.client, zgloszenie.list_id, 'zrealizowany', interaction.user.id);
  }

  await interaction.update({ ...karty.kartaZgloszeniaListu({ list: q.poId.get(zgloszenie.list_id) || list, zgloszenie: q.zgloszenie.get(zgloszenie.id) }), allowedMentions: { parse: [] } });

  const user = await interaction.client.users.fetch(zgloszenie.zglaszajacy_id).catch(() => null);
  if (user) {
    await user.send(zatwierdzone
      ? karty.kartaSukces('Zatrzymanie zatwierdzone', `Twoje zgłoszenie zatrzymania \`${list?.nick || '?'}\` (list #${zgloszenie.list_id}) zostało zatwierdzone. Zgłoś się po nagrodę do wystawcy listu.`)
      : karty.kartaBlad('Zatrzymanie odrzucone', `Twoje zgłoszenie zatrzymania \`${list?.nick || '?'}\` (list #${zgloszenie.list_id}) zostało odrzucone przez administrację.`)).catch(() => null);
  }

  // Kanał zgłoszenia: transkrypt do logów i usunięcie
  if (zgloszenie.kanal_id && interaction.channel?.id === zgloszenie.kanal_id) {
    const zal = await transkrypt(interaction.channel).catch(() => null);
    await wyslij(interaction.client, config.kanaly.logi, {
      ...karty.kartaInfo({
        tytul: `Zgłoszenie zatrzymania #${zgloszenie.id} — ${noweStatus}`,
        opis: `**List:** #${zgloszenie.list_id} — \`${list?.nick || '?'}\`\n**Zgłaszający:** <@${zgloszenie.zglaszajacy_id}>\n**Rozpatrzył:** <@${interaction.user.id}>`,
        kolor: zatwierdzone ? kolory.sukces : kolory.blad,
      }),
      allowedMentions: { parse: [] },
      ...(zal ? { files: [zal] } : {}),
    });
    await interaction.channel.send(karty.kartaInfo({ tytul: 'Zgłoszenie rozpatrzone', opis: 'Kanał zostanie usunięty za 10 sekund.' })).catch(() => null);
    setTimeout(() => interaction.channel.delete('Zgłoszenie zatrzymania rozpatrzone').catch(() => null), 10000);
  }
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
  if (!mozeZarzadzacListem(interaction.member, list)) {
    return interaction.reply({ ...karty.kartaBlad('Brak uprawnień', BRAK_UPRAWNIEN_LISTU), flags: EPHEMERAL_V2 });
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
    new TextInputBuilder().setCustomId('nagroda').setLabel('Co dokładasz? (potem nie da się cofnąć)')
      .setPlaceholder('np. 5 diamentów, zestaw netherite')
      .setStyle(TextInputStyle.Short).setMinLength(2).setMaxLength(100).setRequired(true)
  ));
  await interaction.showModal(modal);
}

// Dołożenie nagrody jest nieodwracalne, więc najpierw prosimy o potwierdzenie.
// Oczekujące potwierdzenia trzymamy w pamięci (wygasają po 10 min albo po restarcie bota).
const oczekujaceNagrody = new Map(); // token -> { listId, userId, nagroda, czas }
const WAZNOSC_POTWIERDZENIA_MS = 10 * 60 * 1000;

async function onNagrodaModal(interaction) {
  const [, , idStr] = interaction.customId.split(':');
  const list = q.poId.get(parseInt(idStr, 10));
  if (!list || list.status !== 'aktywny') {
    return interaction.reply({ ...karty.kartaOstrzezenie('List nieaktywny', 'Ten list gończy jest już zamknięty.'), flags: EPHEMERAL_V2 });
  }
  const nagroda = interaction.fields.getTextInputValue('nagroda').trim();
  const teraz = Date.now();
  for (const [t, o] of oczekujaceNagrody) if (teraz - o.czas > WAZNOSC_POTWIERDZENIA_MS) oczekujaceNagrody.delete(t);
  const token = `${teraz.toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  oczekujaceNagrody.set(token, { listId: list.id, userId: interaction.user.id, nagroda, czas: teraz });
  await interaction.reply({ ...karty.kartaPotwierdzeniaNagrody({ list, nagroda, token }), flags: EPHEMERAL_V2 });
}

async function onNagrodaPotwierdz(interaction) {
  const [, , token] = interaction.customId.split(':');
  const oczekujaca = oczekujaceNagrody.get(token);
  if (!oczekujaca || oczekujaca.userId !== interaction.user.id || Date.now() - oczekujaca.czas > WAZNOSC_POTWIERDZENIA_MS) {
    oczekujaceNagrody.delete(token);
    return interaction.update(karty.kartaOstrzezenie('Potwierdzenie wygasło', 'Kliknij „Dołóż nagrodę” na karcie listu jeszcze raz.'));
  }
  oczekujaceNagrody.delete(token);
  const list = q.poId.get(oczekujaca.listId);
  if (!list || list.status !== 'aktywny') {
    return interaction.update(karty.kartaOstrzezenie('List nieaktywny', 'Ten list gończy został już zamknięty — nagroda nie została dołożona.'));
  }
  if (q.nagrody.all(list.id).length >= MAX_DOLOZONYCH_NAGROD) {
    return interaction.update(karty.kartaOstrzezenie('Limit nagród', `Do listu dołożono już ${MAX_DOLOZONYCH_NAGROD} nagród.`));
  }
  q.dodajNagrode.run(list.id, interaction.user.id, oczekujaca.nagroda, Date.now());
  await aktualizujWiadomosc(interaction.client, list.id);
  await log(interaction.client, {
    tytul: 'Dołożono nagrodę do listu gończego',
    opis: `**List:** #${list.id} — \`${list.nick}\`\n**Nagroda:** ${oczekujaca.nagroda}\n**Dołożył:** <@${interaction.user.id}>`,
    kolor: kolory.info,
  });
  await interaction.update(karty.kartaSukces('Nagroda dołożona',
    `Do listu **#${list.id}** na \`${list.nick}\` dodano: **${oczekujaca.nagroda}**.\n-# Tej nagrody nie możesz już zmienić ani wycofać.`));
}

async function onNagrodaAnuluj(interaction) {
  const [, , token] = interaction.customId.split(':');
  oczekujaceNagrody.delete(token);
  await interaction.update(karty.kartaInfo({ tytul: 'Anulowano', opis: 'Nagroda nie została dołożona.' }));
}

// ---- Edycja dołożonych nagród --------------------------------------------
// Dołożenie jest nieodwracalne dla dokładającego - zmieniać/usuwać nagrody może tylko
// administracja i lider państwa wystawcy (np. przy pomyłce albo nadużyciu).

const BRAK_UPRAWNIEN_NAGROD = 'Dołożonej nagrody nie można zmienić ani wycofać. Poprawić ją może tylko administracja albo lider państwa, które wystawiło list.';

async function onNagrodyEdytuj(interaction) {
  const [, , idStr] = interaction.customId.split(':');
  const list = q.poId.get(parseInt(idStr, 10));
  if (!list || list.status !== 'aktywny') {
    return interaction.reply({ ...karty.kartaOstrzezenie('List nieaktywny', 'Ten list gończy jest już zamknięty.'), flags: EPHEMERAL_V2 });
  }
  if (!mozeZarzadzacListem(interaction.member, list)) {
    return interaction.reply({ ...karty.kartaBlad('Brak uprawnień', BRAK_UPRAWNIEN_NAGROD), flags: EPHEMERAL_V2 });
  }
  const nagrody = q.nagrody.all(list.id);
  if (!nagrody.length) {
    return interaction.reply({ ...karty.kartaOstrzezenie('Brak nagród', 'Do tego listu nikt nie dołożył nagrody.'), flags: EPHEMERAL_V2 });
  }
  const select = new StringSelectMenuBuilder()
    .setCustomId(`list:nagroda-wybor:${list.id}`)
    .setPlaceholder('Wybierz nagrodę do edycji')
    .addOptions(nagrody.slice(-25).map(n => new StringSelectMenuOptionBuilder()
      .setLabel(n.nagroda.slice(0, 100))
      .setValue(String(n.id))
      .setDescription(`Dołożył: ${(interaction.client.users.cache?.get(n.user_id)?.username || n.user_id)}`.slice(0, 100))));
  const c = karty.kontener(kolory.info);
  c.addTextDisplayComponents(karty.tekst(`## Edycja nagród — list #${list.id} (\`${list.nick}\`)`));
  c.addTextDisplayComponents(karty.tekst('-# Wybierz nagrodę. W formularzu zmień treść albo wyczyść pole, żeby ją usunąć.'));
  c.addActionRowComponents(new ActionRowBuilder().addComponents(select));
  await interaction.reply({ components: [c], flags: EPHEMERAL_V2 });
}

async function onNagrodaWybor(interaction) {
  const [, , idStr] = interaction.customId.split(':');
  const list = q.poId.get(parseInt(idStr, 10));
  const nagroda = q.nagrodaId.get(parseInt(interaction.values[0], 10));
  if (!list || list.status !== 'aktywny' || !nagroda || nagroda.list_id !== list.id) {
    return interaction.reply({ ...karty.kartaOstrzezenie('Nieaktualne', 'Ta nagroda albo list już nie istnieje.'), flags: EPHEMERAL_V2 });
  }
  if (!mozeZarzadzacListem(interaction.member, list)) {
    return interaction.reply({ ...karty.kartaBlad('Brak uprawnień', BRAK_UPRAWNIEN_NAGROD), flags: EPHEMERAL_V2 });
  }
  const modal = new ModalBuilder().setCustomId(`list:nagroda-edycja-modal:${nagroda.id}`).setTitle(`Edycja nagrody — ${list.nick}`.slice(0, 45));
  modal.addComponents(new ActionRowBuilder().addComponents(
    new TextInputBuilder().setCustomId('nagroda').setLabel('Nagroda (wyczyść pole, żeby usunąć)')
      .setStyle(TextInputStyle.Short).setMaxLength(100).setRequired(false).setValue(nagroda.nagroda.slice(0, 100))
  ));
  await interaction.showModal(modal);
}

async function onNagrodaEdycjaModal(interaction) {
  const [, , idStr] = interaction.customId.split(':');
  const nagroda = q.nagrodaId.get(parseInt(idStr, 10));
  const list = nagroda && q.poId.get(nagroda.list_id);
  if (!nagroda || !list || list.status !== 'aktywny') {
    return interaction.reply({ ...karty.kartaOstrzezenie('Nieaktualne', 'Ta nagroda albo list już nie istnieje.'), flags: EPHEMERAL_V2 });
  }
  if (!mozeZarzadzacListem(interaction.member, list)) {
    return interaction.reply({ ...karty.kartaBlad('Brak uprawnień', BRAK_UPRAWNIEN_NAGROD), flags: EPHEMERAL_V2 });
  }
  const nowa = interaction.fields.getTextInputValue('nagroda').trim();
  if (nowa === nagroda.nagroda) {
    return interaction.reply({ ...karty.kartaInfo({ tytul: 'Bez zmian', opis: 'Treść nagrody się nie zmieniła.' }), flags: EPHEMERAL_V2 });
  }
  if (nowa) q.zmienNagrode.run(nowa, nagroda.id);
  else q.usunNagrode.run(nagroda.id);
  await aktualizujWiadomosc(interaction.client, list.id);

  await log(interaction.client, {
    tytul: nowa ? 'Edytowano dołożoną nagrodę' : 'Usunięto dołożoną nagrodę',
    opis:
      `**List:** #${list.id} — \`${list.nick}\`\n**Dołożył:** <@${nagroda.user_id}>\n` +
      `**Zmienił:** <@${interaction.user.id}>${jestStaff(interaction.member) ? ' (administracja)' : ' (lider)'}\n\n` +
      `**Nagroda:**\n> ${nagroda.nagroda}\n→ ${nowa || '_usunięta_'}`,
    kolor: nowa ? kolory.info : kolory.ostrzezenie,
  });
  await interaction.reply({
    ...karty.kartaSukces(nowa ? 'Nagroda zmieniona' : 'Nagroda usunięta',
      nowa ? `**${nagroda.nagroda}** → **${nowa}**` : `Usunięto nagrodę **${nagroda.nagroda}** z listu #${list.id}.`),
    flags: EPHEMERAL_V2,
  });
}

// ---- Edycja listu (staff / lider państwa wystawcy) ----------------------

function pozostaloDni(list) {
  return list.wygasa ? Math.max(1, Math.ceil((list.wygasa - Date.now()) / DZIEN_MS)) : 0;
}

async function onEdytuj(interaction) {
  const [, , idStr] = interaction.customId.split(':');
  const list = q.poId.get(parseInt(idStr, 10));
  if (!list || list.status !== 'aktywny') {
    return interaction.reply({ ...karty.kartaOstrzezenie('List nieaktywny', 'Ten list gończy jest już zamknięty.'), flags: EPHEMERAL_V2 });
  }
  if (!mozeZarzadzacListem(interaction.member, list)) {
    return interaction.reply({ ...karty.kartaBlad('Brak uprawnień', BRAK_UPRAWNIEN_LISTU), flags: EPHEMERAL_V2 });
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
  if (!mozeZarzadzacListem(interaction.member, list)) {
    return interaction.reply({ ...karty.kartaBlad('Brak uprawnień', BRAK_UPRAWNIEN_LISTU), flags: EPHEMERAL_V2 });
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

  // Log edycji: każde zmienione pole w formie "przed → po"
  const zmiany = [];
  if (powod !== list.powod) zmiana(zmiany, 'Powód', list.powod, powod);
  if ((nagroda || null) !== (list.nagroda || null)) zmiana(zmiany, 'Nagroda główna', list.nagroda || 'brak', nagroda || 'brak');
  const staraWaznosc = opisWaznosci(list.wygasa);
  const nowaWaznosc = opisWaznosci(wygasa);
  // Ważność liczona od "teraz" zmienia się przy każdym zapisie - logujemy ją, gdy różni się o ponad minutę
  if (Boolean(list.wygasa) !== Boolean(wygasa) || Math.abs((list.wygasa || 0) - (wygasa || 0)) > 60 * 1000) {
    zmiana(zmiany, 'Ważność', staraWaznosc, nowaWaznosc);
  }
  await log(interaction.client, {
    tytul: 'Edytowano list gończy',
    opis:
      `**List:** #${list.id} — \`${list.nick}\`\n**Edytował:** <@${interaction.user.id}>${jestStaff(interaction.member) ? ' (administracja)' : ' (lider)'}\n\n` +
      (zmiany.length ? zmiany.join('\n\n') : '_Zapisano bez zmian._'),
    kolor: kolory.info,
  });
  await interaction.reply({
    ...karty.kartaSukces('List zaktualizowany', `List **#${list.id}** — ważność: **${dni === 0 ? 'bez limitu czasu' : `${dni} dni`}**.`),
    flags: EPHEMERAL_V2,
  });
}

// Po starcie: odświeżenie kart oczekujących zgłoszeń (np. dodanie przycisków z nowszej wersji bota)
async function odswiezKartyZgloszen(client) {
  const oczekujace = q.oczekujaceZKanalem.all();
  let odswiezone = 0;
  for (const zgloszenie of oczekujace) {
    const kanal = await client.channels.fetch(zgloszenie.kanal_id).catch(() => null);
    const wiad = kanal && await kanal.messages.fetch(zgloszenie.wiadomosc_id).catch(() => null);
    const payload = kartaZgloszeniaPoId(zgloszenie.id);
    if (!wiad || !payload) {
      console.warn(`[listy-goncze] nie znaleziono karty zgłoszenia #${zgloszenie.id} (kanał ${zgloszenie.kanal_id})`);
      continue;
    }
    const ok = await wiad.edit(payload).then(() => true).catch((e) => {
      console.warn(`[listy-goncze] nie udało się odświeżyć karty zgłoszenia #${zgloszenie.id}: ${e.message}`);
      return false;
    });
    if (ok) odswiezone++;
  }
  if (oczekujace.length) console.log(`[listy-goncze] odświeżono karty zgłoszeń zatrzymania: ${odswiezone}/${oczekujace.length}`);
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
  zarejestruj('list:zgl-dodaj', onDodajZglaszajacego);
  zarejestruj('list:zamknij', onZamknij);
  zarejestruj('list:nagroda', onNagroda);
  zarejestruj('list:nagroda-modal', onNagrodaModal);
  zarejestruj('list:nagroda-potw', onNagrodaPotwierdz);
  zarejestruj('list:nagroda-anuluj', onNagrodaAnuluj);
  zarejestruj('list:nagrody-edytuj', onNagrodyEdytuj);
  zarejestruj('list:nagroda-wybor', onNagrodaWybor);
  zarejestruj('list:nagroda-edycja-modal', onNagrodaEdycjaModal);
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
  odswiezKartyZgloszen,
  dodajZglaszajacegoNaKanale,
};
