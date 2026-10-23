# SNZ_bot — zasady dla zmian w kodzie

- Każda zmiana działania bota (nowa funkcja, poprawka, zmiana komendy) wymaga nowego wpisu na końcu
  `aktualizacje.json`: `id` (unikalne, np. `RRRR-MM-DD-krotka-nazwa`), `data` (`RRRR-MM-DD`), `tytul`,
  `dodano` (lista), `naprawiono` (lista), `opis`. Bot publikuje go na kanale update-log przy starcie.
  Pisz dla graczy i administracji, po polsku, bez szczegółów technicznych.
- Przed commitem uruchom `npm test` — sprawdza m.in. formularze, karty i poprawność `aktualizacje.json`.
- Teksty dla użytkowników są po polsku; komentarze w kodzie też.
