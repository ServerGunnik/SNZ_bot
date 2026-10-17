// Anonimowe ankiety: bot trzyma głosy w bazie, pokazuje liczniki, nigdy nie zdradza kto na co głosował.
// Natywne ankiety Discorda (/ankieta anonimowa:false) obsługuje API Discorda, nie ten moduł.
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const db = require('../database/db.js');
const karty = require('../utils/karty.js');
const kolory = require('../utils/kolory.js');

const EPHEMERAL_V2 = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;
const INTERWAL_SPRAWDZANIA_MS = 30 * 1000; // Jak często skanujemy do zamknięcia (co 30 s)

const q = {
  utworz: db.prepare(`INSERT INTO ankiety (pytanie, opcje, wiele, kanal_id, autor_id, utworzono, konczy)
    VALUES (?, ?, ?, ?, ?, ?, ?)`),
  zapiszWiadomosc: db.prepare('UPDATE ankiety SET wiadomosc_id = ? WHERE id = ?'),
  poId: db.prepare('SELECT * FROM ankiety WHERE id = ?'),
  doZamkniecia: db.prepare('SELECT * FROM ankiety WHERE zamknieta = 0 AND konczy <= ?'),
  oznaczZamkniete: db.prepare('UPDATE ankiety SET zamknieta = 1 WHERE id = ?'),
  // Jeden wybór: wymuś pojedynczy głos usuwając poprzedni
  usunGlosyUsera: db.prepare('DELETE FROM ankiety_glosy WHERE ankieta_id = ? AND user_id = ?'),
  usunGlosNaOpcje: db.prepare('DELETE FROM ankiety_glosy WHERE ankieta_id = ? AND user_id = ? AND opcja_idx = ?'),
  czyGlosujeNa: db.prepare('SELECT 1 FROM ankiety_glosy WHERE ankieta_id = ? AND user_id = ? AND opcja_idx = ?'),
  dodajGlos: db.prepare('INSERT OR IGNORE INTO ankiety_glosy (ankieta_id, user_id, opcja_idx) VALUES (?, ?, ?)'),
  licznikiOpcji: db.prepare('SELECT opcja_idx, COUNT(*) as ile FROM ankiety_glosy WHERE ankieta_id = ? GROUP BY opcja_idx'),
  liczbaGlosujacych: db.prepare('SELECT COUNT(DISTINCT user_id) as ile FROM ankiety_glosy WHERE ankieta_id = ?'),
};

// Oznaczenia opcji (A-J, max 10). Discord renderuje je jako kolorowe kwadratowe litery.
const LITERY = ['🅰️', '🅱️', '🅲', '🅳', '🅴', '🅵', '🅶', '🅷', '🅸', '🅹'];
const DL_PASKA = 20;

function pasek(procent) {
  const pelne = Math.round((procent / 100) * DL_PASKA);
  return '▰'.repeat(pelne) + '▱'.repeat(DL_PASKA - pelne);
}

// Polska odmiana: 1 głos, 2-4 głosy, 5+ głosów (z wyjątkami 12-14)
function plural(n, formy) {
  if (n === 1) return formy[0];
  const o1 = n % 10;
  const o2 = n % 100;
  if (o1 >= 2 && o1 <= 4 && (o2 < 10 || o2 > 20)) return formy[1];
  return formy[2];
}

function kartaAnkiety(ankieta, { zamknieta = false } = {}) {
  const opcje = JSON.parse(ankieta.opcje);
  const liczniki = Object.fromEntries(q.licznikiOpcji.all(ankieta.id).map(r => [r.opcja_idx, r.ile]));
  const glosujacych = q.liczbaGlosujacych.get(ankieta.id).ile;
  const sumaGlosow = Object.values(liczniki).reduce((s, n) => s + n, 0);

  // Największa liczba głosów - do zaznaczenia zwycięzcy po zamknięciu
  const maxGlosow = Math.max(0, ...Object.values(liczniki));

  const linie = opcje.map((tekst, i) => {
    const g = liczniki[i] || 0;
    const procent = sumaGlosow ? Math.round((g / sumaGlosow) * 100) : 0;
    const prowadzi = zamknieta && g > 0 && g === maxGlosow;
    const nazwa = prowadzi ? `**${tekst}** 👑` : `**${tekst}**`;
    return `${LITERY[i]} ${nazwa}\n${pasek(procent)}  \`${g}\` (${procent}%)`;
  }).join('\n\n');

  const czas = Math.floor(ankieta.konczy / 1000);
  const tryb = ankieta.wiele ? 'wielokrotny wybór' : 'pojedynczy wybór';
  const metaCzas = zamknieta ? `zakończona <t:${czas}:R>` : `kończy się <t:${czas}:R>`;
  const laczne = `**Łącznie:** ${sumaGlosow} ${plural(sumaGlosow, ['głos', 'głosy', 'głosów'])} · ${glosujacych} ${plural(glosujacych, ['osoba', 'osoby', 'osób'])}`;

  const opis =
    `-# Utworzone przez <@${ankieta.autor_id}> · ${tryb} · anonimowa · ${metaCzas}\n\n` +
    `${linie}\n\n` +
    laczne +
    (zamknieta ? '\n\n-# ✓ Ankieta zakończona.' : '');

  const payload = karty.kartaInfo({
    tytul: `📊 ${ankieta.pytanie}`,
    opis,
    kolor: zamknieta ? kolory.neutralny : kolory.info,
  });

  if (!zamknieta) {
    // Przyciski z literowym emoji - czysty label (bez numeru), żeby pasowało do liter nad opcjami
    const przyciski = opcje.map((tekst, i) => new ButtonBuilder()
      .setCustomId(`ankieta:glos:${ankieta.id}:${i}`)
      .setLabel(tekst.slice(0, 80))
      .setEmoji(LITERY[i])
      .setStyle(ButtonStyle.Secondary));
    for (let i = 0; i < przyciski.length; i += 5) {
      payload.components[0].addActionRowComponents(
        new ActionRowBuilder().addComponents(...przyciski.slice(i, i + 5))
      );
    }
  }
  return payload;
}

async function utworzAnkiete(interaction, { pytanie, opcje, godziny, wiele }) {
  const utworzono = Date.now();
  const konczy = utworzono + godziny * 60 * 60 * 1000;
  const info = q.utworz.run(pytanie, JSON.stringify(opcje), wiele ? 1 : 0, interaction.channel.id, interaction.user.id, utworzono, konczy);
  const ankieta = q.poId.get(info.lastInsertRowid);

  const wiadomosc = await interaction.channel.send(kartaAnkiety(ankieta)).catch(e => ({ blad: e.message }));
  if (wiadomosc?.blad) {
    q.oznaczZamkniete.run(ankieta.id); // posprzątaj, nie bedziemy pokazywać
    return { blad: wiadomosc.blad };
  }
  q.zapiszWiadomosc.run(wiadomosc.id, ankieta.id);
  return { ankieta, wiadomosc };
}

async function onGlos(interaction) {
  const [, , idStr, opcjaStr] = interaction.customId.split(':');
  const ankietaId = parseInt(idStr, 10);
  const opcjaIdx = parseInt(opcjaStr, 10);
  const ankieta = q.poId.get(ankietaId);

  if (!ankieta || ankieta.zamknieta) {
    return interaction.reply({ ...karty.kartaOstrzezenie('Ankieta zakończona', 'To głosowanie już się skończyło.'), flags: EPHEMERAL_V2 });
  }
  if (Date.now() > ankieta.konczy) {
    return interaction.reply({ ...karty.kartaOstrzezenie('Ankieta zakończona', 'Czas minął. Wyniki zaraz będą zaktualizowane.'), flags: EPHEMERAL_V2 });
  }

  if (ankieta.wiele) {
    // Toggle głosu na tę opcję
    const juz = q.czyGlosujeNa.get(ankietaId, interaction.user.id, opcjaIdx);
    if (juz) {
      q.usunGlosNaOpcje.run(ankietaId, interaction.user.id, opcjaIdx);
    } else {
      q.dodajGlos.run(ankietaId, interaction.user.id, opcjaIdx);
    }
  } else {
    // Jeden wybór: usuń poprzednie głosy użytkownika, dodaj nowy
    q.usunGlosyUsera.run(ankietaId, interaction.user.id);
    q.dodajGlos.run(ankietaId, interaction.user.id, opcjaIdx);
  }

  // Odśwież wiadomość z aktualnymi licznikami i poinformuj ephemeralnie
  await interaction.update(kartaAnkiety(ankieta)).catch(() => null);
}

async function zamknijAnkiete(client, ankieta) {
  if (ankieta.zamknieta) return;
  q.oznaczZamkniete.run(ankieta.id);
  if (!ankieta.wiadomosc_id) return;
  const kanal = await client.channels.fetch(ankieta.kanal_id).catch(() => null);
  if (!kanal) return;
  const wiad = await kanal.messages.fetch(ankieta.wiadomosc_id).catch(() => null);
  if (!wiad) return;
  await wiad.edit(kartaAnkiety(ankieta, { zamknieta: true })).catch(() => null);
}

async function sprawdzZamykane(client) {
  const teraz = Date.now();
  for (const ankieta of q.doZamkniecia.all(teraz)) {
    await zamknijAnkiete(client, ankieta).catch(() => null);
  }
}

function uruchomCyklZamykania(client) {
  sprawdzZamykane(client).catch(() => null);
  setInterval(() => sprawdzZamykane(client).catch(() => null), INTERWAL_SPRAWDZANIA_MS);
}

function rejestruj({ zarejestruj }) {
  zarejestruj('ankieta:glos', onGlos);
}

module.exports = { rejestruj, utworzAnkiete, uruchomCyklZamykania };
