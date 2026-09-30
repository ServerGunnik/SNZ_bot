const {
  MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ButtonStyle,
} = require('discord.js');
const db = require('../database/db.js');
const config = require('../config.js');
const karty = require('../utils/karty.js');
const { walidujNick } = require('../utils/minecraft.js');
const { stronicuj } = require('../utils/paginacja.js');
const { log } = require('../utils/logger.js');
const kolory = require('../utils/kolory.js');

const EPHEMERAL_V2 = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;
const STATUSY_CZLONKOW = ['zastepca', 'czlonek'];
const KOLEJNOSC_STATUSOW = { krol: 0, zastepca: 1, czlonek: 2 };

const q = {
  panstwoLidera: db.prepare('SELECT * FROM panstwa WHERE lider_id = ?'),
  panstwoId: db.prepare('SELECT * FROM panstwa WHERE id = ?'),
  wszystkiePanstwa: db.prepare('SELECT * FROM panstwa ORDER BY nazwa COLLATE NOCASE'),
  czlonkowie: db.prepare(`SELECT * FROM panstwa_czlonkowie WHERE panstwo_id = ?
    ORDER BY CASE status WHEN 'zastepca' THEN 0 ELSE 1 END, nick COLLATE NOCASE`),
  czlonekId: db.prepare('SELECT * FROM panstwa_czlonkowie WHERE id = ?'),
  czlonekPoNicku: db.prepare('SELECT * FROM panstwa_czlonkowie WHERE nick = ? COLLATE NOCASE'),
  liczbaCzlonkow: db.prepare('SELECT COUNT(*) c FROM panstwa_czlonkowie WHERE panstwo_id = ?'),
  dodajCzlonka: db.prepare('INSERT INTO panstwa_czlonkowie (panstwo_id, nick, dodany, dodany_przez) VALUES (?, ?, ?, ?)'),
  usunCzlonka: db.prepare('DELETE FROM panstwa_czlonkowie WHERE id = ?'),
  ustawStatus: db.prepare('UPDATE panstwa_czlonkowie SET status = ? WHERE id = ?'),
  nickUsera: db.prepare('SELECT nick FROM weryfikacja WHERE user_id = ?'),
  aktywneListy: db.prepare("SELECT DISTINCT nick FROM listy_goncze WHERE status = 'aktywny'"),
};

function panstwoLidera(userId) {
  return q.panstwoLidera.get(userId);
}

function panstwoPoId(id) {
  return q.panstwoId.get(id);
}

function wszystkiePanstwa() {
  return q.wszystkiePanstwa.all();
}

function aktywneListySet() {
  return new Set(q.aktywneListy.all().map(r => r.nick.toLowerCase()));
}

// Nick Minecraft króla (lidera) z weryfikacji
function nickKrola(panstwo) {
  return panstwo.lider_id ? q.nickUsera.get(panstwo.lider_id)?.nick || null : null;
}

// Pełny skład państwa: król na górze, potem zastępcy i członkowie
function skladPanstwa(panstwo) {
  const krol = nickKrola(panstwo);
  const sklad = krol ? [{ nick: krol, status: 'krol' }] : [];
  for (const c of q.czlonkowie.all(panstwo.id)) {
    if (krol && c.nick.toLowerCase() === krol.toLowerCase()) continue;
    sklad.push({ id: c.id, nick: c.nick, status: STATUSY_CZLONKOW.includes(c.status) ? c.status : 'czlonek' });
  }
  return sklad.sort((a, b) => KOLEJNOSC_STATUSOW[a.status] - KOLEJNOSC_STATUSOW[b.status]);
}

// Config dla moda: [{ nick, allay, status, kingdom }]
function configSojuszu() {
  const wpisy = [];
  for (const panstwo of wszystkiePanstwa()) {
    for (const osoba of skladPanstwa(panstwo)) {
      wpisy.push({
        nick: osoba.nick,
        allay: Boolean(panstwo.sojusznik),
        status: config.panstwa.statusy[osoba.status],
        kingdom: panstwo.nazwa,
      });
    }
  }
  return wpisy;
}

// Dodawać, usuwać i zmieniać statusy może wyłącznie król (lider) państwa
function sprawdzKrola(interaction, panstwo, akcja) {
  if (panstwo && panstwo.lider_id === interaction.user.id) return true;
  interaction.reply({
    ...karty.kartaBlad('Brak uprawnień', `Tylko król państwa może ${akcja}.`),
    flags: EPHEMERAL_V2,
  });
  return false;
}

async function pokazPanstwo(interaction, panstwo, strona = 1) {
  const wszyscy = q.czlonkowie.all(panstwo.id);
  const p = stronicuj(wszyscy, strona, config.panstwa.czlonkowNaStrone);
  const karta = karty.kartaPanstwa({
    panstwo,
    krol: nickKrola(panstwo),
    czlonkowie: { strona: p.strona, total: wszyscy.length, naStrone: config.panstwa.czlonkowNaStrone },
    strona: p.aktualnaStrona,
    stron: p.stron,
    listyGoncze: aktywneListySet(),
    statusy: config.panstwa.statusy,
  });
  const payload = { ...karta, flags: EPHEMERAL_V2 };
  if (interaction.deferred || interaction.replied) return interaction.editReply(payload);
  if (interaction.isMessageComponent && interaction.isMessageComponent()) return interaction.update(payload);
  return interaction.reply(payload);
}

async function onStrona(interaction) {
  const [, , idStr, strStr] = interaction.customId.split(':');
  const panstwo = panstwoPoId(parseInt(idStr, 10));
  if (!sprawdzKrola(interaction, panstwo, 'zarządzać tym panelem')) return;
  return pokazPanstwo(interaction, panstwo, parseInt(strStr, 10));
}

async function onDodaj(interaction) {
  const [, , idStr] = interaction.customId.split(':');
  const panstwo = panstwoPoId(parseInt(idStr, 10));
  if (!sprawdzKrola(interaction, panstwo, 'dodawać członków')) return;
  const modal = new ModalBuilder().setCustomId(`panstwo:modal-dodaj:${panstwo.id}`).setTitle(`Dodaj nick — ${panstwo.nazwa}`.slice(0, 45));
  modal.addComponents(new ActionRowBuilder().addComponents(
    new TextInputBuilder().setCustomId('nick').setLabel('Nick Minecraft').setStyle(TextInputStyle.Short)
      .setMinLength(3).setMaxLength(16).setRequired(true)
  ));
  await interaction.showModal(modal);
}

async function onModalDodaj(interaction) {
  const [, , idStr] = interaction.customId.split(':');
  const panstwo = panstwoPoId(parseInt(idStr, 10));
  if (!sprawdzKrola(interaction, panstwo, 'dodawać członków')) return;
  const nick = interaction.fields.getTextInputValue('nick').trim();
  if (!walidujNick(nick)) {
    return interaction.reply({
      ...karty.kartaBlad('Nieprawidłowy nick', 'Nick musi mieć 3–16 znaków (litery, cyfry, podkreślnik).'),
      flags: EPHEMERAL_V2,
    });
  }
  // Jeden gracz = jedno państwo (także królowie innych państw)
  const istniejacy = q.czlonekPoNicku.get(nick);
  const krolInnego = wszystkiePanstwa().find(p => p.id !== panstwo.id && nickKrola(p)?.toLowerCase() === nick.toLowerCase());
  if (istniejacy || krolInnego) {
    const inne = krolInnego || panstwoPoId(istniejacy.panstwo_id);
    return interaction.reply({
      ...karty.kartaBlad('Nick zajęty', `Nick \`${nick}\` należy już do państwa **${inne?.nazwa || '???'}**.`),
      flags: EPHEMERAL_V2,
    });
  }
  const stan = q.liczbaCzlonkow.get(panstwo.id).c;
  if (stan >= panstwo.limit_czlonkow) {
    return interaction.reply({
      ...karty.kartaBlad('Limit członków', `Państwo osiągnęło limit **${panstwo.limit_czlonkow}** członków.`),
      flags: EPHEMERAL_V2,
    });
  }
  q.dodajCzlonka.run(panstwo.id, nick, Date.now(), interaction.user.id);
  await log(interaction.client, {
    tytul: 'Dodano członka państwa',
    opis: `**Państwo:** ${panstwo.nazwa}\n**Nick:** \`${nick}\`\n**Status:** ${config.panstwa.statusy.czlonek}\n**Dodał:** <@${interaction.user.id}>`,
    kolor: kolory.sukces,
    kanal: 'logiPanstwa',
  });
  await interaction.reply({
    ...karty.kartaSukces('Dodano nick', `\`${nick}\` dołączył do państwa **${panstwo.nazwa}** jako **${config.panstwa.statusy.czlonek}**.\nStatus zmienisz przyciskiem „Zmień status”.`),
    flags: EPHEMERAL_V2,
  });
}

// Select z członkami z bieżącej strony panelu (max 25 opcji)
function selectCzlonkow(customId, panstwo, stronaStr, placeholder) {
  const wszyscy = q.czlonkowie.all(panstwo.id);
  const p = stronicuj(wszyscy, parseInt(stronaStr, 10) || 1, Math.min(config.panstwa.czlonkowNaStrone, 25));
  const select = new StringSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder(`${placeholder} (strona ${p.aktualnaStrona}/${p.stron})`)
    .setMinValues(1).setMaxValues(1)
    .addOptions(p.strona.map(c =>
      new StringSelectMenuOptionBuilder().setLabel(c.nick).setValue(String(c.id))
        .setDescription(config.panstwa.statusy[c.status] || config.panstwa.statusy.czlonek)
    ));
  return { select, puste: wszyscy.length === 0 };
}

async function onUsun(interaction) {
  const [, , idStr, stronaStr] = interaction.customId.split(':');
  const panstwo = panstwoPoId(parseInt(idStr, 10));
  if (!sprawdzKrola(interaction, panstwo, 'usuwać członków')) return;
  const { select, puste } = selectCzlonkow(`panstwo:usun-select:${panstwo.id}`, panstwo, stronaStr, 'Wybierz członka do usunięcia');
  if (puste) {
    return interaction.reply({ ...karty.kartaOstrzezenie('Pusta lista', 'To państwo nie ma członków.'), flags: EPHEMERAL_V2 });
  }
  const c = karty.kontener(kolory.ostrzezenie);
  c.addTextDisplayComponents(karty.tekst(`## Usuń członka — ${panstwo.nazwa}`));
  c.addSeparatorComponents(karty.separator(true));
  c.addTextDisplayComponents(karty.tekst('Wybierz nick z listy poniżej. Operacja jest natychmiastowa.'));
  c.addActionRowComponents(new ActionRowBuilder().addComponents(select));
  await interaction.reply({ components: [c], flags: EPHEMERAL_V2 });
}

async function onUsunSelect(interaction) {
  const [, , idStr] = interaction.customId.split(':');
  const panstwo = panstwoPoId(parseInt(idStr, 10));
  if (!sprawdzKrola(interaction, panstwo, 'usuwać członków')) return;
  const czlonek = q.czlonekId.get(parseInt(interaction.values[0], 10));
  if (!czlonek || czlonek.panstwo_id !== panstwo.id) {
    return interaction.update(karty.kartaOstrzezenie('Brak członka', 'Ten nick został już usunięty.'));
  }
  q.usunCzlonka.run(czlonek.id);
  await log(interaction.client, {
    tytul: 'Usunięto członka państwa',
    opis: `**Państwo:** ${panstwo.nazwa}\n**Nick:** \`${czlonek.nick}\`\n**Usunął:** <@${interaction.user.id}>`,
    kolor: kolory.blad,
    kanal: 'logiPanstwa',
  });
  await interaction.update(karty.kartaSukces('Usunięto', `Nick \`${czlonek.nick}\` został usunięty z państwa **${panstwo.nazwa}**.`));
}

// ---- Zmiana statusu (Zastępca / Członek) -------------------------------

async function onStatus(interaction) {
  const [, , idStr, stronaStr] = interaction.customId.split(':');
  const panstwo = panstwoPoId(parseInt(idStr, 10));
  if (!sprawdzKrola(interaction, panstwo, 'zmieniać statusy')) return;
  const { select, puste } = selectCzlonkow(`panstwo:status-wybor:${panstwo.id}`, panstwo, stronaStr, 'Wybierz członka');
  if (puste) {
    return interaction.reply({ ...karty.kartaOstrzezenie('Pusta lista', 'To państwo nie ma członków.'), flags: EPHEMERAL_V2 });
  }
  const c = karty.kontener(kolory.info);
  c.addTextDisplayComponents(karty.tekst(`## Zmień status — ${panstwo.nazwa}`));
  c.addSeparatorComponents(karty.separator(true));
  c.addTextDisplayComponents(karty.tekst(`Wybierz członka, a potem nowy status. Status **${config.panstwa.statusy.krol}** ma zawsze lider państwa.`));
  c.addActionRowComponents(new ActionRowBuilder().addComponents(select));
  await interaction.reply({ components: [c], flags: EPHEMERAL_V2 });
}

async function onStatusWybor(interaction) {
  const [, , idStr] = interaction.customId.split(':');
  const panstwo = panstwoPoId(parseInt(idStr, 10));
  if (!sprawdzKrola(interaction, panstwo, 'zmieniać statusy')) return;
  const czlonek = q.czlonekId.get(parseInt(interaction.values[0], 10));
  if (!czlonek || czlonek.panstwo_id !== panstwo.id) {
    return interaction.update(karty.kartaOstrzezenie('Brak członka', 'Ten nick został już usunięty.'));
  }
  const c = karty.kontener(kolory.info);
  c.addTextDisplayComponents(karty.tekst(`## Status — \`${czlonek.nick}\``));
  c.addSeparatorComponents(karty.separator(true));
  c.addTextDisplayComponents(karty.tekst(`Obecny status: **${config.panstwa.statusy[czlonek.status] || config.panstwa.statusy.czlonek}**`));
  c.addActionRowComponents(new ActionRowBuilder().addComponents(
    ...STATUSY_CZLONKOW.map(s => karty.przycisk(
      `panstwo:status-ustaw:${panstwo.id}:${czlonek.id}:${s}`,
      config.panstwa.statusy[s],
      s === 'zastepca' ? ButtonStyle.Primary : ButtonStyle.Secondary,
      null,
      czlonek.status === s,
    ))
  ));
  await interaction.update({ components: [c], flags: MessageFlags.IsComponentsV2 });
}

async function onStatusUstaw(interaction) {
  const [, , idStr, czlonekIdStr, status] = interaction.customId.split(':');
  const panstwo = panstwoPoId(parseInt(idStr, 10));
  if (!sprawdzKrola(interaction, panstwo, 'zmieniać statusy')) return;
  const czlonek = q.czlonekId.get(parseInt(czlonekIdStr, 10));
  if (!czlonek || czlonek.panstwo_id !== panstwo.id || !STATUSY_CZLONKOW.includes(status)) {
    return interaction.update(karty.kartaOstrzezenie('Brak członka', 'Ten nick został już usunięty.'));
  }
  q.ustawStatus.run(status, czlonek.id);
  await log(interaction.client, {
    tytul: 'Zmieniono status członka',
    opis: `**Państwo:** ${panstwo.nazwa}\n**Nick:** \`${czlonek.nick}\`\n**Status:** ${config.panstwa.statusy[status]}\n**Zmienił:** <@${interaction.user.id}>`,
    kolor: kolory.info,
    kanal: 'logiPanstwa',
  });
  await interaction.update(karty.kartaSukces('Status zmieniony', `\`${czlonek.nick}\` ma teraz status **${config.panstwa.statusy[status]}**.`));
}

function rejestruj({ zarejestruj }) {
  zarejestruj('panstwo:str', onStrona);
  zarejestruj('panstwo:dodaj', onDodaj);
  zarejestruj('panstwo:modal-dodaj', onModalDodaj);
  zarejestruj('panstwo:usun', onUsun);
  zarejestruj('panstwo:usun-select', onUsunSelect);
  zarejestruj('panstwo:status', onStatus);
  zarejestruj('panstwo:status-wybor', onStatusWybor);
  zarejestruj('panstwo:status-ustaw', onStatusUstaw);
}

module.exports = {
  rejestruj, pokazPanstwo, panstwoLidera, panstwoPoId,
  wszystkiePanstwa, nickKrola, skladPanstwa, configSojuszu,
};
