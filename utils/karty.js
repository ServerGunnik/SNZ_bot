// Buildery kart Components V2 - jedno miejsce na cały wygląd
const {
  ContainerBuilder,
  SectionBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  ThumbnailBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  UserSelectMenuBuilder,
  FileBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
} = require('discord.js');

const kolory = require('./kolory.js');

const FLAGS_V2 = { flags: MessageFlags.IsComponentsV2 };

// ---- Pomocnicze --------------------------------------------------------

function tekst(str) {
  return new TextDisplayBuilder().setContent(str);
}

function separator(mala = true) {
  return new SeparatorBuilder()
    .setDivider(true)
    .setSpacing(mala ? SeparatorSpacingSize.Small : SeparatorSpacingSize.Large);
}

function kontener(accent = kolory.neutralny) {
  return new ContainerBuilder().setAccentColor(accent);
}

function przycisk(customId, label, style = ButtonStyle.Secondary, emoji = null, disabled = false) {
  const b = new ButtonBuilder()
    .setCustomId(customId)
    .setLabel(label)
    .setStyle(style)
    .setDisabled(disabled);
  if (emoji) b.setEmoji(emoji);
  return b;
}

function link(url, label, emoji = null) {
  const b = new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(label).setURL(url);
  if (emoji) b.setEmoji(emoji);
  return b;
}

// ---- Karty generyczne --------------------------------------------------

function kartaInfo({ tytul, opis, kolor = kolory.neutralny, stopka = null }) {
  const c = kontener(kolor);
  c.addTextDisplayComponents(tekst(`## ${tytul}`));
  c.addSeparatorComponents(separator(true));
  c.addTextDisplayComponents(tekst(opis));
  if (stopka) {
    c.addSeparatorComponents(separator(true));
    c.addTextDisplayComponents(tekst(`-# ${stopka}`));
  }
  return { components: [c], ...FLAGS_V2 };
}

function kartaSukces(tytul, opis, stopka = null) {
  return kartaInfo({ tytul: `✓ ${tytul}`, opis, kolor: kolory.sukces, stopka });
}

function kartaBlad(tytul, opis, stopka = null) {
  return kartaInfo({ tytul: `✕ ${tytul}`, opis, kolor: kolory.blad, stopka });
}

function kartaOstrzezenie(tytul, opis, stopka = null) {
  return kartaInfo({ tytul: `! ${tytul}`, opis, kolor: kolory.ostrzezenie, stopka });
}

// ---- Panele modułów ----------------------------------------------------

function panelWeryfikacji() {
  const c = kontener(kolory.neutralny);
  c.addTextDisplayComponents(tekst('## Weryfikacja obywatela'));
  c.addSeparatorComponents(separator(true));
  c.addTextDisplayComponents(tekst(
    'Aby uzyskać dostęp do serwera Sojuszu Narodów Zjednoczonych, potwierdź swoją tożsamość poprzez podanie nicku z serwera Minecraft.\n\n' +
    '**Wymogi**\n' +
    '• Nick musi być zgodny z Twoim kontem Minecraft\n' +
    '• 3-16 znaków, tylko litery, cyfry i podkreślnik\n' +
    '• Jeden nick = jedno konto Discord'
  ));
  c.addSeparatorComponents(separator(false));
  c.addActionRowComponents(new ActionRowBuilder().addComponents(
    przycisk('weryfikacja:start', 'Rozpocznij weryfikację', ButtonStyle.Success)
  ));
  return { components: [c], ...FLAGS_V2 };
}

function panelTicketow(kategorie) {
  const c = kontener(kolory.neutralny);
  c.addTextDisplayComponents(tekst('## Biuro zgłoszeń SNZ'));
  c.addSeparatorComponents(separator(true));
  c.addTextDisplayComponents(tekst(
    'Wybierz kategorię i wypełnij krótki formularz — dopiero wtedy otworzy się prywatny kanał obsługi.\n\n' +
    kategorie.map(k => `${k.emoji ? `${k.emoji} ` : '• '}**${k.label}** — ${k.opis}`).join('\n')
  ));
  c.addSeparatorComponents(separator(false));
  // Przyciski zamiast listy wyboru - nie zapamiętują zaznaczenia, więc kategorię można wybrać ponownie
  for (let i = 0; i < kategorie.length; i += 5) {
    c.addActionRowComponents(new ActionRowBuilder().addComponents(
      ...kategorie.slice(i, i + 5).map(k => przycisk(`ticket:kategoria:${k.value}`, k.label.slice(0, 80), ButtonStyle.Secondary, k.emoji || null))
    ));
  }
  return { components: [c], ...FLAGS_V2 };
}

// Pola formularza: [{ label, wartosc }] -> tekst
function tekstFormularza(pola) {
  return pola
    .filter(p => p.wartosc)
    .map(p => p.wartosc.includes('\n') || p.wartosc.length > 80 ? `**${p.label}:**\n${p.wartosc}` : `**${p.label}:** ${p.wartosc}`)
    .join('\n');
}

function kartaTicketu({
  ticketId = null, uzytkownik, kategoria, przydzielony = null,
  pola = [], informacje = [], listGonczy = null, temat = null, opis = null,
}) {
  const c = kontener(kolory.neutralny);
  c.addTextDisplayComponents(tekst(`## Zgłoszenie — ${kategoria}`));
  c.addSeparatorComponents(separator(true));
  c.addTextDisplayComponents(tekst(
    `**Zgłaszający:** <@${uzytkownik}>\n` +
    `**Obsługuje:** ${przydzielony ? `<@${przydzielony}>` : 'nikt jeszcze'}`
  ));
  c.addSeparatorComponents(separator(true));
  if (pola.length) {
    c.addTextDisplayComponents(tekst(`### Formularz\n${tekstFormularza(pola)}`));
  } else if (temat || opis) {
    c.addTextDisplayComponents(tekst(`### ${temat || 'Opis sprawy'}\n${opis || ''}`));
  } else {
    c.addTextDisplayComponents(tekst('Opisz sprawę w kilku zdaniach. Staff wkrótce się zajmie zgłoszeniem.'));
  }
  if (informacje.length) {
    c.addSeparatorComponents(separator(true));
    c.addTextDisplayComponents(tekst(informacje.join('\n')));
  }
  c.addTextDisplayComponents(tekst('-# Zgłoszenie zamyka administracja, podając wynik i wyjaśnienie.'));
  c.addSeparatorComponents(separator(false));
  c.addActionRowComponents(new ActionRowBuilder().addComponents(
    przycisk('ticket:przejmij', przydzielony ? 'Przejęte' : 'Przejmij', ButtonStyle.Primary, null, Boolean(przydzielony)),
    przycisk('ticket:zamknij', 'Zamknij zgłoszenie', ButtonStyle.Danger)
  ));
  const rowStaff = [przycisk(ticketId ? `ticket:notatki:${ticketId}` : 'ticket:notatki', 'Panel staffu', ButtonStyle.Secondary, '🔒')];
  if (listGonczy && ticketId) {
    rowStaff.push(listGonczy.id
      ? przycisk(`ticket:list-wystawiony:${ticketId}`, `List gończy #${listGonczy.id} wystawiony`, ButtonStyle.Success, '🎯', true)
      : przycisk(`ticket:wystaw-list:${ticketId}`, 'Wystaw list gończy', ButtonStyle.Success, '🎯'));
  }
  c.addActionRowComponents(new ActionRowBuilder().addComponents(...rowStaff));
  return { components: [c], ...FLAGS_V2 };
}

// Lista notatek przycięta do limitu znaków (najnowsze mają pierwszeństwo)
function listaNotatek(notatki, limitZnakow = 3000) {
  const linie = [];
  let dlugosc = 0;
  for (let i = notatki.length - 1; i >= 0; i--) {
    const n = notatki[i];
    const linia = `<@${n.autor_id}> <t:${Math.floor(n.data / 1000)}:t> — ${n.tresc}`;
    if (dlugosc + linia.length + 1 > limitZnakow) {
      linie.unshift(`-# …oraz ${i + 1} starszych (pełna lista w transkrypcie po zamknięciu)`);
      break;
    }
    linie.unshift(linia);
    dlugosc += linia.length + 1;
  }
  return linie.join('\n');
}

function kartaNotatekTicketu({ ticketId, notatki, naradaId = null }) {
  const c = kontener(kolory.info);
  c.addTextDisplayComponents(tekst('## 🔒 Panel staffu — notatki'));
  c.addTextDisplayComponents(tekst(`-# Widoczne tylko dla administracji. Gracz nie widzi tych notatek.${naradaId ? ` Narada: <#${naradaId}>` : ''}`));
  c.addSeparatorComponents(separator(true));
  c.addTextDisplayComponents(tekst(notatki.length ? listaNotatek(notatki) : '_Brak notatek. Dodaj pierwszą przyciskiem poniżej._'));
  c.addSeparatorComponents(separator(false));
  c.addActionRowComponents(new ActionRowBuilder().addComponents(
    przycisk(`ticket:notatka-dodaj:${ticketId}`, 'Dodaj notatkę', ButtonStyle.Success),
    przycisk(`ticket:notatki:${ticketId}`, 'Odśwież', ButtonStyle.Secondary)
  ));
  return { components: [c], ...FLAGS_V2 };
}

// Pierwsza wiadomość na kanale narady administracji
function kartaNarady({ ticketId, uzytkownik, kategoria, kanalTicketu, pola = [], informacje = [] }) {
  const c = kontener(kolory.info);
  c.addTextDisplayComponents(tekst(`## 🔒 Narada administracji — ticket #${ticketId}`));
  c.addTextDisplayComponents(tekst('-# Ten kanał widzi tylko administracja. Zostanie usunięty razem z ticketem, a rozmowa trafi do historii.'));
  c.addSeparatorComponents(separator(true));
  c.addTextDisplayComponents(tekst(
    `**Kategoria:** ${kategoria}\n**Zgłaszający:** <@${uzytkownik}>\n**Kanał ticketu:** <#${kanalTicketu}>`
  ));
  if (pola.length) {
    c.addSeparatorComponents(separator(true));
    c.addTextDisplayComponents(tekst(`### Formularz\n${tekstFormularza(pola)}`.slice(0, 2500)));
  }
  if (informacje.length) {
    c.addSeparatorComponents(separator(true));
    c.addTextDisplayComponents(tekst(informacje.join('\n')));
  }
  return { components: [c], ...FLAGS_V2 };
}

// Krok 1 zamykania: wybór wyniku
function kartaWynikuTicketu(ticketId, wyniki) {
  const c = kontener(kolory.ostrzezenie);
  c.addTextDisplayComponents(tekst('## Zamknięcie zgłoszenia'));
  c.addSeparatorComponents(separator(true));
  c.addTextDisplayComponents(tekst('Jaki jest wynik zgłoszenia? W następnym kroku wpiszesz wyjaśnienie — trafi do gracza i do historii ticketów.'));
  c.addSeparatorComponents(separator(false));
  c.addActionRowComponents(new ActionRowBuilder().addComponents(
    ...Object.entries(wyniki).filter(([, w]) => !w.ukryty).map(([kod, w]) => przycisk(
      `ticket:wynik:${ticketId}:${kod}`, w.label,
      kod === 'udane' ? ButtonStyle.Success : kod === 'odrzucone' ? ButtonStyle.Danger : ButtonStyle.Secondary,
      w.emoji,
    ))
  ));
  return { components: [c], ...FLAGS_V2 };
}

function kolorWyniku(kod) {
  return kod === 'udane' ? kolory.sukces : kod === 'odrzucone' ? kolory.blad : kolory.ostrzezenie;
}

function kartaWyjasnieniaTicketu({ zamykajacy, wyjasnienie, wynik = null, wynikKod = null }) {
  const c = kontener(wynikKod ? kolorWyniku(wynikKod) : kolory.info);
  c.addTextDisplayComponents(tekst('## Zgłoszenie zamknięte'));
  c.addSeparatorComponents(separator(true));
  c.addTextDisplayComponents(tekst(
    (wynik ? `**Wynik:** ${wynik.emoji} ${wynik.label}\n` : '') +
    `**Wyjaśnienie:**\n${wyjasnienie}\n\n**Zamyka:** <@${zamykajacy}>`
  ));
  c.addTextDisplayComponents(tekst('-# Kanał zostanie usunięty za 5 sekund.'));
  return { components: [c], ...FLAGS_V2 };
}

function kartaOcenyTicketu(ticketId, wyjasnienie = null, wynik = null) {
  const c = kontener(kolory.neutralny);
  c.addTextDisplayComponents(tekst('## Oceń obsługę zgłoszenia'));
  c.addSeparatorComponents(separator(true));
  c.addTextDisplayComponents(tekst('Twoje zgłoszenie zostało zamknięte. Wystaw ocenę od 1 do 5 — pomoże nam to podnosić jakość obsługi.'));
  if (wyjasnienie) {
    c.addSeparatorComponents(separator(true));
    c.addTextDisplayComponents(tekst((wynik ? `**Wynik:** ${wynik.emoji} ${wynik.label}\n` : '') + `**Wyjaśnienie:**\n${wyjasnienie}`));
  }
  c.addSeparatorComponents(separator(false));
  const row = new ActionRowBuilder();
  for (let i = 1; i <= 5; i++) {
    row.addComponents(przycisk(`ticket:ocena:${ticketId}:${i}`, `${i}`, ButtonStyle.Secondary));
  }
  c.addActionRowComponents(row);
  return { components: [c], ...FLAGS_V2 };
}

// Wpis na kanale historii ticketów (edytowany, gdy gracz wystawi ocenę)
function kartaHistoriiTicketu({ ticket, kategoria, pola, wynik, liczbaNotatek = 0 }) {
  const c = kontener(kolorWyniku(ticket.wynik));
  const czasMin = ticket.zamkniety ? Math.max(1, Math.round((ticket.zamkniety - ticket.otwarty) / 60000)) : null;
  const czas = czasMin === null ? '—' : czasMin >= 60 ? `${Math.floor(czasMin / 60)} h ${czasMin % 60} min` : `${czasMin} min`;
  c.addTextDisplayComponents(tekst(`## Ticket #${ticket.id} — ${kategoria}`));
  c.addTextDisplayComponents(tekst(`-# ${wynik ? `${wynik.emoji} ${wynik.label}` : 'Zamknięty'} • czas obsługi: ${czas}`));
  c.addSeparatorComponents(separator(true));
  c.addTextDisplayComponents(tekst(
    `**Zgłaszający:** <@${ticket.user_id}>\n` +
    `**Obsługiwał:** ${ticket.przydzielony ? `<@${ticket.przydzielony}>` : '_nikt_'}\n` +
    `**Zamknął:** ${ticket.zamknal ? `<@${ticket.zamknal}>` : '—'}\n` +
    `**Otwarty:** <t:${Math.floor(ticket.otwarty / 1000)}:f>\n` +
    `**Zamknięty:** ${ticket.zamkniety ? `<t:${Math.floor(ticket.zamkniety / 1000)}:f>` : '—'}` +
    (ticket.list_id ? `\n**Wystawiony list gończy:** #${ticket.list_id}` : '')
  ));
  if (pola.length) {
    c.addSeparatorComponents(separator(true));
    c.addTextDisplayComponents(tekst(`### Formularz\n${tekstFormularza(pola)}`.slice(0, 1800)));
  }
  c.addSeparatorComponents(separator(true));
  c.addTextDisplayComponents(tekst(`### Wyjaśnienie\n${ticket.wyjasnienie || '_brak_'}`));
  c.addSeparatorComponents(separator(true));
  c.addTextDisplayComponents(tekst(
    `**Ocena gracza:** ${ticket.ocena ? `${'★'.repeat(ticket.ocena)}${'☆'.repeat(5 - ticket.ocena)} (${ticket.ocena}/5)` : '_jeszcze nie oceniono_'}` +
    (liczbaNotatek ? `\n**Notatki staffu:** ${liczbaNotatek} (w transkrypcie)` : '')
  ));
  return { components: [c], ...FLAGS_V2 };
}

function kartaPliku({ tytul, nazwaPliku }) {
  const c = kontener(kolory.neutralny);
  c.addTextDisplayComponents(tekst(`-# ${tytul}`));
  c.addFileComponents(new FileBuilder().setURL(`attachment://${nazwaPliku}`));
  return { components: [c], ...FLAGS_V2 };
}

function kartaHistoriiUzytkownika({ userId, tickety, total, nazwyKategorii, wyniki }) {
  const c = kontener(kolory.info);
  c.addTextDisplayComponents(tekst(`## Historia ticketów — <@${userId}>`));
  c.addTextDisplayComponents(tekst(`-# Wszystkich zgłoszeń: ${total}${total > tickety.length ? ` • pokazano ${tickety.length} najnowszych` : ''}`));
  c.addSeparatorComponents(separator(true));
  c.addTextDisplayComponents(tekst(tickety.length
    ? tickety.map(t => {
        const w = wyniki[t.wynik];
        const status = t.status === 'otwarty' ? '🟢 otwarty' : w ? `${w.emoji} ${w.label}` : 'zamknięty';
        const link = t.historia_wiad_id && t.historia_kanal_id && t.guild_id
          ? ` — [historia](https://discord.com/channels/${t.guild_id}/${t.historia_kanal_id}/${t.historia_wiad_id})` : '';
        const kanal = t.status === 'otwarty' ? ` — <#${t.kanal_id}>` : '';
        return `\`#${t.id}\` <t:${Math.floor(t.otwarty / 1000)}:d> • **${nazwyKategorii[t.kategoria_kod] || t.kategoria}** • ${status}` +
          `${t.ocena ? ` • ${t.ocena}/5` : ''}${kanal}${link}`;
      }).join('\n')
    : '_Brak zgłoszeń._'));
  return { components: [c], ...FLAGS_V2 };
}

// ---- Państwa -----------------------------------------------------------

function kartaPanstwa({ panstwo, krol = null, czlonkowie, strona, stron, listyGoncze = new Set(), statusy }) {
  const c = kontener(kolory.neutralny);
  c.addTextDisplayComponents(tekst(`## Państwo — ${panstwo.nazwa}`));
  c.addSeparatorComponents(separator(true));
  c.addTextDisplayComponents(tekst(
    `**${statusy.krol}:** ${panstwo.lider_id ? `<@${panstwo.lider_id}>` : 'wakat'}${krol ? ` (\`${krol}\`)` : ' — _brak weryfikacji, nick nie trafi do configu_'}\n` +
    `**Członkowie:** ${czlonkowie.total} / ${panstwo.limit_czlonkow}`
  ));
  c.addSeparatorComponents(separator(true));

  const lista = czlonkowie.strona.length
    ? czlonkowie.strona.map((cz, i) => {
        const num = (strona - 1) * czlonkowie.naStrone + i + 1;
        const status = cz.status === 'zastepca' ? ` — *${statusy.zastepca}*` : '';
        const marker = listyGoncze.has(cz.nick.toLowerCase()) ? ' `[LIST GOŃCZY]`' : '';
        return `\`${String(num).padStart(2, '0')}\` **${cz.nick}**${status}${marker}`;
      }).join('\n')
    : '_Brak członków. Dodaj pierwszego przyciskiem poniżej._';

  c.addTextDisplayComponents(tekst(lista));
  c.addTextDisplayComponents(tekst(`-# Strona ${strona} z ${stron} • Tylko ${statusy.krol.toLowerCase()} może dodawać, usuwać i zmieniać statusy.`));
  c.addSeparatorComponents(separator(false));

  const rowAkcje = new ActionRowBuilder().addComponents(
    przycisk(`panstwo:dodaj:${panstwo.id}`, 'Dodaj nick', ButtonStyle.Success),
    przycisk(`panstwo:status:${panstwo.id}:${strona}`, 'Zmień status', ButtonStyle.Primary, null, czlonkowie.total === 0),
    przycisk(`panstwo:usun:${panstwo.id}:${strona}`, 'Usuń nick', ButtonStyle.Danger, null, czlonkowie.total === 0),
  );
  c.addActionRowComponents(rowAkcje);

  if (stron > 1) {
    const rowNav = new ActionRowBuilder().addComponents(
      przycisk(`panstwo:str:${panstwo.id}:${strona - 1}`, '‹ Poprzednia', ButtonStyle.Secondary, null, strona === 1),
      przycisk(`panstwo:str:${panstwo.id}:${strona + 1}`, 'Następna ›', ButtonStyle.Secondary, null, strona === stron),
    );
    c.addActionRowComponents(rowNav);
  }
  return { components: [c], ...FLAGS_V2 };
}

// ---- Lista sojuszu (/sojusz-lista) -------------------------------------

function przyciskConfigu() {
  return przycisk('sojuszlista:config', 'Config dla moda', ButtonStyle.Success, '📄');
}

function kartaListySojuszu({ wpisy, strona, stron, liczbaPanstw, liczbaGraczy, statusy }) {
  const c = kontener(kolory.info);
  c.addTextDisplayComponents(tekst('## Sojusz Narodów Zjednoczonych — państwa'));
  c.addTextDisplayComponents(tekst(`-# Państw: ${liczbaPanstw} • Graczy: ${liczbaGraczy}`));
  c.addSeparatorComponents(separator(true));

  if (!wpisy.length) {
    c.addTextDisplayComponents(tekst('_Brak zarejestrowanych państw._'));
  } else {
    c.addTextDisplayComponents(tekst(wpisy.map(({ panstwo, sklad }) => {
      const krol = sklad.find(o => o.status === 'krol');
      const zastepcy = sklad.filter(o => o.status === 'zastepca').map(o => `\`${o.nick}\``);
      const czlonkow = sklad.filter(o => o.status === 'czlonek').length;
      return `### ${panstwo.nazwa}${panstwo.sojusznik ? '' : ' — `POZA SOJUSZEM`'}\n` +
        `**${statusy.krol}:** ${krol ? `\`${krol.nick}\`` : '_brak_'}${panstwo.lider_id ? ` (<@${panstwo.lider_id}>)` : ''}\n` +
        `**${statusy.zastepca}:** ${zastepcy.length ? zastepcy.slice(0, 5).join(', ') + (zastepcy.length > 5 ? ` +${zastepcy.length - 5}` : '') : '_brak_'}\n` +
        `**Członków:** ${czlonkow} • **Razem:** ${sklad.length}`;
    }).join('\n')));
    c.addTextDisplayComponents(tekst(`-# Strona ${strona} z ${stron} • Wybierz państwo z listy, aby zobaczyć wszystkich graczy.`));
  }
  c.addSeparatorComponents(separator(false));

  if (wpisy.length) {
    c.addActionRowComponents(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('sojuszlista:panstwo')
        .setPlaceholder('Pokaż skład państwa')
        .addOptions(wpisy.map(({ panstwo, sklad }) => new StringSelectMenuOptionBuilder()
          .setLabel(panstwo.nazwa.slice(0, 100))
          .setValue(String(panstwo.id))
          .setDescription(`${sklad.length} graczy`)))
    ));
  }
  const przyciski = [];
  if (stron > 1) {
    przyciski.push(
      przycisk(`sojuszlista:str:${strona - 1}`, '‹ Poprzednia', ButtonStyle.Secondary, null, strona === 1),
      przycisk(`sojuszlista:str:${strona + 1}`, 'Następna ›', ButtonStyle.Secondary, null, strona === stron),
    );
  }
  przyciski.push(przyciskConfigu());
  c.addActionRowComponents(new ActionRowBuilder().addComponents(...przyciski));
  return { components: [c], ...FLAGS_V2 };
}

function kartaSkladuPanstwa({ panstwo, sklad, strona, stron, naStrone, total, statusy }) {
  const c = kontener(panstwo.sojusznik ? kolory.info : kolory.neutralny);
  c.addTextDisplayComponents(tekst(`## ${panstwo.nazwa}`));
  c.addTextDisplayComponents(tekst(`-# ${panstwo.sojusznik ? 'Państwo w sojuszu' : 'Państwo poza sojuszem'} • Graczy: ${total}`));
  c.addSeparatorComponents(separator(true));
  c.addTextDisplayComponents(tekst(sklad.length
    ? sklad.map((o, i) => `\`${String((strona - 1) * naStrone + i + 1).padStart(2, '0')}\` **${o.nick}** — ${statusy[o.status]}`).join('\n')
    : '_Brak graczy w tym państwie._'));
  c.addTextDisplayComponents(tekst(`-# Strona ${strona} z ${stron}`));
  c.addSeparatorComponents(separator(false));
  const przyciski = [przycisk('sojuszlista:str:1', '‹ Wróć do listy', ButtonStyle.Secondary)];
  if (stron > 1) {
    przyciski.push(
      przycisk(`sojuszlista:czl:${panstwo.id}:${strona - 1}`, '‹', ButtonStyle.Secondary, null, strona === 1),
      przycisk(`sojuszlista:czl:${panstwo.id}:${strona + 1}`, '›', ButtonStyle.Secondary, null, strona === stron),
    );
  }
  przyciski.push(przyciskConfigu());
  c.addActionRowComponents(new ActionRowBuilder().addComponents(...przyciski));
  return { components: [c], ...FLAGS_V2 };
}

function kartaConfigu({ nazwaPliku, liczbaWpisow, podglad = null }) {
  const c = kontener(kolory.sukces);
  c.addTextDisplayComponents(tekst('## Config sojuszu dla moda'));
  c.addSeparatorComponents(separator(true));
  c.addTextDisplayComponents(tekst(
    `Aktualna lista graczy wszystkich państw (**${liczbaWpisow}** wpisów).\n` +
    `Pobierz plik \`${nazwaPliku}\` i wrzuć go do folderu configu moda.`
  ));
  if (podglad) c.addTextDisplayComponents(tekst(`\`\`\`json\n${podglad}\n\`\`\``));
  c.addFileComponents(new FileBuilder().setURL(`attachment://${nazwaPliku}`));
  return { components: [c], ...FLAGS_V2 };
}

// ---- List gończy -------------------------------------------------------

function kartaListuGonczego({ list, glowaUrl, panstwoWystawcy = null, nagrody = [] }) {
  const kolor = list.status === 'aktywny' ? kolory.ostrzezenie
    : list.status === 'zrealizowany' ? kolory.sukces
    : list.status === 'wygasly' ? kolory.neutralny
    : kolory.info;
  const c = kontener(kolor);
  const statusLabel = {
    aktywny: 'AKTYWNY',
    oczekuje: 'OCZEKUJE NA ZATWIERDZENIE',
    zrealizowany: 'ZREALIZOWANY',
    wygasly: 'WYGASŁY',
    odrzucony: 'ODRZUCONY',
  }[list.status] || list.status.toUpperCase();

  c.addTextDisplayComponents(tekst(`## List gończy #${list.id} — ${statusLabel}`));
  c.addSeparatorComponents(separator(true));

  const sec = new SectionBuilder()
    .addTextDisplayComponents(
      tekst(`**Poszukiwany:** \`${list.nick}\``),
      tekst(`**Powód:** ${list.powod}`),
      tekst(`**Nagroda:** ${list.nagroda || (nagrody.length ? '—' : 'brak')}`),
    )
    .setThumbnailAccessory(new ThumbnailBuilder().setURL(glowaUrl));
  c.addSectionComponents(sec);

  if (nagrody.length) {
    const ostatnie = nagrody.slice(-10);
    c.addTextDisplayComponents(tekst(
      `**Dołożone nagrody (${nagrody.length}):**\n` +
      (nagrody.length > ostatnie.length ? `-# …oraz ${nagrody.length - ostatnie.length} wcześniejszych\n` : '') +
      ostatnie.map(n => `• ${n.nagroda} — <@${n.user_id}>`).join('\n')
    ));
  }

  c.addSeparatorComponents(separator(true));
  c.addTextDisplayComponents(tekst(
    `**Wystawca:** <@${list.wystawca_id}>${panstwoWystawcy ? ` (${panstwoWystawcy})` : ''}\n` +
    `**Wygasa:** ${list.wygasa ? `<t:${Math.floor(list.wygasa / 1000)}:R>` : 'bezterminowo'}`
  ));

  if (list.status === 'aktywny') {
    c.addSeparatorComponents(separator(false));
    c.addActionRowComponents(new ActionRowBuilder().addComponents(
      przycisk(`list:zglos:${list.id}`, 'Zgłoś zatrzymanie', ButtonStyle.Primary),
      przycisk(`list:nagroda:${list.id}`, 'Dołóż nagrodę', ButtonStyle.Success, '💰'),
      ...(nagrody.length ? [przycisk(`list:nagrody-edytuj:${list.id}`, 'Edytuj nagrody', ButtonStyle.Secondary, '💱')] : []),
      przycisk(`list:edytuj:${list.id}`, 'Edytuj (lider/staff)', ButtonStyle.Secondary, '✏️'),
      przycisk(`list:zamknij:${list.id}`, 'Zamknij list', ButtonStyle.Danger),
    ));
  }
  return { components: [c], ...FLAGS_V2 };
}

function kartaListyListow({ status, listy, total, strona, stron, guildId, czyStaff }) {
  const tytuly = { aktywne: 'Aktywne listy gończe', oczekujace: 'Listy czekające na zatwierdzenie', zakonczone: 'Zakończone listy gończe' };
  const c = kontener(status === 'aktywne' ? kolory.ostrzezenie : kolory.info);
  c.addTextDisplayComponents(tekst(`## ${tytuly[status] || tytuly.aktywne}`));
  c.addTextDisplayComponents(tekst(`-# Razem: ${total}${stron > 1 ? ` • strona ${strona} z ${stron}` : ''}`));
  c.addSeparatorComponents(separator(true));
  c.addTextDisplayComponents(tekst(listy.length
    ? listy.map(l => {
        const link = l.wiadomosc_id && l.kanal_id ? ` — [karta](https://discord.com/channels/${guildId}/${l.kanal_id}/${l.wiadomosc_id})` : '';
        const nagroda = l.nagroda || l.dolozone ? `\n╰ 💰 ${l.nagroda || '—'}${l.dolozone ? ` (+${l.dolozone} dołożonych)` : ''}` : '';
        const koniec = l.status === 'aktywny'
          ? (l.wygasa ? ` • wygasa <t:${Math.floor(l.wygasa / 1000)}:R>` : ' • bez limitu czasu')
          : ` • ${l.status}`;
        return `\`#${l.id}\` **${l.nick}**${koniec}${link}\n╰ ${l.powod.slice(0, 90)}${l.powod.length > 90 ? '…' : ''}${nagroda}`;
      }).join('\n')
    : '_Brak listów w tej kategorii._'));
  c.addSeparatorComponents(separator(false));
  const przyciski = [
    przycisk('listy:str:aktywne:1', 'Aktywne', status === 'aktywne' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    przycisk('listy:str:zakonczone:1', 'Zakończone', status === 'zakonczone' ? ButtonStyle.Primary : ButtonStyle.Secondary),
  ];
  if (czyStaff) przyciski.push(przycisk('listy:str:oczekujace:1', 'Oczekujące', status === 'oczekujace' ? ButtonStyle.Primary : ButtonStyle.Secondary));
  c.addActionRowComponents(new ActionRowBuilder().addComponents(...przyciski));
  if (stron > 1) {
    c.addActionRowComponents(new ActionRowBuilder().addComponents(
      przycisk(`listy:str:${status}:${strona - 1}`, '‹ Poprzednia', ButtonStyle.Secondary, null, strona === 1),
      przycisk(`listy:str:${status}:${strona + 1}`, 'Następna ›', ButtonStyle.Secondary, null, strona === stron),
    ));
  }
  return { components: [c], ...FLAGS_V2 };
}

function kartaZgloszeniaListu({ list, zgloszenie }) {
  const status = { zatwierdzone: '✅ zatwierdzone', odrzucone: '❌ odrzucone' }[zgloszenie.status];
  const c = kontener(zgloszenie.status === 'zatwierdzone' ? kolory.sukces : zgloszenie.status === 'odrzucone' ? kolory.blad : kolory.info);
  c.addTextDisplayComponents(tekst(`## Zgłoszenie zatrzymania #${zgloszenie.id} — list #${list.id}`));
  c.addSeparatorComponents(separator(true));
  c.addTextDisplayComponents(tekst(
    `**Poszukiwany:** \`${list.nick}\`\n` +
    `**Powód listu:** ${list.powod}\n` +
    `**Zgłaszający:** <@${zgloszenie.zglaszajacy_id}>${zgloszenie.zglaszajacy_dodany ? ' _(dodany do kanału)_' : ''}\n` +
    `**Wysłane:** <t:${Math.floor(zgloszenie.utworzone / 1000)}:f>` +
    (status ? `\n**Decyzja:** ${status}${zgloszenie.rozpatrzyl ? ` — <@${zgloszenie.rozpatrzyl}>` : ''}` : '')
  ));
  c.addSeparatorComponents(separator(true));
  c.addTextDisplayComponents(tekst(`**Opis:**\n${zgloszenie.dowod}${zgloszenie.link ? `\n\n**Link:** ${zgloszenie.link}` : ''}`));
  if (zgloszenie.status === 'oczekuje') {
    c.addTextDisplayComponents(tekst('-# Dowody (pliki) są w wiadomości poniżej. Zgłaszający nie widzi tego kanału, dopóki go nie dodacie.'));
    c.addSeparatorComponents(separator(false));
    const przyciski = [
      przycisk(`list:zgl:ok:${zgloszenie.id}`, 'Zatwierdź', ButtonStyle.Success),
      przycisk(`list:zgl:no:${zgloszenie.id}`, 'Odrzuć', ButtonStyle.Danger),
    ];
    if (zgloszenie.kanal_id) {
      przyciski.push(przycisk(`list:zgl-dodaj:${zgloszenie.id}`, zgloszenie.zglaszajacy_dodany ? 'Zgłaszający dodany' : 'Dodaj zgłaszającego do kanału',
        ButtonStyle.Secondary, null, Boolean(zgloszenie.zglaszajacy_dodany)));
    }
    c.addActionRowComponents(new ActionRowBuilder().addComponents(...przyciski));
  }
  return { components: [c], ...FLAGS_V2 };
}

// Dowody zatrzymania: zdjęcia/nagrania jako galeria, inne pliki jako załączniki, za duże jako linki
function kartaDowodowZatrzymania({ pliki = [], linki = [] }) {
  const c = kontener(kolory.neutralny);
  c.addTextDisplayComponents(tekst('### Dowody'));
  const media = pliki.filter(p => /^(image|video)\//.test(p.typ));
  const inne = pliki.filter(p => !/^(image|video)\//.test(p.typ));
  if (media.length) {
    c.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(
      ...media.map(p => new MediaGalleryItemBuilder().setURL(`attachment://${p.nazwa}`))
    ));
  }
  for (const p of inne) c.addFileComponents(new FileBuilder().setURL(`attachment://${p.nazwa}`));
  if (linki.length) c.addTextDisplayComponents(tekst(linki.map(l => `• ${l}`).join('\n')));
  if (!pliki.length && !linki.length) c.addTextDisplayComponents(tekst('_Brak dowodów._'));
  return { components: [c], ...FLAGS_V2 };
}

// ---- Sąd ---------------------------------------------------------------

function opisPozwanego(sprawa) {
  if (sprawa.pozwany_typ === 'gracz') return `<@${sprawa.pozwany_wartosc}>`;
  if (sprawa.pozwany_typ === 'nick') return `\`${sprawa.pozwany_wartosc}\``;
  return `Państwo **${sprawa.pozwany_wartosc}**`;
}

function kartaSprawy({ sprawa, dowody = [] }) {
  const kolor = {
    zlozona: kolory.info,
    przyjeta: kolory.info,
    w_toku: kolory.ostrzezenie,
    wyrok: kolory.sukces,
    odwolanie: kolory.ostrzezenie,
    zamknieta: kolory.neutralny,
  }[sprawa.status] || kolory.neutralny;

  const c = kontener(kolor);
  c.addTextDisplayComponents(tekst(`## Sprawa ${sprawa.numer}`));
  c.addSeparatorComponents(separator(true));
  c.addTextDisplayComponents(tekst(
    `**Pozywający:** <@${sprawa.pozywajacy_id}>\n` +
    `**Pozwany:** ${opisPozwanego(sprawa)}\n` +
    `**Sędzia:** ${sprawa.sedzia_id ? `<@${sprawa.sedzia_id}>` : '_oczekuje na przyjęcie_'}\n` +
    `**Status:** ${sprawa.status.replace('_', ' ')}\n` +
    `**Data złożenia:** <t:${Math.floor(sprawa.utworzona / 1000)}:f>`
  ));
  c.addSeparatorComponents(separator(true));
  c.addTextDisplayComponents(tekst(`**Zarzut:** ${sprawa.zarzut}\n\n**Opis:**\n${sprawa.opis}`));

  if (sprawa.dowody) {
    c.addSeparatorComponents(separator(true));
    c.addTextDisplayComponents(tekst(`**Dowody wstępne:**\n${sprawa.dowody}`));
  }

  if (dowody.length) {
    c.addSeparatorComponents(separator(true));
    c.addTextDisplayComponents(tekst(
      `**Dowody dodatkowe:**\n` +
      dowody.map((d, i) => `\`${i + 1}\` <@${d.user_id}> — ${d.tresc}`).join('\n')
    ));
  }

  if (sprawa.werdykt) {
    c.addSeparatorComponents(separator(true));
    c.addTextDisplayComponents(tekst(`**Werdykt:** ${sprawa.werdykt}\n**Kara:** ${sprawa.kara}`));
  }

  c.addSeparatorComponents(separator(false));

  const przyciski = [];
  if (sprawa.status === 'zlozona' && !sprawa.sedzia_id) {
    przyciski.push(przycisk(`sad:przyjmij:${sprawa.id}`, 'Przyjmij sprawę', ButtonStyle.Success));
  }
  if (['przyjeta', 'w_toku'].includes(sprawa.status) && sprawa.sedzia_id) {
    przyciski.push(
      przycisk(`sad:dowod:${sprawa.id}`, 'Dodaj dowód', ButtonStyle.Secondary),
      przycisk(`sad:wyrok:${sprawa.id}`, 'Wydaj wyrok', ButtonStyle.Primary),
    );
  }
  if (sprawa.status === 'wyrok') {
    c.addTextDisplayComponents(tekst('-# Wyrok jest ostateczny — nie przysługuje od niego odwołanie.'));
    przyciski.push(przycisk(`sad:zamknij:${sprawa.id}`, 'Zamknij sprawę', ButtonStyle.Secondary));
  }
  if (przyciski.length) c.addActionRowComponents(new ActionRowBuilder().addComponents(...przyciski));
  return { components: [c], ...FLAGS_V2 };
}

function kartaWyroku({ sprawa }) {
  const c = kontener(kolory.sukces);
  c.addTextDisplayComponents(tekst(`## Wyrok w sprawie ${sprawa.numer}`));
  c.addSeparatorComponents(separator(true));
  c.addTextDisplayComponents(tekst(
    `**Pozywający:** <@${sprawa.pozywajacy_id}>\n` +
    `**Pozwany:** ${opisPozwanego(sprawa)}\n` +
    `**Sędzia:** <@${sprawa.sedzia_id}>\n` +
    `**Data wyroku:** <t:${Math.floor(sprawa.wyrok_data / 1000)}:f>`
  ));
  c.addSeparatorComponents(separator(true));
  c.addTextDisplayComponents(tekst(`**Werdykt:** ${sprawa.werdykt}\n**Kara:** ${sprawa.kara}`));
  return { components: [c], ...FLAGS_V2 };
}

// ---- Powitania ---------------------------------------------------------

function kartaPowitania({ userId, liczbaCzlonkow, kanalWeryfikacji = null, kanalTicketow = null }) {
  const c = kontener(kolory.info);
  c.addTextDisplayComponents(tekst(`## Witaj w Sojuszu Narodów Zjednoczonych!`));
  c.addSeparatorComponents(separator(true));
  const kroki = [
    kanalWeryfikacji ? `**1.** Zweryfikuj się na <#${kanalWeryfikacji}> — podaj swój nick z Minecrafta.` : '**1.** Zweryfikuj się, podając swój nick z Minecrafta.',
    '**2.** Sprawdź państwa i ich graczy komendą `/sojusz-lista`.',
    kanalTicketow ? `**3.** Masz sprawę do administracji? Otwórz zgłoszenie na <#${kanalTicketow}>.` : '**3.** Masz sprawę do administracji? Otwórz zgłoszenie.',
  ];
  c.addTextDisplayComponents(tekst(`<@${userId}>, jesteś naszym **${liczbaCzlonkow}.** członkiem.\n\n${kroki.join('\n')}`));
  return { components: [c], ...FLAGS_V2 };
}

// ---- Wołanie moderatora ------------------------------------------------

function kartaModCall({ user_id, kanal_id, waiting = true, przyjmujacy = null, status = null }) {
  const anulowane = !waiting && !przyjmujacy;
  const c = kontener(waiting ? kolory.ostrzezenie : anulowane ? kolory.neutralny : kolory.sukces);
  c.addTextDisplayComponents(tekst(waiting ? '## Prośba o pomoc' : anulowane ? '## Prośba nieaktualna' : '## Prośba przyjęta'));
  c.addSeparatorComponents(separator(true));
  c.addTextDisplayComponents(tekst(
    `**Użytkownik:** <@${user_id}>\n` +
    `**Kanał:** <#${kanal_id}>\n` +
    (przyjmujacy ? `**Obsługuje:** <@${przyjmujacy}>` : `**Status:** ${status || 'oczekuje na moderatora'}`)
  ));
  if (waiting) {
    c.addSeparatorComponents(separator(false));
    c.addActionRowComponents(new ActionRowBuilder().addComponents(
      przycisk('modcall:przyjmij', 'Przyjmij zgłoszenie', ButtonStyle.Success)
    ));
  }
  return { components: [c], ...FLAGS_V2 };
}

// ---- Selfrole panel ----------------------------------------------------

function panelSelfrole(grupa, role) {
  const c = kontener(kolory.neutralny);
  c.addTextDisplayComponents(tekst(`## ${grupa.nazwa}`));
  if (grupa.opis) {
    c.addSeparatorComponents(separator(true));
    c.addTextDisplayComponents(tekst(grupa.opis));
  }
  c.addSeparatorComponents(separator(false));
  const select = new StringSelectMenuBuilder()
    .setCustomId(`selfrole:pick:${grupa.id}`)
    .setPlaceholder('Wybierz role')
    .setMinValues(0)
    .setMaxValues(grupa.tryb === 'single' ? 1 : role.length)
    .addOptions(role.map(r => {
      const o = new StringSelectMenuOptionBuilder().setLabel(r.etykieta).setValue(String(r.id));
      if (r.opis) o.setDescription(r.opis.slice(0, 100));
      if (r.emoji) o.setEmoji(r.emoji);
      return o;
    }));
  c.addActionRowComponents(new ActionRowBuilder().addComponents(select));
  return { components: [c], ...FLAGS_V2 };
}

// ---- Ostrzeżenia -------------------------------------------------------

function kartaOstrzezen({ user_id, warny, avatar, waznoscDni = 0, progi = null }) {
  const aktywne = warny.filter(w => !w.nieaktywne).length;
  const c = kontener(aktywne ? kolory.ostrzezenie : kolory.sukces);
  const sec = new SectionBuilder()
    .addTextDisplayComponents(
      tekst(`## Historia ostrzeżeń — <@${user_id}>`),
      tekst(
        `**Aktywnych ostrzeżeń:** ${aktywne} • **wszystkich:** ${warny.length}` +
        (progi ? `\n-# Wyciszenie od ${progi.mute}, ban od ${progi.ban} aktywnych${waznoscDni > 0 ? ` • ostrzeżenie wygasa po ${waznoscDni} dniach` : ''}` : '')
      ),
    )
    .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatar));
  c.addSectionComponents(sec);
  c.addSeparatorComponents(separator(true));
  if (!warny.length) {
    c.addTextDisplayComponents(tekst('_Użytkownik nie posiada ostrzeżeń._'));
  } else {
    const lista = warny.slice(0, 15).map(w =>
      `\`#${w.id}\` <t:${Math.floor(w.data / 1000)}:d> • <@${w.wystawca_id}>${w.nieaktywne ? ` • _nie liczy się (${w.nieaktywne})_` : ''}\n╰ ${w.powod}`
    ).join('\n\n');
    c.addTextDisplayComponents(tekst(lista));
  }
  return { components: [c], ...FLAGS_V2 };
}

module.exports = {
  FLAGS_V2,
  tekst, separator, kontener, przycisk, link,
  kartaInfo, kartaSukces, kartaBlad, kartaOstrzezenie,
  panelWeryfikacji, panelTicketow, kartaTicketu, kartaNotatekTicketu, listaNotatek, kartaWyjasnieniaTicketu, kartaOcenyTicketu,
  kartaWynikuTicketu, kartaHistoriiTicketu, kartaHistoriiUzytkownika, kartaPliku, kartaNarady,
  kartaPanstwa, kartaListySojuszu, kartaSkladuPanstwa, kartaConfigu,
  kartaListuGonczego, kartaZgloszeniaListu, kartaListyListow, kartaDowodowZatrzymania,
  kartaSprawy, kartaWyroku,
  kartaModCall, kartaPowitania,
  panelSelfrole,
  kartaOstrzezen,
};
