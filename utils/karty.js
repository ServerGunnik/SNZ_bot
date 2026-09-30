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
    'Wybierz kategorię, aby otworzyć prywatny kanał obsługi. Staff odpowie w możliwie krótkim terminie.\n\n' +
    kategorie.map(k => `• **${k.label}** — ${k.opis}`).join('\n')
  ));
  c.addSeparatorComponents(separator(false));
  const select = new StringSelectMenuBuilder()
    .setCustomId('ticket:kategoria')
    .setPlaceholder('Wybierz kategorię zgłoszenia')
    .addOptions(kategorie.map(k => new StringSelectMenuOptionBuilder()
      .setLabel(k.label).setValue(k.value).setDescription(k.opis.slice(0, 100))));
  c.addActionRowComponents(new ActionRowBuilder().addComponents(select));
  return { components: [c], ...FLAGS_V2 };
}

function kartaTicketu({ ticketId = null, uzytkownik, kategoria, przydzielony = null, temat = null, opis = null }) {
  const c = kontener(kolory.neutralny);
  c.addTextDisplayComponents(tekst(`## Zgłoszenie — ${kategoria}`));
  c.addSeparatorComponents(separator(true));
  c.addTextDisplayComponents(tekst(
    `**Zgłaszający:** <@${uzytkownik}>\n` +
    `**Kategoria:** ${kategoria}\n` +
    `**Obsługuje:** ${przydzielony ? `<@${przydzielony}>` : 'nikt jeszcze'}`
  ));
  c.addSeparatorComponents(separator(true));
  if (temat || opis) {
    c.addTextDisplayComponents(tekst(`### ${temat || 'Opis sprawy'}\n${opis || ''}`));
  } else {
    c.addTextDisplayComponents(tekst('Opisz sprawę w kilku zdaniach. Staff wkrótce się zajmie zgłoszeniem.'));
  }
  c.addTextDisplayComponents(tekst('-# Zgłoszenie zamyka administracja po wpisaniu wyjaśnienia, jak sprawa została rozwiązana.'));
  c.addSeparatorComponents(separator(false));
  c.addActionRowComponents(new ActionRowBuilder().addComponents(
    przycisk('ticket:przejmij', 'Przejmij', ButtonStyle.Primary),
    przycisk('ticket:zamknij', 'Zamknij zgłoszenie', ButtonStyle.Danger)
  ));
  c.addActionRowComponents(new ActionRowBuilder().addComponents(
    przycisk(ticketId ? `ticket:notatki:${ticketId}` : 'ticket:notatki', 'Panel staffu', ButtonStyle.Secondary, '🔒')
  ));
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

function kartaNotatekTicketu({ ticketId, notatki }) {
  const c = kontener(kolory.info);
  c.addTextDisplayComponents(tekst('## 🔒 Panel staffu — notatki'));
  c.addTextDisplayComponents(tekst('-# Widoczne tylko dla administracji. Gracz nie widzi tych notatek.'));
  c.addSeparatorComponents(separator(true));
  c.addTextDisplayComponents(tekst(notatki.length ? listaNotatek(notatki) : '_Brak notatek. Dodaj pierwszą przyciskiem poniżej._'));
  c.addSeparatorComponents(separator(false));
  c.addActionRowComponents(new ActionRowBuilder().addComponents(
    przycisk(`ticket:notatka-dodaj:${ticketId}`, 'Dodaj notatkę', ButtonStyle.Success),
    przycisk(`ticket:notatki:${ticketId}`, 'Odśwież', ButtonStyle.Secondary)
  ));
  return { components: [c], ...FLAGS_V2 };
}

function kartaWyjasnieniaTicketu({ zamykajacy, wyjasnienie }) {
  const c = kontener(kolory.info);
  c.addTextDisplayComponents(tekst('## Wyjaśnienie zgłoszenia'));
  c.addSeparatorComponents(separator(true));
  c.addTextDisplayComponents(tekst(`${wyjasnienie}\n\n**Zamyka:** <@${zamykajacy}>`));
  c.addTextDisplayComponents(tekst('-# Kanał zostanie usunięty za 5 sekund.'));
  return { components: [c], ...FLAGS_V2 };
}

function kartaOcenyTicketu(ticketId, wyjasnienie = null) {
  const c = kontener(kolory.neutralny);
  c.addTextDisplayComponents(tekst('## Oceń obsługę zgłoszenia'));
  c.addSeparatorComponents(separator(true));
  c.addTextDisplayComponents(tekst('Twoje zgłoszenie zostało zamknięte. Wystaw ocenę od 1 do 5 — pomoże nam to podnosić jakość obsługi.'));
  if (wyjasnienie) {
    c.addSeparatorComponents(separator(true));
    c.addTextDisplayComponents(tekst(`**Wyjaśnienie:**\n${wyjasnienie}`));
  }
  c.addSeparatorComponents(separator(false));
  const row = new ActionRowBuilder();
  for (let i = 1; i <= 5; i++) {
    row.addComponents(przycisk(`ticket:ocena:${ticketId}:${i}`, `${i}`, ButtonStyle.Secondary));
  }
  c.addActionRowComponents(row);
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

function kartaListuGonczego({ list, glowaUrl, panstwoWystawcy = null }) {
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
      tekst(`**Nagroda:** ${list.nagroda || 'brak'}`),
    )
    .setThumbnailAccessory(new ThumbnailBuilder().setURL(glowaUrl));
  c.addSectionComponents(sec);

  c.addSeparatorComponents(separator(true));
  c.addTextDisplayComponents(tekst(
    `**Wystawca:** <@${list.wystawca_id}>${panstwoWystawcy ? ` (${panstwoWystawcy})` : ''}\n` +
    `**Wygasa:** ${list.wygasa ? `<t:${Math.floor(list.wygasa / 1000)}:R>` : 'bezterminowo'}`
  ));

  if (list.status === 'aktywny') {
    c.addSeparatorComponents(separator(false));
    c.addActionRowComponents(new ActionRowBuilder().addComponents(
      przycisk(`list:zglos:${list.id}`, 'Zgłoś zatrzymanie', ButtonStyle.Primary),
      przycisk(`list:zamknij:${list.id}`, 'Zamknij list', ButtonStyle.Danger),
    ));
  }
  return { components: [c], ...FLAGS_V2 };
}

function kartaZgloszeniaListu({ list, zgloszenie }) {
  const c = kontener(kolory.info);
  c.addTextDisplayComponents(tekst(`## Zgłoszenie zatrzymania — list #${list.id}`));
  c.addSeparatorComponents(separator(true));
  c.addTextDisplayComponents(tekst(
    `**Poszukiwany:** \`${list.nick}\`\n` +
    `**Zgłaszający:** <@${zgloszenie.zglaszajacy_id}>\n` +
    `**Dowód:**\n${zgloszenie.dowod}`
  ));
  c.addSeparatorComponents(separator(false));
  c.addActionRowComponents(new ActionRowBuilder().addComponents(
    przycisk(`list:zgl:ok:${zgloszenie.id}`, 'Zatwierdź', ButtonStyle.Success),
    przycisk(`list:zgl:no:${zgloszenie.id}`, 'Odrzuć', ButtonStyle.Danger),
  ));
  return { components: [c], ...FLAGS_V2 };
}

// ---- Sąd ---------------------------------------------------------------

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
    `**Pozwany:** ${sprawa.pozwany_typ === 'nick' ? `\`${sprawa.pozwany_wartosc}\`` : `Państwo **${sprawa.pozwany_wartosc}**`}\n` +
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
  const czekaNaSedziego = sprawa.status === 'zlozona' || (sprawa.status === 'odwolanie' && !sprawa.sedzia_id);
  if (czekaNaSedziego) {
    przyciski.push(przycisk(`sad:przyjmij:${sprawa.id}`,
      sprawa.status === 'odwolanie' ? 'Przyjmij odwołanie' : 'Przyjmij sprawę', ButtonStyle.Success));
  }
  if (['przyjeta', 'w_toku', 'odwolanie'].includes(sprawa.status) && sprawa.sedzia_id) {
    przyciski.push(
      przycisk(`sad:dowod:${sprawa.id}`, 'Dodaj dowód', ButtonStyle.Secondary),
      przycisk(`sad:wyrok:${sprawa.id}`, 'Wydaj wyrok', ButtonStyle.Primary),
    );
  }
  if (sprawa.status === 'wyrok' && !sprawa.odwolanie) {
    przyciski.push(przycisk(`sad:odwol:${sprawa.id}`, 'Odwołaj się', ButtonStyle.Danger));
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
    `**Pozwany:** ${sprawa.pozwany_typ === 'nick' ? `\`${sprawa.pozwany_wartosc}\`` : `Państwo **${sprawa.pozwany_wartosc}**`}\n` +
    `**Sędzia:** <@${sprawa.sedzia_id}>\n` +
    `**Data wyroku:** <t:${Math.floor(sprawa.wyrok_data / 1000)}:f>`
  ));
  c.addSeparatorComponents(separator(true));
  c.addTextDisplayComponents(tekst(`**Werdykt:** ${sprawa.werdykt}\n**Kara:** ${sprawa.kara}`));
  return { components: [c], ...FLAGS_V2 };
}

// ---- Wołanie moderatora ------------------------------------------------

function kartaModCall({ user_id, kanal_id, waiting = true, przyjmujacy = null }) {
  const c = kontener(waiting ? kolory.ostrzezenie : kolory.sukces);
  c.addTextDisplayComponents(tekst(waiting ? '## Prośba o pomoc' : '## Prośba przyjęta'));
  c.addSeparatorComponents(separator(true));
  c.addTextDisplayComponents(tekst(
    `**Użytkownik:** <@${user_id}>\n` +
    `**Kanał:** <#${kanal_id}>\n` +
    (przyjmujacy ? `**Obsługuje:** <@${przyjmujacy}>` : '**Status:** oczekuje na moderatora')
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

function kartaOstrzezen({ user_id, warny, avatar }) {
  const c = kontener(warny.length ? kolory.ostrzezenie : kolory.sukces);
  const sec = new SectionBuilder()
    .addTextDisplayComponents(
      tekst(`## Historia ostrzeżeń — <@${user_id}>`),
      tekst(`**Aktywnych ostrzeżeń:** ${warny.length}`),
    )
    .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatar));
  c.addSectionComponents(sec);
  c.addSeparatorComponents(separator(true));
  if (!warny.length) {
    c.addTextDisplayComponents(tekst('_Użytkownik nie posiada ostrzeżeń._'));
  } else {
    const lista = warny.slice(0, 15).map(w =>
      `\`#${w.id}\` <t:${Math.floor(w.data / 1000)}:d> • <@${w.wystawca_id}>\n╰ ${w.powod}`
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
  kartaPanstwa, kartaListySojuszu, kartaSkladuPanstwa, kartaConfigu,
  kartaListuGonczego, kartaZgloszeniaListu,
  kartaSprawy, kartaWyroku,
  kartaModCall,
  panelSelfrole,
  kartaOstrzezen,
};
