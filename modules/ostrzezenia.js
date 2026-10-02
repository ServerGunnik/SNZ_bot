// Ostrzeżenia obsługiwane komendami (/warn, /warny, /usun-warn).
// Do progów wyciszenia/bana liczą się tylko aktywne ostrzeżenia: niewygasłe i (opcjonalnie) bez wyroków sądu.
const db = require('../database/db.js');
const config = require('../config.js');

const DZIEN_MS = 24 * 60 * 60 * 1000;
const q = { uzytkownika: db.prepare('SELECT * FROM ostrzezenia WHERE user_id = ? ORDER BY data DESC') };

function czyAktywne(warn, teraz = Date.now()) {
  const { waznoscDni, liczWyrokiSadu } = config.ostrzezenia;
  if (waznoscDni > 0 && warn.data < teraz - waznoscDni * DZIEN_MS) return false;
  if (warn.sprawa_id && !liczWyrokiSadu) return false;
  return true;
}

// Dlaczego ostrzeżenie nie liczy się do progów (null = liczy się)
function powodNieaktywnosci(warn) {
  if (czyAktywne(warn)) return null;
  if (warn.sprawa_id && !config.ostrzezenia.liczWyrokiSadu) return 'wyrok sądu';
  return 'wygasło';
}

function ostrzezeniaUzytkownika(userId) {
  return q.uzytkownika.all(userId);
}

function liczAktywne(userId) {
  return ostrzezeniaUzytkownika(userId).filter(w => czyAktywne(w)).length;
}

function rejestruj() {}

module.exports = { rejestruj, czyAktywne, powodNieaktywnosci, ostrzezeniaUzytkownika, liczAktywne };
