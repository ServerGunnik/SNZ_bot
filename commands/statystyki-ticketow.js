const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const db = require('../database/db.js');
const config = require('../config.js');
const karty = require('../utils/karty.js');
const { jestStaff } = require('../utils/uprawnienia.js');

const q = { od: db.prepare('SELECT * FROM tickety WHERE otwarty >= ?') };
const DZIEN_MS = 24 * 60 * 60 * 1000;

function czasSlownie(ms) {
  const min = Math.round(ms / 60000);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return h < 48 ? `${h} h ${min % 60} min` : `${Math.round(h / 24)} dni`;
}

function ranking(mapa, ile = 5) {
  return [...mapa.entries()].sort((a, b) => b[1] - a[1]).slice(0, ile);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('statystyki-ticketow')
    .setDescription('Statystyki zgłoszeń (administracja)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .setDMPermission(false)
    .addIntegerOption(o => o.setName('dni').setDescription('Z ilu ostatnich dni (0 = od początku, domyślnie 30)').setMinValue(0).setMaxValue(3650)),

  async execute(interaction) {
    if (!jestStaff(interaction.member)) {
      return interaction.reply({
        ...karty.kartaBlad('Brak uprawnień', 'Statystyki są dostępne tylko dla administracji.'),
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
    }
    const dni = interaction.options.getInteger('dni') ?? 30;
    const tickety = q.od.all(dni > 0 ? Date.now() - dni * DZIEN_MS : 0);
    const zamkniete = tickety.filter(t => t.status === 'zamkniety' && t.zamkniety);
    const ocenione = tickety.filter(t => t.ocena);

    const kategorie = new Map();
    const wyniki = new Map();
    const zamykajacy = new Map();
    const obslugujacy = new Map();
    for (const t of tickety) {
      kategorie.set(t.kategoria, (kategorie.get(t.kategoria) || 0) + 1);
      if (t.przydzielony) obslugujacy.set(t.przydzielony, (obslugujacy.get(t.przydzielony) || 0) + 1);
    }
    for (const t of zamkniete) {
      if (t.wynik) wyniki.set(t.wynik, (wyniki.get(t.wynik) || 0) + 1);
      if (t.zamknal && t.zamknal !== interaction.client.user.id) zamykajacy.set(t.zamknal, (zamykajacy.get(t.zamknal) || 0) + 1);
    }
    const sredniCzas = zamkniete.length
      ? zamkniete.reduce((s, t) => s + (t.zamkniety - t.otwarty), 0) / zamkniete.length : null;
    const sredniaOcena = ocenione.length
      ? (ocenione.reduce((s, t) => s + t.ocena, 0) / ocenione.length).toFixed(2) : null;

    const linie = (mapa, format) => mapa.size ? ranking(mapa).map(format).join('\n') : '_brak danych_';
    const opis =
      `**Zgłoszeń:** ${tickety.length} • **otwartych:** ${tickety.length - zamkniete.length} • **zamkniętych:** ${zamkniete.length}\n` +
      `**Średni czas obsługi:** ${sredniCzas === null ? '—' : czasSlownie(sredniCzas)}\n` +
      `**Średnia ocena:** ${sredniaOcena === null ? '—' : `${sredniaOcena}/5 (${ocenione.length} ocen)`}\n\n` +
      `### Kategorie\n${linie(kategorie, ([k, n]) => `• ${k}: **${n}**`)}\n\n` +
      `### Wyniki\n${linie(wyniki, ([k, n]) => `• ${config.tickety.wyniki[k] ? `${config.tickety.wyniki[k].emoji} ${config.tickety.wyniki[k].label}` : k}: **${n}**`)}\n\n` +
      `### Najwięcej przejętych\n${linie(obslugujacy, ([id, n], i) => `${i + 1}. <@${id}> — **${n}**`)}\n\n` +
      `### Najwięcej zamkniętych\n${linie(zamykajacy, ([id, n], i) => `${i + 1}. <@${id}> — **${n}**`)}`;

    await interaction.reply({
      ...karty.kartaInfo({ tytul: `Statystyki ticketów — ${dni > 0 ? `ostatnie ${dni} dni` : 'od początku'}`, opis }),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  },
};
