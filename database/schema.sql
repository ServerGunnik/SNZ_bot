-- WERYFIKACJA
CREATE TABLE IF NOT EXISTS weryfikacja (
  user_id TEXT PRIMARY KEY,
  nick TEXT NOT NULL UNIQUE COLLATE NOCASE,
  data INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_weryfikacja_nick ON weryfikacja(nick COLLATE NOCASE);

-- TICKETY
CREATE TABLE IF NOT EXISTS tickety (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kanal_id TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL,
  kategoria TEXT NOT NULL,
  przydzielony TEXT,
  status TEXT NOT NULL DEFAULT 'otwarty', -- otwarty, zamkniety
  otwarty INTEGER NOT NULL,
  zamkniety INTEGER,
  zamknal TEXT,
  wyjasnienie TEXT,
  temat TEXT,
  opis TEXT,
  wiadomosc_id TEXT,
  ocena INTEGER
);
CREATE INDEX IF NOT EXISTS idx_tickety_user ON tickety(user_id, status);

-- Notatki staffu w ticketach (niewidoczne dla gracza)
CREATE TABLE IF NOT EXISTS tickety_notatki (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL,
  autor_id TEXT NOT NULL,
  tresc TEXT NOT NULL,
  data INTEGER NOT NULL,
  FOREIGN KEY(ticket_id) REFERENCES tickety(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_tickety_notatki ON tickety_notatki(ticket_id);

-- SELFROLE
CREATE TABLE IF NOT EXISTS selfrole_grupy (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nazwa TEXT NOT NULL,
  opis TEXT,
  tryb TEXT NOT NULL DEFAULT 'multi', -- 'single' | 'multi'
  kanal_id TEXT,
  wiadomosc_id TEXT
);
CREATE TABLE IF NOT EXISTS selfrole_role (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  grupa_id INTEGER NOT NULL,
  role_id TEXT NOT NULL,
  etykieta TEXT NOT NULL,
  opis TEXT,
  emoji TEXT,
  FOREIGN KEY(grupa_id) REFERENCES selfrole_grupy(id) ON DELETE CASCADE
);

-- PAŃSTWA
CREATE TABLE IF NOT EXISTS panstwa (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nazwa TEXT NOT NULL UNIQUE COLLATE NOCASE,
  lider_id TEXT,
  limit_czlonkow INTEGER NOT NULL DEFAULT 20,
  utworzone INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_panstwa_lider ON panstwa(lider_id);

CREATE TABLE IF NOT EXISTS panstwa_czlonkowie (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  panstwo_id INTEGER NOT NULL,
  nick TEXT NOT NULL COLLATE NOCASE,
  dodany INTEGER NOT NULL,
  dodany_przez TEXT,
  UNIQUE(nick COLLATE NOCASE),
  FOREIGN KEY(panstwo_id) REFERENCES panstwa(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_czlonkowie_panstwo ON panstwa_czlonkowie(panstwo_id);

-- LISTY GOŃCZE
CREATE TABLE IF NOT EXISTS listy_goncze (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nick TEXT NOT NULL COLLATE NOCASE,
  powod TEXT NOT NULL,
  nagroda TEXT,
  wystawca_id TEXT NOT NULL,
  wystawca_panstwo_id INTEGER,
  status TEXT NOT NULL DEFAULT 'oczekuje', -- oczekuje, aktywny, zrealizowany, wygasly, odrzucony
  wygasa INTEGER,
  wiadomosc_id TEXT,
  kanal_id TEXT,
  utworzony INTEGER NOT NULL,
  zamkniety INTEGER,
  zamkniety_przez TEXT
);
CREATE INDEX IF NOT EXISTS idx_listy_nick ON listy_goncze(nick COLLATE NOCASE, status);
CREATE INDEX IF NOT EXISTS idx_listy_status ON listy_goncze(status);

CREATE TABLE IF NOT EXISTS listy_zgloszenia (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  list_id INTEGER NOT NULL,
  zglaszajacy_id TEXT NOT NULL,
  dowod TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'oczekuje', -- oczekuje, zatwierdzone, odrzucone
  utworzone INTEGER NOT NULL,
  rozpatrzone INTEGER,
  rozpatrzyl TEXT,
  FOREIGN KEY(list_id) REFERENCES listy_goncze(id) ON DELETE CASCADE
);

-- SĄD
CREATE TABLE IF NOT EXISTS sprawy (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  numer TEXT NOT NULL UNIQUE,
  pozywajacy_id TEXT NOT NULL,
  pozwany_typ TEXT NOT NULL, -- 'nick' | 'panstwo'
  pozwany_wartosc TEXT NOT NULL,
  zarzut TEXT NOT NULL,
  opis TEXT NOT NULL,
  dowody TEXT,
  kanal_id TEXT,
  wiadomosc_id TEXT,
  sedzia_id TEXT,
  poprzedni_sedzia TEXT,
  status TEXT NOT NULL DEFAULT 'zlozona', -- zlozona, przyjeta, w_toku, wyrok, odwolanie, zamknieta
  werdykt TEXT,
  kara TEXT,
  odwolanie INTEGER DEFAULT 0,
  utworzona INTEGER NOT NULL,
  wyrok_data INTEGER,
  zamknieta INTEGER
);
CREATE INDEX IF NOT EXISTS idx_sprawy_sedzia ON sprawy(sedzia_id, status);
CREATE INDEX IF NOT EXISTS idx_sprawy_status ON sprawy(status);

CREATE TABLE IF NOT EXISTS sprawy_dowody (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sprawa_id INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  tresc TEXT NOT NULL,
  data INTEGER NOT NULL,
  FOREIGN KEY(sprawa_id) REFERENCES sprawy(id) ON DELETE CASCADE
);

-- OSTRZEŻENIA
CREATE TABLE IF NOT EXISTS ostrzezenia (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  powod TEXT NOT NULL,
  wystawca_id TEXT NOT NULL,
  data INTEGER NOT NULL,
  sprawa_id INTEGER
);
CREATE INDEX IF NOT EXISTS idx_ostrzezenia_user ON ostrzezenia(user_id);

-- WOŁANIE MODA
CREATE TABLE IF NOT EXISTS mod_call (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  kanal_id TEXT NOT NULL,
  wiadomosc_id TEXT,
  status TEXT NOT NULL DEFAULT 'oczekuje', -- oczekuje, przyjete, anulowane
  utworzone INTEGER NOT NULL,
  przyjete INTEGER,
  przyjmujacy TEXT,
  liczba_pingow INTEGER DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_modcall_user ON mod_call(user_id, status);

-- ANTYNUKE
CREATE TABLE IF NOT EXISTS antynuke_whitelist (
  user_id TEXT PRIMARY KEY,
  dodal TEXT NOT NULL,
  data INTEGER NOT NULL
);
