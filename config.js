require('dotenv').config();

module.exports = {
  token: process.env.BOT_TOKEN,
  clientId: process.env.CLIENT_ID,
  guildId: process.env.GUILD_ID,

  kanaly: {
    logi: process.env.KANAL_LOGI,
    logiTickety: process.env.KANAL_LOGI_TICKETY || process.env.KANAL_LOGI,
    // Historia zamkniętych ticketów (podsumowanie + transkrypt) - osobny kanał niż logi
    historiaTicketow: process.env.KANAL_HISTORIA_TICKETOW,
    logiSad: process.env.KANAL_LOGI_SAD || process.env.KANAL_LOGI,
    logiPanstwa: process.env.KANAL_LOGI_PANSTWA || process.env.KANAL_LOGI,
    logiAntynuke: process.env.KANAL_LOGI_ANTYNUKE || process.env.KANAL_LOGI,
    weryfikacja: process.env.KANAL_WERYFIKACJA,
    ticket: process.env.KANAL_TICKET,
    listyGoncze: process.env.KANAL_LISTY_GONCZE,
    wyroki: process.env.KANAL_WYROKI,
    modCall: process.env.KANAL_MOD_CALL,
    kategoriaTickety: process.env.KATEGORIA_TICKETY,
    kategoriaSprawy: process.env.KATEGORIA_SPRAWY,
    poczekalnia: process.env.POCZEKALNIA_ID,
    pomoc: [process.env.POMOC_1_ID, process.env.POMOC_2_ID, process.env.POMOC_3_ID].filter(Boolean),
  },

  role: {
    zweryfikowany: process.env.ROLA_ZWERYFIKOWANY,
    staff: process.env.ROLA_STAFF,
    lider: process.env.ROLA_LIDER,
    sedzia: process.env.ROLA_SEDZIA,
    modPing: process.env.ROLA_MOD_PING || process.env.ROLA_STAFF,
  },

  weryfikacja: {
    minDlugoscNicka: 3,
    maxDlugoscNicka: 16,
    regexNicka: /^[a-zA-Z0-9_]{3,16}$/,
    zmienPseudonim: true,
  },

  tickety: {
    limitOtwartych: 2,
    // Kategorie ticketów. Każda ma własny formularz (max 5 pól) wypełniany PRZED otwarciem ticketu.
    // styl: 'krotki' | 'dlugi'; nick: true = walidacja nicku Minecraft + podgląd państwa i listów gończych
    kategorie: [
      {
        value: 'ranga', label: 'Prośba o rangę', emoji: '⭐', opis: 'Złóż podanie o rangę na serwerze',
        pola: [
          { id: 'nick', label: 'Twój nick w Minecraft', styl: 'krotki', min: 3, max: 16, nick: true },
          { id: 'ranga', label: 'O jaką rangę prosisz?', styl: 'krotki', min: 2, max: 100 },
          { id: 'uzasadnienie', label: 'Dlaczego mamy Ci ją przyznać?', styl: 'dlugi', min: 10, max: 1000 },
        ],
      },
      {
        value: 'pomoc', label: 'Pomoc ogólna', emoji: '❓', opis: 'Pytania, problemy i sprawy ogólne',
        pola: [
          { id: 'nick', label: 'Twój nick w Minecraft', styl: 'krotki', min: 3, max: 16, nick: true },
          { id: 'temat', label: 'Temat', styl: 'krotki', min: 3, max: 100 },
          { id: 'opis', label: 'Opisz, w czym potrzebujesz pomocy', styl: 'dlugi', min: 10, max: 1500 },
        ],
      },
      {
        value: 'szpieg', label: 'Zgłoszenie szpiega', emoji: '🔍', opis: 'Zgłoś gracza, który szpieguje dla wroga',
        pola: [
          { id: 'nick', label: 'Nick szpiega', styl: 'krotki', min: 3, max: 16, nick: true },
          { id: 'dla_kogo', label: 'Dla kogo szpieguje? (państwo/gracz)', styl: 'krotki', max: 100, wymagane: false },
          { id: 'opis', label: 'Co zauważyłeś?', styl: 'dlugi', min: 10, max: 1500 },
          { id: 'dowody', label: 'Dowody (linki do screenów/nagrań)', styl: 'dlugi', max: 1000, wymagane: false },
        ],
      },
      {
        value: 'list-gonczy', label: 'Wystawienie listu gończego', emoji: '🎯', opis: 'Poproś o list gończy na gracza',
        pola: [
          { id: 'nick', label: 'Nick poszukiwanego', styl: 'krotki', min: 3, max: 16, nick: true },
          { id: 'powod', label: 'Powód listu gończego', styl: 'dlugi', min: 10, max: 500 },
          { id: 'nagroda', label: 'Nagroda (np. 10 diamentów)', styl: 'krotki', max: 100, wymagane: false },
          { id: 'dowody', label: 'Dowody (linki do screenów/nagrań)', styl: 'dlugi', max: 1000, wymagane: false },
        ],
        // Staff może wystawić list gończy jednym przyciskiem z danych formularza
        listGonczy: { nick: 'nick', powod: 'powod', nagroda: 'nagroda' },
      },
    ],
    // Wynik wybierany przy zamykaniu ticketu
    wyniki: {
      udane: { label: 'Udane / rozwiązane', emoji: '✅' },
      nieudane: { label: 'Nieudane / nierozwiązane', emoji: '❌' },
      odrzucone: { label: 'Odrzucone', emoji: '🚫' },
    },
    ocenaTimeoutMs: 15 * 60 * 1000,
    minDlugoscWyjasnienia: 10,
  },

  panstwa: {
    domyslnyLimitCzlonkow: 20,
    czlonkowNaStrone: 12,
    panstwNaStrone: 8,
    // Nazwy statusów widoczne w bocie i w configu moda (pole "status")
    statusy: {
      krol: 'Król',
      zastepca: 'Zastępca',
      czlonek: 'Członek',
    },
    plikConfigu: 'snz-sojusz.json',
  },

  listyGoncze: {
    domyslnaWaznoscDni: 14,
    interwalWygasaniaMs: 60 * 60 * 1000,
    apiGlowyUrl: (nick) => `https://mc-heads.net/avatar/${encodeURIComponent(nick)}/128`,
  },

  sad: {
    prefixSprawy: 'sprawa-',
    odwolanieDostepneMs: 72 * 60 * 60 * 1000,
  },

  ostrzezenia: {
    prog: {
      mute: 3,
      ban: 5,
    },
    dlugoscMuteMs: 60 * 60 * 1000,
  },

  wolanieModa: {
    interwalPingMs: 90 * 1000,
    maxPingow: 3,
  },

  antynuke: {
    wlaczony: process.env.ANTYNUKE_WYLACZONY !== 'true',
    // Ile akcji danego typu w oknie czasowym uruchamia karę
    oknoMs: 10 * 1000,
    progi: {
      ban: 3,
      kick: 3,
      kanalUsun: 3,
      kanalUtworz: 5,
      rolaUsun: 3,
    },
    // 'role' - odebranie wszystkich ról, 'kick' - wyrzucenie, 'ban' - ban
    kara: process.env.ANTYNUKE_KARA || 'role',
    // Cofanie szkód: odbanowanie, odtworzenie usuniętych kanałów/ról, usunięcie spamowanych kanałów
    przywracaj: true,
    // Wyrzucanie botów dodanych przez osoby spoza whitelisty
    blokujBoty: true,
    // Dodatkowa whitelista z .env (ID oddzielone przecinkami); właściciel serwera i bot są zawsze na whiteliście
    whitelist: (process.env.ANTYNUKE_WHITELIST || '').split(',').map(s => s.trim()).filter(Boolean),
  },

  antyraid: {
    wlaczony: process.env.ANTYRAID_WYLACZONY !== 'true',
    // Ile dołączeń w oknie czasowym włącza tryb anty-raid
    oknoMs: 15 * 1000,
    progDolaczen: 8,
    // Jak długo trwa tryb anty-raid (każdy nowy członek jest wyrzucany)
    czasTrybuMs: 10 * 60 * 1000,
    // Konta młodsze niż tyle dni, które wbiły w trakcie fali, też są wyrzucane
    minWiekKontaDni: 7,
  },
};
