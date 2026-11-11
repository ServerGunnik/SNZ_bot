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
];
