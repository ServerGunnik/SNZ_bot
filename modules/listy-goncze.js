const {
  MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder,
} = require('discord.js');
const db = require('../database/db.js');
const config = require('../config.js');
const karty = require('../utils/karty.js');
const { glowaUrl } = require('../utils/minecraft.js');
const { jestStaff } = require('../utils/uprawnienia.js');
const { log, wyslij } = require('../utils/logger.js');
const kolory = require('../utils/kolory.js');

const q = {
  poId: db.prepare('SELECT * FROM listy_goncze WHERE id = ?'),
  zapiszWiad: db.prepare('UPDATE listy_goncze SET wiadomosc_id = ?, kanal_id = ? WHERE id = ?'),
  aktualizujStatus: db.prepare('UPDATE listy_goncze SET status = ?, zamkniety = ?, zamkniety_przez = ? WHERE id = ?'),
  aktywneOWygasajaceDo: db.prepare("SELECT * FROM listy_goncze WHERE status = 'aktywny' AND wygasa IS NOT NULL AND wygasa <= ?"),
  panstwoId: db.prepare('SELECT * FROM panstwa WHERE id = ?'),
  wstawZgloszenie: db.prepare('INSERT INTO listy_zgloszenia (list_id, zglaszajacy_id, dowod, utworzone) VALUES (?, ?, ?, ?)'),
  zgloszenie: db.prepare('SELECT * FROM listy_zgloszenia WHERE id = ?'),
  aktualizujZgloszenie: db.prepare("UPDATE listy_zgloszenia SET status = ?, rozpatrzone = ?, rozpatrzyl = ? WHERE id = ?"),
};

function kartaListuDoWiadomosci(list) {
  const panstwo = list.wystawca_panstwo_id ? q.panstwoId.get(list.wystawca_panstwo_id) : null;
  return karty.kartaListuGonczego({
    list,
    glowaUrl: glowaUrl(list.nick),
    panstwoWystawcy: panstwo?.nazwa || null,
  });
}

async function opublikujList(client, id) {
  const list = q.poId.get(id);
  if (!list) return;
  const kanal = await client.channels.fetch(config.kanaly.listyGoncze).catch(() => null);
  if (!kanal) return;
  const wiad = await kanal.send(kartaListuDoWiadomosci(list));
  q.zapiszWiad.run(wiad.id, kanal.id, id);
}

async function aktualizujWiadomosc(client, id) {
  const list = q.poId.get(id);
  if (!list || !list.wiadomosc_id || !list.kanal_id) return;
  const kanal = await client.channels.fetch(list.kanal_id).catch(() => null);
  if (!kanal) return;
  const wiad = await kanal.messages.fetch(list.wiadomosc_id).catch(() => null);
  if (!wiad) return;
  await wiad.edit(kartaListuDoWiadomosci(list)).catch(() => {});
}

async function zamknijList(client, id, status, przezUserId) {
  q.aktualizujStatus.run(status, Date.now(), przezUserId, id);
  await aktualizujWiadomosc(client, id);
  await log(client, {
    tytul: 'List gończy zamknięty',
    opis: `**#${id}** — status: **${status}**\n**Zamknął:** <@${przezUserId}>`,
    kolor: kolory.info,
  });
}

// Handlery interakcji

async function onZglos(interaction) {
  const [, , idStr] = interaction.customId.split(':');
  const modal = new ModalBuilder().setCustomId(`list:zglos-modal:${idStr}`).setTitle('Zgłoszenie zatrzymania');
  modal.addComponents(new ActionRowBuilder().addComponents(
    new TextInputBuilder().setCustomId('dowod').setLabel('Dowód (opis + link do screena)')
      .setStyle(TextInputStyle.Paragraph).setMinLength(10).setMaxLength(1500).setRequired(true)
  ));
  await interaction.showModal(modal);
}

async function onZglosModal(interaction) {
  const [, , idStr] = interaction.customId.split(':');
  const id = parseInt(idStr, 10);
  const list = q.poId.get(id);
  if (!list || list.status !== 'aktywny') {
    return interaction.reply({
      ...karty.kartaBlad('List zamknięty', 'Ten list nie jest już aktywny.'),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  }
  const dowod = interaction.fields.getTextInputValue('dowod').trim();
  const info = q.wstawZgloszenie.run(id, interaction.user.id, dowod, Date.now());
  const zgloszenie = q.zgloszenie.get(info.lastInsertRowid);
  await wyslij(interaction.client, config.kanaly.logi, karty.kartaZgloszeniaListu({ list, zgloszenie }));
  await interaction.reply({
    ...karty.kartaSukces('Zgłoszenie wysłane', 'Staff rozpatrzy Twoje zgłoszenie.'),
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  });
}

async function onZglosDecyzja(interaction) {
  if (!jestStaff(interaction.member)) {
    return interaction.reply({
      ...karty.kartaBlad('Brak uprawnień', 'Tylko staff.'),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  }
  const [, , decyzja, idStr] = interaction.customId.split(':');
  const zgloszenie = q.zgloszenie.get(parseInt(idStr, 10));
  if (!zgloszenie || zgloszenie.status !== 'oczekuje') {
    return interaction.reply({
      ...karty.kartaOstrzezenie('Już rozpatrzone', 'Ktoś już zajął się tym zgłoszeniem.'),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  }
  const noweStatus = decyzja === 'ok' ? 'zatwierdzone' : 'odrzucone';
  q.aktualizujZgloszenie.run(noweStatus, Date.now(), interaction.user.id, zgloszenie.id);

  if (decyzja === 'ok') {
    await zamknijList(interaction.client, zgloszenie.list_id, 'zrealizowany', interaction.user.id);
  }

  await interaction.update({
    ...karty.kartaSukces('Rozpatrzone', `Zgłoszenie #${zgloszenie.id} → **${noweStatus}**.`),
    flags: MessageFlags.IsComponentsV2,
  });
}

async function onZamknij(interaction) {
  const [, , idStr] = interaction.customId.split(':');
  const id = parseInt(idStr, 10);
  const list = q.poId.get(id);
  if (!list) return;
  if (!jestStaff(interaction.member) && list.wystawca_id !== interaction.user.id) {
    return interaction.reply({
      ...karty.kartaBlad('Brak uprawnień', 'Zamknąć może wystawca lub staff.'),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  }
  await zamknijList(interaction.client, id, 'zrealizowany', interaction.user.id);
  await interaction.reply({
    ...karty.kartaSukces('Zamknięto', `List **#${id}** oznaczony jako zrealizowany.`),
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  });
}

// Cykliczne wygasanie

function uruchomZadaniaCykliczne(client) {
  const tick = async () => {
    const wygasajace = q.aktywneOWygasajaceDo.all(Date.now());
    for (const l of wygasajace) {
      await zamknijList(client, l.id, 'wygasly', client.user.id).catch(() => {});
    }
  };
  setInterval(tick, config.listyGoncze.interwalWygasaniaMs);
  tick();
}

function rejestruj({ zarejestruj }) {
  zarejestruj('list:zglos', onZglos);
  zarejestruj('list:zglos-modal', onZglosModal);
  zarejestruj('list:zgl', onZglosDecyzja);
  zarejestruj('list:zamknij', onZamknij);
}

module.exports = {
  rejestruj,
  opublikujList,
  zamknijList,
  aktualizujWiadomosc,
  kartaListuDoWiadomosci,
  uruchomZadaniaCykliczne,
};
