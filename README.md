# Bot Discord — Sojusz Narodów Zjednoczonych

Kompletny bot dla serwera Minecraft SNZ. Discord.js v14 + Components V2, SQLite (better-sqlite3), teksty PL.

## Wymagania

- Node.js **18.17+** (zalecane 20 LTS)
- Uprawnienia bota na serwerze: `Manage Roles`, `Manage Channels`, `Move Members`, `Send Messages`, `Manage Messages`, `Read Message History`, `Attach Files`, `Ban Members`, `Kick Members`, `Moderate Members`, `View Audit Log`
- Rola bota ustawiona **jak najwyżej** w hierarchii (antynuke nie ukarze osoby z wyższą rolą niż bot)
- **Privileged Gateway Intents** włączone w [Discord Developer Portal](https://discord.com/developers/applications) → aplikacja → zakładka **Bot**:
  - **SERVER MEMBERS INTENT**
  - **MESSAGE CONTENT INTENT**

  Bez tego bot nie wystartuje i w konsoli pojawi się `Error: Used disallowed intents`.

## Konfiguracja

1. Zainstaluj zależności:
   ```
   npm install
   ```
2. Skopiuj `.env.example` do `.env` i uzupełnij wszystkie ID kanałów, ról oraz token bota.
3. Utwórz na serwerze role: **Zweryfikowany**, **Staff**, **Lider**, **Sędzia** i wklej ich ID do `.env`.
4. Utwórz kanały wymienione w `.env` (logi, weryfikacja, ticket, listy-gończe, wyroki, mod-call, poczekalnia + 3 pomoce) oraz dwie kategorie: dla ticketów i dla spraw.

## Uruchomienie

1. Rejestracja komend guildowych (jednorazowo lub przy dodaniu nowej komendy):
   ```
   npm run deploy
   ```
2. Start bota:
   ```
   npm start
   ```

## Komendy

### Staff
- `/panel-weryfikacji` — wystawia panel weryfikacji w bieżącym kanale.
- `/panel-ticket` — wystawia panel ticketów.
- `/selfrole grupa-utworz|grupa-usun|grupa-lista|rola-dodaj|rola-usun|wystaw` — pełne zarządzanie selfrole.
- `/panstwo utworz|zmien-lidera|limit|rozwiaz|lista` — państwa i liderzy (rola nadawana/odbierana automatycznie).
- `/list-gonczy-admin zatwierdz|odrzuc|zamknij` — zatwierdzanie i zamykanie listów.
- `/sprawa-zamknij` — zamknięcie sprawy sądowej (z transkryptem).
- `/warn`, `/warny`, `/usun-warn` — moderacja.
- `/antynuke status|whitelist-lista|raid` — stan ochrony, whitelista, ręczny tryb anty-raid.
- `/antynuke whitelist-dodaj|whitelist-usun` — tylko właściciel serwera.

### Liderzy (rola „Lider")
- `/sojusz` — panel państwa (dodaj/usuń nick, paginacja).
- `/list-gonczy` — złożenie listu (do zatwierdzenia przez staff).
- `/pozew` — pozew do Sądu Sojuszniczego.

### Wszyscy
- `/warny <user>` — własna historia (staff widzi wszystkich).
- Panele: weryfikacja, tickety, selfrole (przyciski/selecty).

## Moduły

- **Weryfikacja**: przycisk → modal z nickiem MC → walidacja + unikalność → rola + nick.
- **Tickety**: kategorie, limit otwartych, przejmowanie przez staff, **zamknięcie wymaga wpisania wyjaśnienia** (jak rozwiązano sprawę — trafia do kanału, logu, transkryptu i DM autora), transkrypt po zamknięciu, ocena 1–5 w DM.
- **Selfrole**: grupy w bazie, tryb single/multi, panel wystawiany na dowolnym kanale.
- **Wołanie moderatora**: wejście na „Poczekalnię" pinguje staff, po przyjęciu bot przenosi wołającego i staffa na wolny kanał Pomoc 1-3, log czasu oczekiwania, cykliczne przypomnienia.
- **Państwa + `/sojusz`**: staff tworzy państwo i nadaje lidera (rola automatyczna), lider zarządza tylko swoim państwem (paginacja, dodaj/usuń), nick unikalny globalnie, limit członków.
- **Listy gończe**: głowa skina z `mc-heads.net`, statusy `oczekuje/aktywny/zrealizowany/wygasly/odrzucony`, zgłoszenia zatrzymania (modal z dowodem) rozpatrywane przez staff, wygasanie sprawdzane co godzinę.
- **Sąd sojuszniczy**: `/pozew` tworzy prywatny kanał ze sprawą (numer `SNZ-YYYY-NNNN`), staff przyjmuje sprawę (max jedna aktywna na sędziego, blokada dla stron sprawy i poprzedniego sędziego przy odwołaniu), rola „Sędzia" nadawana/odbierana automatycznie, publikacja wyroku w kanale wyroków, opcjonalny automatyczny list gończy na skazanego, transkrypt po zamknięciu.
- **Ostrzeżenia**: `/warn`, `/warny`, `/usun-warn`, konfigurowalne progi (auto-mute i auto-ban).
- **Antynuke**: na podstawie dziennika zdarzeń wykrywa masowe banowanie, wyrzucanie, usuwanie i spamowanie kanałów oraz usuwanie ról (progi w `config.js` → `antynuke`). Sprawca spoza whitelisty traci role / jest wyrzucany / banowany (`ANTYNUKE_KARA`), a szkody są cofane: odbanowanie ofiar, odtworzenie usuniętych kanałów i ról, usunięcie spamowanych kanałów. Boty dodane przez osoby spoza whitelisty są wyrzucane.
- **Anty-raid**: masowe wbijanie (domyślnie 8 dołączeń w 15 s) włącza tryb ochrony na 10 min — młode konta z fali i każdy kolejny nowy członek są wyrzucani (z DM). Ręcznie: `/antynuke raid`.

## Struktura projektu

```
config.js              — cała konfiguracja (kolory, ID, limity)
index.js               — entrypoint
deploy-commands.js     — rejestracja slash commands
database/
  db.js schema.sql     — SQLite (WAL, FK on)
handlers/              — loadery komend, eventów, komponentów
events/                — clientReady, interactionCreate, voiceStateUpdate, guildMemberAdd,
                         guildAuditLogEntryCreate, channelDelete, roleDelete (antynuke)
commands/              — pliki slash commands
modules/               — logika biznesowa + rejestracja customId → handler
utils/
  karty.js             — WSZYSTKIE buildery Components V2
  kolory.js            — semantyczne kolory (sukces/ostrzeżenie/błąd/neutralny)
  uprawnienia.js       — check ról
  logger.js            — kanały logów (karty V2)
  minecraft.js         — nick regex + URL głowy skina
  paginacja.js         — proste stronicowanie tablic
  transkrypt.js        — TXT z historią kanału
```

## Uwagi implementacyjne

- **Components V2**: każda wiadomość bota (panele, karty, ephemerale) używa `MessageFlags.IsComponentsV2`, kart z `ContainerBuilder` i tekstów przez `TextDisplayBuilder`. Nie używa się `content` ani `embeds`.
- **Persistent buttons**: `customId` ma prefiks (np. `panstwo:str:12:3`); dispatcher w `handlers/componentHandler.js` znajduje handler po najdłuższym pasującym prefiksie. Nowy moduł rejestruje swoje handlery w funkcji `rejestruj({ zarejestruj })`.
- **Kolory**: wyłącznie z `utils/kolory.js`; nie hardkoduj wartości w modułach.
- **Uprawnienia**: sprawdzane po rolach z `.env`, wszystkie ID konfigurowalne.
- **Odporność**: brak `crash` przy usuniętych rolach/kanałach — użyto `.catch(() => null)` przy fetch.
- **Wydajność**: `deferReply` tylko przy operacjach dłuższych (tworzenie kanałów, transkrypty); pozostałe akcje odpowiadają natychmiast.

## Rozwój

Nowy moduł:
1. Dodaj plik w `modules/nazwa.js` z eksportem `rejestruj({ zarejestruj })`.
2. Rejestruj handlery na prefiksy `customId`.
3. Dodaj komendy w `commands/`, uruchom `npm run deploy`.
4. Buildery kart trzymaj w `utils/karty.js`.
# SNZ_bot
