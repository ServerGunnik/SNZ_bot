// Globalne blokady typów treści (gify, obrazki, załączniki, linki) - działa na wszystkich kanałach.
// Ustawiane komendą /blok, trzymane w DB (automod_blokady) żeby przetrwać restart bez edycji .env.
const db = require('../database/db.js');

const q = {
  wszystkie: db.prepare('SELECT typ, aktywna FROM automod_blokady'),
  ustaw: db.prepare(`INSERT INTO automod_blokady (typ, aktywna, ustawil, data) VALUES (?, ?, ?, ?)
    ON CONFLICT(typ) DO UPDATE SET aktywna = excluded.aktywna, ustawil = excluded.ustawil, data = excluded.data`),
  wszystkieFiltry: db.prepare('SELECT * FROM automod_filtry ORDER BY id'),
  dodajFiltr: db.prepare('INSERT INTO automod_filtry (typ, tresc, dodal, data) VALUES (?, ?, ?, ?)'),
  usunFiltr: db.prepare('DELETE FROM automod_filtry WHERE id = ?'),
  filtrPoId: db.prepare('SELECT * FROM automod_filtry WHERE id = ?'),
};

// Dostępne typy + opisy (do UI komend i decyzji w automodzie)
const TYPY = {
  obrazki: { label: 'obrazki (PNG/JPG/WEBP w załącznikach)', emoji: '🖼️' },
  gify: { label: 'GIF-y (załączniki .gif i linki Tenor/Giphy)', emoji: '🎞️' },
  zalaczniki: { label: 'wszystkie załączniki (pliki/obrazki/video)', emoji: '📎' },
  linki: { label: 'linki (http/https)', emoji: '🔗' },
  video: { label: 'video (załączniki video + YouTube/Twitch)', emoji: '📹' },
};

// Cache w pamięci dla szybkich sprawdzeń przy KAŻDEJ wiadomości - DB tylko przy zapisie/starcie
const cache = new Map();
// Filtry tekstowe: [{ id, typ: 'slowo'|'fraza'|'regex', tresc, regex (skompilowane) }]
let filtry = [];

function kompilujFiltr(f) {
  if (f.typ === 'slowo') {
    // Match jako całe słowo, case-insensitive. Dla znaków niealfanumerycznych granica \b nie zadziała,
    // więc fallback na substring. Escape metacharacters.
    const esc = f.tresc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return { ...f, regex: new RegExp(`\\b${esc}\\b`, 'i') };
  }
  if (f.typ === 'fraza') {
    const esc = f.tresc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return { ...f, regex: new RegExp(esc, 'i') };
  }
  if (f.typ === 'regex') {
    try {
      return { ...f, regex: new RegExp(f.tresc, 'i') };
    } catch {
      return { ...f, regex: null };
    }
  }
  return { ...f, regex: null };
}

function zaladujZDb() {
  cache.clear();
  for (const w of q.wszystkie.all()) cache.set(w.typ, Boolean(w.aktywna));
  filtry = q.wszystkieFiltry.all().map(kompilujFiltr);
}

function czyAktywna(typ) {
  return cache.get(typ) === true;
}

function ustawStan(typ, aktywna, ustawilId) {
  q.ustaw.run(typ, aktywna ? 1 : 0, ustawilId, Date.now());
  cache.set(typ, Boolean(aktywna));
}

function listaStanow() {
  return Object.keys(TYPY).map(typ => ({ typ, label: TYPY[typ].label, emoji: TYPY[typ].emoji, aktywna: czyAktywna(typ) }));
}

// --- Detekcja typu treści w wiadomości ---

const REGEX_LINK = /https?:\/\/[^\s]+/i;
const REGEX_TENOR_GIPHY = /https?:\/\/(?:[\w-]+\.)?(tenor\.com|giphy\.com)\/\S+/i;
const REGEX_VIDEO_LINK = /https?:\/\/(?:[\w-]+\.)?(youtube\.com|youtu\.be|twitch\.tv)\/\S+/i;

function typyWykryteWWiadomosci(wiadomosc) {
  const znalezione = new Set();
  const tresc = wiadomosc.content || '';

  if (REGEX_LINK.test(tresc)) znalezione.add('linki');
  if (REGEX_TENOR_GIPHY.test(tresc)) znalezione.add('gify');
  if (REGEX_VIDEO_LINK.test(tresc)) znalezione.add('video');

  for (const z of wiadomosc.attachments?.values() || []) {
    const nazwa = (z.name || '').toLowerCase();
    const typ = (z.contentType || '').toLowerCase();
    znalezione.add('zalaczniki');
    if (typ.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(nazwa)) znalezione.add('obrazki');
    if (typ === 'image/gif' || /\.gif$/i.test(nazwa)) znalezione.add('gify');
    if (typ.startsWith('video/') || /\.(mp4|mov|webm|mkv)$/i.test(nazwa)) znalezione.add('video');
  }

  // Discord embed sticker/gif z Tenora też idzie przez embed, nie attachment - łapiemy linkiem powyżej
  return znalezione;
}

// Zwraca pierwszy aktywny typ pasujący do wiadomości (do komunikatu dla usera) albo null
function sprawdzNaruszenie(wiadomosc) {
  const wykryte = typyWykryteWWiadomosci(wiadomosc);
  for (const t of wykryte) if (czyAktywna(t)) return t;
  return null;
}

// Sprawdza wiadomość przeciwko filtrom tekstowym. Zwraca pierwszy pasujący filtr albo null.
function sprawdzFiltry(wiadomosc) {
  const tresc = wiadomosc.content || '';
  if (!tresc) return null;
  for (const f of filtry) {
    if (f.regex && f.regex.test(tresc)) return f;
  }
  return null;
}

function dodajFiltr(typ, tresc, dodalId) {
  const info = q.dodajFiltr.run(typ, tresc, dodalId, Date.now());
  filtry.push(kompilujFiltr({ id: info.lastInsertRowid, typ, tresc, dodal: dodalId, data: Date.now() }));
  return info.lastInsertRowid;
}

function usunFiltr(id) {
  const info = q.usunFiltr.run(id);
  if (info.changes > 0) {
    filtry = filtry.filter(f => f.id !== id);
    return true;
  }
  return false;
}

function filtrPoId(id) {
  return q.filtrPoId.get(id);
}

function listaFiltrow() {
  return filtry.map(f => ({ id: f.id, typ: f.typ, tresc: f.tresc, dodal: f.dodal, data: f.data }));
}

function etykietaTypu(typ) {
  return TYPY[typ]?.label || typ;
}

function emojiTypu(typ) {
  return TYPY[typ]?.emoji || '🚫';
}

function dostepneTypy() {
  return Object.keys(TYPY);
}

function uruchomBlokady() {
  zaladujZDb();
}

function rejestruj() {}

module.exports = {
  rejestruj, uruchomBlokady,
  czyAktywna, ustawStan, listaStanow, sprawdzNaruszenie, dostepneTypy,
  etykietaTypu, emojiTypu,
  sprawdzFiltry, dodajFiltr, usunFiltr, filtrPoId, listaFiltrow,
};
