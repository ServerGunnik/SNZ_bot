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
];
