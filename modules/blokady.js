// Globalne blokady typów treści (gify, obrazki, załączniki, linki) - działa na wszystkich kanałach.
// Ustawiane komendą /blok, trzymane w DB (automod_blokady) żeby przetrwać restart bez edycji .env.
const db = require('../database/db.js');

const q = {
  wszystkie: db.prepare('SELECT typ, aktywna FROM automod_blokady'),
  ustaw: db.prepare(`INSERT INTO automod_blokady (typ, aktywna, ustawil, data) VALUES (?, ?, ?, ?)
    ON CONFLICT(typ) DO UPDATE SET aktywna = excluded.aktywna, ustawil = excluded.ustawil, data = excluded.data`),
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

function zaladujZDb() {
  cache.clear();
  for (const w of q.wszystkie.all()) cache.set(w.typ, Boolean(w.aktywna));
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
};
