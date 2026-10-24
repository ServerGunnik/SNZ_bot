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
];
