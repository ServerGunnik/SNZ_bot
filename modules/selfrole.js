const { MessageFlags, PermissionFlagsBits } = require('discord.js');
const db = require('../database/db.js');
const config = require('../config.js');
const karty = require('../utils/karty.js');
const { maUprawnienia, UPRAWNIENIA_NIE_DLA_SELFROLE } = require('../utils/uprawnienia.js');

const q = {
  grupa: db.prepare('SELECT * FROM selfrole_grupy WHERE id = ?'),
  role: db.prepare('SELECT * FROM selfrole_role WHERE grupa_id = ? ORDER BY id'),
};

// Powód, dla którego roli nie wolno rozdawać przez selfrole (null = można)
function powodBlokadyRoli(rola, guild) {
  if (!rola) return 'rola nie istnieje';
  if (rola.id === guild.id) return 'to rola @everyone';
  if (rola.managed) return 'rola jest zarządzana przez bota/integrację';
  if (maUprawnienia(rola.permissions.bitfield, UPRAWNIENIA_NIE_DLA_SELFROLE)) return 'rola ma uprawnienia administracyjne lub moderacyjne';
  const chronione = Object.values(config.role).flat().filter(Boolean);
  if (chronione.includes(rola.id)) return 'to rola systemowa bota (np. Zweryfikowany, Staff, Lider, Sędzia)';
  const bot = guild.members.me;
  if (bot && rola.position >= bot.roles.highest.position) return 'rola jest wyżej niż najwyższa rola bota';
  if (bot && !bot.permissions.has(PermissionFlagsBits.ManageRoles)) return 'bot nie ma uprawnienia Zarządzanie rolami';
  return null;
}

// Odświeża wystawiony panel grupy po zmianach (albo oznacza go jako nieaktywny po usunięciu grupy)
async function odswiezPanel(client, grupa, usunieta = false) {
  if (!grupa?.kanal_id || !grupa?.wiadomosc_id) return;
  const kanal = await client.channels.fetch(grupa.kanal_id).catch(() => null);
  const wiad = kanal && await kanal.messages.fetch(grupa.wiadomosc_id).catch(() => null);
  if (!wiad) return;
  const role = usunieta ? [] : q.role.all(grupa.id);
  await wiad.edit(role.length
    ? karty.panelSelfrole(grupa, role)
    : karty.kartaInfo({ tytul: grupa.nazwa, opis: '_Ten panel ról jest nieaktywny._' })).catch(() => null);
}

async function onSelect(interaction) {
  const [, , grupaIdStr] = interaction.customId.split(':');
  const grupaId = parseInt(grupaIdStr, 10);
  const grupa = q.grupa.get(grupaId);
  if (!grupa) {
    return interaction.reply({
      ...karty.kartaBlad('Grupa nie istnieje', 'Ten panel jest już nieaktywny.'),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  }

  const dostepne = q.role.all(grupaId);
  const wybraneIds = new Set(interaction.values.map(v => parseInt(v, 10)));
  const dodane = [];
  const usuniete = [];

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const member = interaction.member;
  const pominiete = [];
  for (const wpis of dostepne) {
    const rola = interaction.guild.roles.cache.get(wpis.role_id);
    if (!rola) continue;
    // Rola mogła dostać niebezpieczne uprawnienia już po dodaniu do panelu
    if (powodBlokadyRoli(rola, interaction.guild)) {
      if (wybraneIds.has(wpis.id)) pominiete.push(rola.name);
      continue;
    }
    const czyMa = member.roles.cache.has(rola.id);
    const czyChce = wybraneIds.has(wpis.id);

    // W trybie single, jeśli nie w wybranych - usuń
    if (grupa.tryb === 'single') {
      if (czyChce && !czyMa) { await member.roles.add(rola).catch(() => {}); dodane.push(rola.name); }
      else if (!czyChce && czyMa) { await member.roles.remove(rola).catch(() => {}); usuniete.push(rola.name); }
    } else {
      // multi: toggle względem wybranych vs stanu obecnego
      if (czyChce && !czyMa) { await member.roles.add(rola).catch(() => {}); dodane.push(rola.name); }
      else if (!czyChce && czyMa) { await member.roles.remove(rola).catch(() => {}); usuniete.push(rola.name); }
    }
  }

  const linie = [];
  if (dodane.length) linie.push(`**Dodano:** ${dodane.join(', ')}`);
  if (usuniete.length) linie.push(`**Usunięto:** ${usuniete.join(', ')}`);
  if (pominiete.length) linie.push(`**Niedostępne:** ${pominiete.join(', ')} — zgłoś to administracji.`);
  if (!linie.length) linie.push('Nie dokonano zmian.');

  await interaction.editReply(karty.kartaSukces('Role zaktualizowane', linie.join('\n')));
}

function rejestruj({ zarejestruj }) {
  zarejestruj('selfrole:pick', onSelect);
}

module.exports = { rejestruj, powodBlokadyRoli, odswiezPanel };
