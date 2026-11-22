// Dziennik zmian bota publikowany automatycznie na kanale update-log (modules/update-log.js).
// Każda zmiana w bocie = nowy wpis NA KOŃCU listy, z unikalnym `id`. Bot przy starcie wysyła
// wpisy, których jeszcze nie opublikował (pamięta je w bazie), więc po wdrożeniu nic nie trzeba klikać.
//   id:         unikalny, nie zmieniaj po publikacji (np. '2026-10-24-recru')
//   tytul:      krótka nazwa aktualizacji
//   dodano:     🆕 co dodano lub zmieniono (lista)
//   naprawiono: 🔧 co naprawiono (lista)
//   opis:       📝 krótki opis działania zmiany
module.exports = [
  {
    id: '2026-10-24-recru-update-log',
    data: '2026-10-24',
    tytul: 'Naprawa rekrutacji i kanał aktualizacji',
    dodano: [
      'Kanał **update-log** — bot sam publikuje tutaj każdą nową aktualizację',
      '`/recru stwórz` i `/recru usuń` — polskie nazwy podkomend',
      'Kanał rozmowy nazywa się teraz **Rekrutacja**, a poczekalnia **Poczekalnia rekrutacyjna**',
    ],
    naprawiono: [
      '`/recru stwórz` nie tworzył kanałów, gdy w konfiguracji była rola, której nie ma na serwerze, albo bot nie miał któregoś z uprawnień głosowych',
      'Kandydat przeniesiony na kanał Rekrutacja nie mógł mówić (nie widział kanału)',
      'Kandydat, który wyszedł z poczekalni, mógł zostać wyciszony na całym serwerze',
      '`/recru usuń` po cichu pomijał kanały, których nie udało się usunąć — teraz pokazuje błąd i pozwala spróbować ponownie',
    ],
    opis: 'Poczekalnia rekrutacyjna: każdy może wejść, ale nie może mówić. Staff przenosi kandydata na kanał Rekrutacja, a bot od razu daje mu prawo mówienia. `/recru usuń` kasuje wszystkie kanały utworzone przez rekrutację.',
  },
  {
    id: '2026-11-11-wyroki-skargi',
    data: '2026-11-11',
    tytul: 'Archiwum wyroków i skargi do sądu',
    dodano: [
      'Każdy publiczny wyrok sądu trafia teraz w całości także do **logów sądu**, nie tylko na kanał **#wyroki-sądowe**',
      'Nowa kategoria ticketów **📨 Skargi i wnioski** — skargi oraz wnioski do sądu',
      'Tickety ze skargami i wnioskami widzi i może przejąć ranga sądu (Admin/Sędzia), nawet bez roli staffu',
    ],
    naprawiono: [
      'Jeśli ustawione ID kanału wyroków nie istnieje na serwerze, bot sam znajduje kanał **#wyroki-sądowe** po nazwie',
    ],
    opis: 'Gdy sędzia opublikuje wyrok z rozprawy publicznej, bot wysyła go na #wyroki-sądowe i zapisuje pełną kartę wyroku w logach sądu. Skargę lub wniosek składa się w panelu ticketów przyciskiem „Skargi i wnioski”: formularz pyta o nick, rodzaj (skarga/wniosek), czego dotyczy, treść i dowody.',
  },
  {
    id: '2026-11-11-splaty-kary-uczestnicy',
    data: '2026-11-11',
    tytul: 'Spłata wyroków, kary na rozprawie i dodawanie uczestników',
    dodano: [
      '`/sprawa-splacona osoba [numer]` — oznacza, że dana osoba wykonała swoją karę. Na karcie wyroku widać, kto spłacił, kto to oznaczył i kiedy; sprawa jest **✅ spłacona** dopiero, gdy kary wykonają wszyscy ukarani (np. obie strony)',
      '`/sprawa-dodaj-kare osoba kara [powód] [numer]` — dodatkowa kara dla każdego, kto źle zachowuje się na rozprawie (widz, świadek, obrońca…). Kara pojawia się na kanale sprawy, w logach sądu, w historii ostrzeżeń i na karcie wyroku',
      '`/sprawa-dodaj osoba [numer]` — dodaje osobę do rozprawy (dostęp do kanału sprawy)',
      'Wyroki z rozpraw niepublicznych (kanał dla administracji) również trafiają w całości do logów sądu',
    ],
    opis: 'Komend używa sędzia sprawy, ranga sądu albo administracja. Na kanale sprawy numer jest zbędny; poza nim podaj numer sprawy (np. SNZ-2026-0012). Opublikowane karty wyroków — na #wyroki-sądowe, na kanale administracji i w logach sądu — aktualizują się same po każdej spłacie i dodatkowej karze.',
  },
  {
    id: '2026-11-13-sad-przyjmij-timeout',
    data: '2026-11-13',
    tytul: 'Poprawka przycisków sądu',
    naprawiono: [
      'Przycisk **Przyjmij** w sprawie sądowej czasem kończył się komunikatem „Ta interakcja nie powiodła się”, choć sprawa była przyjmowana',
      'To samo mogło się zdarzyć przy wydawaniu wyroku, wyborze publikacji i dodawaniu dowodów',
    ],
    opis: 'Bot od razu potwierdza kliknięcie, a dopiero potem nadaje rolę Sędzia, ustawia dostęp do kanału, wysyła wyrok i zapisuje logi. Wynik pojawia się po chwili w tej samej wiadomości.',
  },
  {
    id: '2026-11-15-narada-ticketu',
    data: '2026-11-15',
    tytul: 'Poprawka kanału narady administracji przy ticketach',
    naprawiono: [
      'Kanał narady administracji (`sprawa-…-administracja`) czasem nie powstawał razem z ticketem',
      'Gdy kategoria narad jest pełna (50 kanałów) albo niedostępna dla bota, narada powstaje bez kategorii zamiast wcale',
      'Narada jest widoczna dla tych samych osób co ticket: także rangi sądu przy skargach, techników i ról zamykających tickety',
    ],
    opis: 'Jeśli narady nie da się utworzyć, w logach ticketów pojawia się wpis z dokładną przyczyną od Discorda.',
  },
  {
    id: '2026-11-15-warny-rozprawa',
    data: '2026-11-15',
    tytul: 'Ostrzeżenia prowadzą do rozprawy sądowej',
    dodano: [
      'Przy **3 aktywnych ostrzeżeniach** bot sam zakłada rozprawę sądową z urzędu — staff przyjmuje ją jako sędzia, jak każdą inną sprawę',
      'Przycisk **⚖️ Przejmij oskarżenie (Prokurator)** na karcie sprawy — ranga Prokurator może przypisać się jako oskarżający jednym kliknięciem',
      'Nie ma już automatycznego bana po 5 ostrzeżeniach ani automatycznego wyciszenia po 3 — o karze decyduje sąd',
    ],
    opis: 'Kanał sprawy z urzędu widzi ukarany gracz, administracja i Prokuratorzy. Dopóki sprawa jest otwarta, kolejne ostrzeżenia nie zakładają nowej.',
  },
  {
    id: '2026-11-15-kara-do-warnow',
    data: '2026-11-15',
    tytul: 'Dodatkowa kara: wybór, czy trafia do ostrzeżeń',
    dodano: [
      '`/sprawa-dodaj-kare` ma obowiązkową opcję **do-warnow** — nakładający decyduje, czy kara pokaże się w historii ostrzeżeń (`/warny`) ukaranego',
    ],
    opis: 'Kara zawsze jest zapisana przy sprawie, na kanale sprawy, w logach sądu i na karcie wyroku. Opcja zmienia tylko wpis w ostrzeżeniach.',
  },
  {
    id: '2026-11-15-id-kar-splat',
    data: '2026-11-15',
    tytul: 'Numery kar i spłat',
    dodano: [
      'Każda kara z wyroku i każda dodatkowa kara ma numer **#K…** — tak jak ostrzeżenia mają swój #',
      'Każda spłata kary ma numer **#S…**',
      'Numery widać na karcie wyroku, w logach sądu, w potwierdzeniach `/sprawa-dodaj-kare` i `/sprawa-splacona` oraz w treści ostrzeżeń',
    ],
    opis: 'Wcześniejsze wyroki i spłaty też dostały numery — kary ze starszych wyroków są numerowane przy pierwszym wyświetleniu karty.',
  },
  {
    id: '2026-11-16-historia-spraw',
    data: '2026-11-16',
    tytul: 'Historia spraw sądowych',
    dodano: [
      '`/historia-spraw` — przegląd wszystkich spraw sądowych z filtrami: gracz, sędzia, status (w toku / zakończone) oraz stronami',
      'Przy filtrze gracza widać jego rolę w każdej sprawie i podsumowanie: ile razy był pozwanym, pozywającym, sędzią i prokuratorem, ile ma kar i ile spłacił',
      'Wybór sprawy z listy (albo opcja `numer`) pokazuje szczegóły: strony, sędziego, daty, zarzut, wyrok, kary #K i spłaty #S',
    ],
    opis: 'Administracja, ranga sądu i sędziowie widzą wszystkie sprawy. Każdy gracz może sprawdzić swoje sprawy wpisując /historia-spraw bez opcji, a także szczegóły publicznych wyroków.',
  },
  {
    id: '2026-11-16-ticket-ping-duplikat',
    data: '2026-11-16',
    tytul: 'Poprawka otwierania ticketów',
    naprawiono: [
      'Otwarcie ticketu kończyło się błędem „Invalid Form Body … SET_TYPE_ALREADY_CONTAINS_VALUE”, gdy ta sama rola była wpisana jednocześnie jako staff i helper — kanał powstawał bez karty i bez narady',
      'Powtórzone role w ustawieniach są teraz pomijane, a nieudany ping nie przerywa już zakładania ticketu',
    ],
    opis: 'Rola wpisana jednocześnie jako staff i helper jest traktowana jak staff i pingowana raz. Tickety otwierają się normalnie razem z kartą i kanałem narady.',
  },
  {
    id: '2026-11-22-formularz-rekrutacyjny',
    data: '2026-11-22',
    tytul: 'Formularz rekrutacyjny',
    dodano: [
      '`/recru panel` — wystawia panel z przyciskiem **📝 Złóż podanie**',
      'Formularz: nick z Minecrafta, wiek, dlaczego chcesz dołączyć, doświadczenie / co możesz wnieść, ile czasu możesz poświęcić',
      'Podanie trafia do administracji z przyciskami **Przyjmij** / **Odrzuć**; przy odrzuceniu można podać powód',
      'Kandydat dostaje decyzję w wiadomości prywatnej; po przyjęciu bot może nadać rolę rekruta',
    ],
    opis: 'Jedna osoba może mieć naraz jedno oczekujące podanie, a po odrzuceniu kolejne złoży po 24 h. Nick jest sprawdzany tak jak przy weryfikacji.',
  },
  {
    id: '2026-11-22-ankiety-naprawa',
    data: '2026-11-22',
    tytul: 'Naprawa ankiet',
    naprawiono: [
      'Anonimowe ankiety z 3 lub więcej odpowiedziami w ogóle się nie wysyłały (Discord odrzucał oznaczenia opcji C–J)',
      'Zwykłe ankiety z opcją `wiele:true` pozwalały wybrać tylko jedną odpowiedź',
    ],
    opis: 'Opcje anonimowych ankiet są teraz oznaczone literami 🇦–🇯. Komenda się nie zmieniła — wystarczy wystawić ankietę jeszcze raz.',
  },
];
