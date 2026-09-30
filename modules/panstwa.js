const {
  MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
} = require('discord.js');
const db = require('../database/db.js');
const config = require('../config.js');
const karty = require('../utils/karty.js');
const { walidujNick } = require('../utils/minecraft.js');
const { jestStaff, jestLider } = require('../utils/uprawnienia.js');
const { stronicuj } = require('../utils/paginacja.js');
const { log } = require('../utils/logger.js');
const kolory = require('../utils/kolory.js');

const q = {
  panstwoLidera: db.prepare('SELECT * FROM panstwa WHERE lider_id = ?'),
  panstwoId: db.prepare('SELECT * FROM panstwa WHERE id = ?'),
  czlonkowie: db.prepare('SELECT * FROM panstwa_czlonkowie WHERE panstwo_id = ? ORDER BY nick COLLATE NOCASE'),
  czlonekPoNicku: db.prepare('SELECT * FROM panstwa_czlonkowie WHERE nick = ? COLLATE NOCASE'),
  liczbaCzlonkow: db.prepare('SELECT COUNT(*) c FROM panstwa_czlonkowie WHERE panstwo_id = ?'),
  dodajCzlonka: db.prepare('INSERT INTO panstwa_czlonkowie (panstwo_id, nick, dodany, dodany_przez) VALUES (?, ?, ?, ?)'),
  usunCzlonka: db.prepare('DELETE FROM panstwa_czlonkowie WHERE id = ?'),
  aktywneListy: db.prepare("SELECT DISTINCT nick FROM listy_goncze WHERE status = 'aktywny'"),
};

function panstwoLidera(userId) {
  return q.panstwoLidera.get(userId);
}

function panstwoPoId(id) {
  return q.panstwoId.get(id);
}

function aktywneListySet() {
  return new Set(q.aktywneListy.all().map(r => r.nick.toLowerCase()));
}

async function pokazPanstwo(interaction, panstwo, strona = 1) {
  const wszyscy = q.czlonkowie.all(panstwo.id);
  const p = stronicuj(wszyscy, strona, config.panstwa.czlonkowNaStrone);
  const karta = karty.kartaPanstwa({
    panstwo,
    czlonkowie: { strona: p.strona, total: wszyscy.length, naStrone: config.panstwa.czlonkowNaStrone },
    strona: p.aktualnaStrona,
    stron: p.stron,
    listyGoncze: aktywneListySet(),
  });
  const payload = { ...karta, flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral };
  if (interaction.deferred || interaction.replied) return interaction.editReply(payload);
  if (interaction.isMessageComponent && interaction.isMessageComponent()) return interaction.update(payload);
  return interaction.reply(payload);
}

async function onStrona(interaction) {
  const [, , idStr, strStr] = interaction.customId.split(':');
  const panstwo = panstwoPoId(parseInt(idStr, 10));
  if (!panstwo) return;
  if (!jestStaff(interaction.member) && panstwo.lider_id !== interaction.user.id) {
    return interaction.reply({
      ...karty.kartaBlad('Brak uprawnień', 'Nie jesteś liderem tego państwa.'),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  }
  return pokazPanstwo(interaction, panstwo, parseInt(strStr, 10));
}

async function onDodaj(interaction) {
  const [, , idStr] = interaction.customId.split(':');
  const panstwo = panstwoPoId(parseInt(idStr, 10));
  if (!panstwo || (panstwo.lider_id !== interaction.user.id && !jestStaff(interaction.member))) {
    return interaction.reply({
      ...karty.kartaBlad('Brak uprawnień', 'Tylko lider państwa może dodawać członków.'),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  }
  const modal = new ModalBuilder().setCustomId(`panstwo:modal-dodaj:${panstwo.id}`).setTitle(`Dodaj nick — ${panstwo.nazwa}`);
  modal.addComponents(new ActionRowBuilder().addComponents(
    new TextInputBuilder().setCustomId('nick').setLabel('Nick Minecraft').setStyle(TextInputStyle.Short)
      .setMinLength(3).setMaxLength(16).setRequired(true)
  ));
  await interaction.showModal(modal);
}

async function onModalDodaj(interaction) {
  const [, , idStr] = interaction.customId.split(':');
  const panstwo = panstwoPoId(parseInt(idStr, 10));
  if (!panstwo) return;
  const nick = interaction.fields.getTextInputValue('nick').trim();
  if (!walidujNick(nick)) {
    return interaction.reply({
      ...karty.kartaBlad('Nieprawidłowy nick', 'Nick musi mieć 3–16 znaków (litery, cyfry, podkreślnik).'),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  }
  const istniejacy = q.czlonekPoNicku.get(nick);
  if (istniejacy) {
    const inne = panstwoPoId(istniejacy.panstwo_id);
    return interaction.reply({
      ...karty.kartaBlad('Nick zajęty', `Nick \`${nick}\` należy już do państwa **${inne?.nazwa || '???'}**.`),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  }
  const stan = q.liczbaCzlonkow.get(panstwo.id).c;
  if (stan >= panstwo.limit_czlonkow) {
    return interaction.reply({
      ...karty.kartaBlad('Limit członków', `Państwo osiągnęło limit **${panstwo.limit_czlonkow}** członków.`),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  }
  q.dodajCzlonka.run(panstwo.id, nick, Date.now(), interaction.user.id);
  await log(interaction.client, {
    tytul: 'Dodano członka państwa',
    opis: `**Państwo:** ${panstwo.nazwa}\n**Nick:** \`${nick}\`\n**Dodał:** <@${interaction.user.id}>`,
    kolor: kolory.sukces,
    kanal: 'logiPanstwa',
  });
  await interaction.reply({
    ...karty.kartaSukces('Dodano nick', `\`${nick}\` dołączył do państwa **${panstwo.nazwa}**.`),
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  });
}

async function onUsun(interaction) {
  const [, , idStr, stronaStr] = interaction.customId.split(':');
  const panstwo = panstwoPoId(parseInt(idStr, 10));
  if (!panstwo || (panstwo.lider_id !== interaction.user.id && !jestStaff(interaction.member))) {
    return interaction.reply({
      ...karty.kartaBlad('Brak uprawnień', 'Tylko lider państwa może usuwać członków.'),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  }
  const wszyscy = q.czlonkowie.all(panstwo.id);
  if (!wszyscy.length) {
    return interaction.reply({
      ...karty.kartaOstrzezenie('Pusta lista', 'To państwo nie ma członków.'),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  }
  // Lista z bieżącej strony panelu (max 25 opcji w selekcie)
  const p = stronicuj(wszyscy, parseInt(stronaStr, 10) || 1, Math.min(config.panstwa.czlonkowNaStrone, 25));
  const select = new StringSelectMenuBuilder()
    .setCustomId(`panstwo:usun-select:${panstwo.id}`)
    .setPlaceholder(`Wybierz członka do usunięcia (strona ${p.aktualnaStrona}/${p.stron})`)
    .setMinValues(1).setMaxValues(1)
    .addOptions(p.strona.map(c =>
      new StringSelectMenuOptionBuilder().setLabel(c.nick).setValue(String(c.id))
    ));
  const c = karty.kontener(kolory.ostrzezenie);
  c.addTextDisplayComponents(karty.tekst(`## Usuń członka — ${panstwo.nazwa}`));
  c.addSeparatorComponents(karty.separator(true));
  c.addTextDisplayComponents(karty.tekst('Wybierz nick z listy poniżej. Operacja jest natychmiastowa.'));
  c.addActionRowComponents(new ActionRowBuilder().addComponents(select));
  await interaction.reply({
    components: [c], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  });
}

async function onUsunSelect(interaction) {
  const [, , idStr] = interaction.customId.split(':');
  const panstwo = panstwoPoId(parseInt(idStr, 10));
  if (!panstwo) return;
  const czlonekId = parseInt(interaction.values[0], 10);
  const czlonek = db.prepare('SELECT * FROM panstwa_czlonkowie WHERE id = ?').get(czlonekId);
  if (!czlonek || czlonek.panstwo_id !== panstwo.id) {
    return interaction.update(karty.kartaOstrzezenie('Brak członka', 'Ten nick został już usunięty.'));
  }
  q.usunCzlonka.run(czlonekId);
  await log(interaction.client, {
    tytul: 'Usunięto członka państwa',
    opis: `**Państwo:** ${panstwo.nazwa}\n**Nick:** \`${czlonek.nick}\`\n**Usunął:** <@${interaction.user.id}>`,
    kolor: kolory.blad,
    kanal: 'logiPanstwa',
  });
  await interaction.update({
    ...karty.kartaSukces('Usunięto', `Nick \`${czlonek.nick}\` został usunięty z państwa **${panstwo.nazwa}**.`),
    flags: MessageFlags.IsComponentsV2,
  });
}

function rejestruj({ zarejestruj }) {
  zarejestruj('panstwo:str', onStrona);
  zarejestruj('panstwo:dodaj', onDodaj);
  zarejestruj('panstwo:modal-dodaj', onModalDodaj);
  zarejestruj('panstwo:usun', onUsun);
  zarejestruj('panstwo:usun-select', onUsunSelect);
}

module.exports = { rejestruj, pokazPanstwo, panstwoLidera, panstwoPoId };
