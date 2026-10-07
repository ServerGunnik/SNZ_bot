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
3. Utwórz na serwerze role: **Zweryfikowany**, **Staff**, **Lider**, **Sędzia** i wklej ich ID do `.env`. Każde `ROLA_*` może być listą ID po przecinku (np. `ROLA_STAFF=111,222`): do uprawnień wystarczy dowolna z nich, a role nadawane przez bota (zweryfikowany, lider, sędzia) są nadawane wszystkie. `ROLA_ZAMYKACZ_TICKETU` — role, które mogą zamknąć dowolny ticket.
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
3. Test bez łączenia z Discordem (ładowanie, komendy, limity formularzy, kluczowe przepływy) — uruchamia się też automatycznie na GitHubie przy każdym PR:
   ```
   npm test
   ```

Kopie zapasowe bazy zapisują się automatycznie w `database/kopie/` (przy starcie i co 24 h, zostaje 14 najnowszych). Żeby przywrócić kopię: zatrzymaj bota, skopiuj wybrany plik jako `database/snz.db` i uruchom bota ponownie.

## Komendy

### Staff
- `/panel-weryfikacji` — wystawia panel weryfikacji w bieżącym kanale.
- `/panel-ticket` — wystawia panel ticketów.
- `/selfrole grupa-utworz|grupa-usun|grupa-lista|rola-dodaj|rola-usun|wystaw` — pełne zarządzanie selfrole.
- `/panstwo utworz|zmien-lidera|limit|sojusznik|rozwiaz|lista` — państwa i liderzy (rola nadawana/odbierana automatycznie), `sojusznik` ustawia pole `allay` w configu moda.
- `/list-gonczy-admin zatwierdz|odrzuc|zamknij` — zatwierdzanie i zamykanie listów.
- `/sprawa-zamknij` — zamknięcie sprawy sądowej (z transkryptem); po wyroku można też użyć przycisku „Zamknij sprawę” na karcie.
- `/clear <ile> [użytkownik]` — usuwa do 100 ostatnich wiadomości (młodszych niż 14 dni, bez przypiętych); nie działa na kanałach logów.
- `/sprawa-sedzia <numer> <sędzia>` — **tylko właściciel serwera albo technik**: awaryjna zmiana sędziego (np. gdy sędzia odszedł z serwera).
- `/warn`, `/warny`, `/usun-warn` — moderacja.
- `/historia-ticketow <gracz>` — historia zgłoszeń gracza z linkami do wpisów w historii.
- `/statystyki-ticketow [dni]` — liczba zgłoszeń, kategorie, wyniki, średni czas obsługi i ocena, ranking administracji.
- `/ticket dodaj|usun <osoba>` — dodanie/usunięcie osoby z bieżącego ticketu.
- `/zatrzymanie dodaj-zglaszajacego` — na kanale zgłoszenia zatrzymania wpuszcza zgłaszającego (to samo co przycisk na karcie).
- `/antynuke status|whitelist-lista|raid` — stan ochrony, whitelista, ręczny tryb anty-raid.
- `/antynuke whitelist-dodaj|whitelist-usun` — tylko właściciel serwera albo technik.
- `/bot-uprawnienia lista` — boty objęte blokadą uprawnień; `przywroc` / `zablokuj` — tylko właściciel serwera.
- `/przywroc-role <osoba>` — właściciel / technik: przywraca role odebrane za usunięcie logu i zdejmuje wyciszenie.

### Liderzy (rola „Lider")
- `/sojusz` — panel państwa dla króla (dodaj/usuń nick, zmień status Zastępca/Członek, paginacja). Tylko król może zarządzać składem.
- `/list-gonczy` — złożenie listu (do zatwierdzenia przez staff); `waznosc-dni: 0` = bez limitu czasu. Na karcie listu: **Dołóż nagrodę** (każdy), **Edytuj** i **Zamknij list** (administracja oraz lider państwa, które wystawiło list — powód, nagroda, ważność, 0 = bez limitu). Dołożenie nagrody wymaga potwierdzenia i jest **nieodwracalne** — dokładający nie może jej potem zmienić ani wycofać. Przycisk **Edytuj nagrody** (zmiana lub usunięcie dołożonej nagrody) działa tylko dla administracji i lidera państwa wystawcy. Każda edycja trafia do logów jako „przed → po”.

### Wszyscy
- `/pozew` — pozew do Sądu Sojuszniczego przeciw graczowi (wybór **konta Discord**) albo państwu; jeden pozew na dobę (`config.js` → `pozew`).
- `/listy-goncze` — przegląd aktywnych i zakończonych listów gończych (administracja widzi też oczekujące).
- `/sojusz-lista` — lista państw i ich graczy (król, zastępcy, członkowie) + przycisk **Config dla moda** (plik `snz-sojusz.json`).
- `/warny <user>` — własna historia (staff widzi wszystkich).
- Panele: weryfikacja, tickety (przyciski kategorii), selfrole.

## Moduły

- **Weryfikacja**: przycisk → modal z nickiem MC → walidacja + unikalność → rola + nick.
- **Tickety**: kategorie **Prośba o rangę / Pomoc ogólna / Zgłoszenie szpiega / Wystawienie listu gończego** (w `config.js` → `tickety.kategorie`). Przed otwarciem kanału gracz wypełnia formularz danej kategorii (nick, powód, dowody…), który jest pokazany na karcie ticketu razem z podglądem, do jakiego państwa należy podany nick i czy ma aktywny list gończy. Pod kartą **🔒 Panel staffu** z notatkami widocznymi tylko dla administracji, a razem z ticketem powstaje kanał narady `sprawa-<nick>-<id>-administracja` widoczny tylko dla staffu (usuwany przy zamknięciu, rozmowa trafia do historii). Ticket można przejąć tylko raz (przycisk się blokuje, gracz dostaje informację). Maksymalnie 2 otwarte tickety na osobę; panel ma przyciski kategorii. Staff dostaje przypomnienie o tickecie nieprzejętym przez 2 h; ticket bez wiadomości przez 48 h dostaje ostrzeżenie, a po kolejnych 24 h zamyka się sam (`config.js` → `tickety`). W kategorii listu gończego staff wystawia list jednym przyciskiem. Zamyka osoba z administracji, która przejęła ticket (oraz właściciel, technik i role z `ROLA_ZAMYKACZ_TICKETU`): wybiera wynik (**udane / nieudane / odrzucone**) i wpisuje wyjaśnienie, które trafia do gracza (DM + ocena 1–5). Każdy zamknięty ticket ląduje na kanale **historii** (`KANAL_HISTORIA_TICKETOW`, osobnym od logów) z formularzem, wynikiem, oceną i transkryptem; zdarzenia (otwarcie, przejęcie, zamknięcie) idą do logów. `/historia-ticketow` pokazuje zgłoszenia gracza.
- **Selfrole**: grupy w bazie, tryb single/multi, panel wystawiany na dowolnym kanale i odświeżany po zmianach. Nie da się dodać ról z uprawnieniami administracyjnymi/moderacyjnymi, ról systemowych bota ani ról wyższych niż rola bota.
- **Wołanie moderatora**: wejście na „Poczekalnię" pinguje staff, po przyjęciu bot przenosi wołającego i staffa na wolny kanał Pomoc 1-3, log czasu oczekiwania, cykliczne przypomnienia (wznawiane po restarcie). Wyjście z poczekalni anuluje wezwanie (karta się aktualizuje), a uprawnienia do kanału pomocy są zdejmowane, gdy rozmowa się skończy.
- **Państwa + `/sojusz`**: staff tworzy państwo i nadaje lidera (króla, rola automatyczna). Tylko król zarządza swoim państwem (dodaj/usuń, statusy), gracz może należeć tylko do jednego państwa, limit członków. Status **Król** ma zawsze lider (jego nick z weryfikacji), pozostali to **Zastępca** lub **Członek**.
- **Config dla moda**: `/sojusz-lista` → „Config dla moda” wysyła plik JSON w formacie:
  ```json
  [{ "nick": "Steve", "allay": true, "status": "Król", "kingdom": "Polska" }]
  ```
  Nazwy statusów i nazwa pliku są w `config.js` → `panstwa`.
- **Listy gończe**: głowa skina z `mc-heads.net`, statusy `oczekuje/aktywny/zrealizowany/wygasly/odrzucony`, wygasanie sprawdzane co godzinę. **Zgłoszenie zatrzymania** (realizacja listu): formularz z opisem, obowiązkowym plikiem (zdjęcie/nagranie, do 5 plików) i opcjonalnym linkiem; powstaje kanał `zatrzymanie-<nick>-<id>` widoczny tylko dla administracji (kategoria `KATEGORIA_NARADY`), gdzie są dowody i przyciski Zatwierdź / Odrzuć / Dodaj zgłaszającego (żeby dopytać o szczegóły). Po decyzji zgłaszający dostaje DM, transkrypt trafia do logów, a kanał jest usuwany.
- **Sąd sojuszniczy**: `/pozew` tworzy prywatny kanał ze sprawą (numer `SNZ-YYYY-NNNN`); pozwanym graczem jest konto Discord. Staff przyjmuje sprawę (max jedna aktywna na sędziego). **Konflikt interesów**: sędzią nie może zostać pozywający, pozwany ani nikt z państwa którejkolwiek ze stron (król lub członek). **Sędzia jest stały** — po przyjęciu nikt nie może przejąć sprawy (wyjątek: `/sprawa-sedzia` właściciela serwera). **Wyrok jest ostateczny** — nie ma odwołań. Rola „Sędzia" nadawana/odbierana automatycznie, publikacja wyroku w kanale wyroków, opcjonalny automatyczny list gończy na skazanego (po jego zweryfikowanym nicku), transkrypt po zamknięciu.
- **Ochrona logów**: bot trzyma kopię każdej swojej wiadomości na kanałach logów (i historii ticketów). Usunięty log od razu wraca na kanał, a osoba, która go usunęła (poza właścicielem serwera i technikiem z `TECHNIK_ID`), traci rangi i dostaje wyciszenie na 1 h; sprawca, właściciel i technik dostają wiadomość prywatną. Role da się przywrócić `/przywroc-role`. Rola bota musi być wyżej niż role administracji, inaczej nie da się ich odebrać.
- **Ochrona kanałów**: osoba, która usunie kanał (poza właścicielem, technikiem i botem), traci rangi i dostaje wyciszenie na 1 h, a kanał jest odtwarzany razem z historią: logi bota wracają, a zwykłe wiadomości (200 ostatnich na kanał, `config.js` → `backupWiadomosci`) są odtwarzane webhookiem z nazwą i awatarem autora; starsze trafiają do pliku .txt. Wyłączenie: `OCHRONA_KANALOW_WYLACZONA=true`, `OCHRONA_KANALOW_ODTWARZAJ=false`, `BACKUP_WIADOMOSCI_WYLACZONY=true`.
- **Logi serwera**: dołączenia i wyjścia, utworzenie/edycja kanałów, nadanie i odebranie ról, bany, kicki i wyciszenia (z wykonawcą i powodem) na kanale `KANAL_LOGI`. Akcje samego bota są pomijane.
- **Logi wiadomości**: usunięte i edytowane wiadomości (treść przed/po, załączniki, masowe usuwanie) na kanale `KANAL_LOGI_WIADOMOSCI` (domyślnie `KANAL_LOGI`). Logi nikogo nie pingują.
- **Ostrzeżenia**: `/warn`, `/warny`, `/usun-warn`, konfigurowalne progi (auto-mute i auto-ban). Do progów liczą się tylko aktywne ostrzeżenia — wygasają po 30 dniach, a ostrzeżenia z wyroków sądu domyślnie się nie liczą (`config.js` → `ostrzezenia`).
- **Automod**: flood, powtarzanie tej samej treści, masowe oznaczanie, próby `@everyone/@here` i zaproszenia na inne serwery — wiadomość jest usuwana, a autor wyciszany na 5 min; spamujący bot jest wyrzucany (boty z whitelisty antynuke są pomijane) (staff pomijany, progi w `config.js` → `automod`, wyłączenie: `AUTOMOD_WYLACZONY=true`).
- **Powitania**: nowy członek dostaje powitanie z instrukcją weryfikacji na kanale `KANAL_POWITANIA` (puste = wyłączone).
- **Antynuke**: na podstawie dziennika zdarzeń wykrywa masowe banowanie, wyrzucanie, usuwanie i spamowanie kanałów oraz usuwanie ról (progi w `config.js` → `antynuke`). Sprawca spoza whitelisty traci role / jest wyrzucany / banowany (`ANTYNUKE_KARA`), a szkody są cofane: odbanowanie ofiar, odtworzenie usuniętych kanałów i ról, usunięcie spamowanych kanałów. Opcjonalnie (`ANTYNUKE_WYRZUCAJ_BOTY=true`) boty dodane przez osoby spoza whitelisty są wyrzucane. Nadanie komuś roli z uprawnieniami administracyjnymi albo dopisanie takich uprawnień do roli przez osobę spoza whitelisty jest od razu cofane. Liczone są też masowe webhooki, zmiany uprawnień kanałów i ustawień serwera.
- **Blokada uprawnień botów**: każdy nowo dodany bot (kogokolwiek) od razu traci wszystkie uprawnienia swojej roli; właściciel dostaje DM, a log trafia na kanał antynuke. Zmienić to może tylko właściciel serwera — ręcznie w ustawieniach roli bota albo `/bot-uprawnienia przywroc` (nadaje uprawnienia, o które bot prosił przy dodaniu). Gdy ktokolwiek inny (także osoba z whitelisty antynuke) da botowi uprawnienia roli, nową rolę albo uprawnienia na kanale, zmiana jest cofana. Po restarcie bot nadrabia zmiany z czasu, gdy był wyłączony. Boty, które były na serwerze przed włączeniem blokady, można objąć nią komendą `/bot-uprawnienia zablokuj`. Rola SNZ_bot musi być wyżej niż role dodawanych botów. Wyłączenie: `BLOKADA_BOTOW_WYLACZONA=true`.
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
5. Uruchom `npm test` przed wysłaniem zmian.
# SNZ_bot
