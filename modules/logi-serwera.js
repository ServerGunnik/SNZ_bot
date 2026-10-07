// Logi zdarzeń serwera (dodatek do logów wiadomości): utworzenie/edycja kanałów oraz nadawanie
// i odbieranie ról użytkownikom. Wszystko trafia na kanał głównych logów (KANAL_LOGI).
// Bot pomija własne akcje (np. tworzenie kanałów ticketów, nadawanie roli po weryfikacji),
// żeby nie zasyfiać logów.
const { AuditLogEvent, ChannelType } = require('discord.js');
const config = require('../config.js');
const { log } = require('../utils/logger.js');
const kolory = require('../utils/kolory.js');

const NAZWY_TYPOW_KANALU = {
  [ChannelType.GuildText]: 'tekstowy',
  [ChannelType.GuildVoice]: 'głosowy',
  [ChannelType.GuildCategory]: 'kategoria',
  [ChannelType.GuildAnnouncement]: 'ogłoszeniowy',
  [ChannelType.GuildStageVoice]: 'sceny',
  [ChannelType.GuildForum]: 'forum',
  [ChannelType.GuildMedia]: 'media',
};

// Nazwy pól w audycie na przyjaźniejsze polskie etykiety do podsumowania zmian
const ETYKIETY_ZMIAN = {
  name: 'nazwa',
  topic: 'opis',
  nsfw: 'NSFW',
  bitrate: 'bitrate',
  user_limit: 'limit użytkowników',
  rate_limit_per_user: 'slow mode (s)',
  parent_id: 'kategoria',
  position: 'pozycja',
  type: 'typ',
  permission_overwrites: 'uprawnienia',
};

function skrocWartosc(w) {
  if (w == null) return '_puste_';
  if (typeof w === 'boolean') return w ? 'tak' : 'nie';
  const s = typeof w === 'string' ? w : JSON.stringify(w);
  return s.length > 80 ? `${s.slice(0, 77)}…` : s;
}

function podsumujZmianyKanalu(changes) {
  if (!Array.isArray(changes) || !changes.length) return '_bez widocznych zmian_';
  return changes.map(z => {
    const etykieta = ETYKIETY_ZMIAN[z.key] || z.key;
    if (z.key === 'permission_overwrites') return `• uprawnienia kanału`;
    const stare = skrocWartosc(z.old);
    const nowe = skrocWartosc(z.new);
    return `• ${etykieta}: \`${stare}\` → \`${nowe}\``;
  }).join('\n');
}

function nazwaKanalu(wpis, guild) {
  const kanal = guild.channels.cache.get(wpis.targetId);
  if (kanal) return `<#${kanal.id}>`;
  // Przy ChannelCreate name zazwyczaj jest w changes
  const name = wpis.changes?.find(z => z.key === 'name')?.new;
  return name ? `**${name}**` : `\`${wpis.targetId}\``;
}

async function logKanalu(client, { tytul, opis }) {
  await log(client, { tytul, opis, kolor: kolory.info, kanal: 'logi' });
}

async function onChannelCreate(wpis, guild) {
  const typ = wpis.changes?.find(z => z.key === 'type')?.new;
  const nazwa = wpis.changes?.find(z => z.key === 'name')?.new || '?';
  const kanal = guild.channels.cache.get(wpis.targetId);
  const opis = `**Kanał:** ${kanal ? `<#${kanal.id}>` : `**${nazwa}**`}\n` +
    `**Typ:** ${NAZWY_TYPOW_KANALU[typ] || typ || '?'}\n` +
    `**Utworzył:** <@${wpis.executorId}>`;
  await logKanalu(guild.client, { tytul: 'Utworzono kanał', opis });
}

async function onChannelUpdate(wpis, guild) {
  const opis = `**Kanał:** ${nazwaKanalu(wpis, guild)}\n` +
    `**Zmienił:** <@${wpis.executorId}>\n` +
    `**Zmiany:**\n${podsumujZmianyKanalu(wpis.changes)}`;
  await logKanalu(guild.client, { tytul: 'Zmieniono kanał', opis });
}

async function onMemberRoleUpdate(wpis, guild) {
  const dodane = (wpis.changes || []).filter(z => z.key === '$add').flatMap(z => z.new || []);
  const usuniete = (wpis.changes || []).filter(z => z.key === '$remove').flatMap(z => z.new || []);
  if (!dodane.length && !usuniete.length) return;

  const sformatuj = (lista) => lista.map(r => guild.roles.cache.has(r.id) ? `<@&${r.id}>` : `\`${r.name || r.id}\``).join(', ');

  if (dodane.length) {
    await logKanalu(guild.client, {
      tytul: 'Nadano role',
      opis: `**Komu:** <@${wpis.targetId}>\n**Role:** ${sformatuj(dodane)}\n**Nadał:** <@${wpis.executorId}>`,
    });
  }
  if (usuniete.length) {
    await logKanalu(guild.client, {
      tytul: 'Odebrano role',
      opis: `**Komu:** <@${wpis.targetId}>\n**Role:** ${sformatuj(usuniete)}\n**Odebrał:** <@${wpis.executorId}>`,
    });
  }
}

function liniaPowodu(wpis) {
  return wpis.reason ? `\n**Powód:** ${wpis.reason}` : '';
}

async function onBanAdd(wpis, guild) {
  await log(guild.client, {
    tytul: 'Ban',
    opis: `**Kogo:** <@${wpis.targetId}> (\`${wpis.targetId}\`)\n**Zbanował:** <@${wpis.executorId}>${liniaPowodu(wpis)}`,
    kolor: kolory.blad,
    kanal: 'logi',
  });
}

async function onBanRemove(wpis, guild) {
  await log(guild.client, {
    tytul: 'Odbanowano',
    opis: `**Kogo:** <@${wpis.targetId}> (\`${wpis.targetId}\`)\n**Odbanował:** <@${wpis.executorId}>${liniaPowodu(wpis)}`,
    kolor: kolory.sukces,
    kanal: 'logi',
  });
}

async function onKick(wpis, guild) {
  await log(guild.client, {
    tytul: 'Kick',
    opis: `**Kogo:** <@${wpis.targetId}> (\`${wpis.targetId}\`)\n**Wyrzucił:** <@${wpis.executorId}>${liniaPowodu(wpis)}`,
    kolor: kolory.ostrzezenie,
    kanal: 'logi',
  });
}

// Discord trzyma mute (timeout) w polu communication_disabled_until - data wygaśnięcia albo null
async function onMemberUpdate(wpis, guild) {
  const zmiana = (wpis.changes || []).find(z => z.key === 'communication_disabled_until');
  if (!zmiana) return;
  const stare = zmiana.old ? new Date(zmiana.old).getTime() : 0;
  const nowe = zmiana.new ? new Date(zmiana.new).getTime() : 0;
  const teraz = Date.now();

  // Nałożenie mute (nowa data w przyszłości)
  if (nowe > teraz) {
    const czasW = Math.max(1, Math.round((nowe - teraz) / 60000));
    await log(guild.client, {
      tytul: 'Mute (timeout)',
      opis: `**Kogo:** <@${wpis.targetId}>\n**Czas:** ${czasW} min (do <t:${Math.floor(nowe / 1000)}:f>)\n**Wyciszył:** <@${wpis.executorId}>${liniaPowodu(wpis)}`,
      kolor: kolory.ostrzezenie,
      kanal: 'logi',
    });
    return;
  }

  // Zdjęcie mute (nowa data pusta/przeszłość, a stara była w przyszłości)
  if (stare > teraz && (!nowe || nowe <= teraz)) {
    await log(guild.client, {
      tytul: 'Zdjęto mute',
      opis: `**Kogo:** <@${wpis.targetId}>\n**Zdjął:** <@${wpis.executorId}>${liniaPowodu(wpis)}`,
      kolor: kolory.sukces,
      kanal: 'logi',
    });
  }
}

// --- Dołączenia i opuszczenia serwera (poza pipeline'em audit log) ---

async function onCzlonekDolaczyl(member) {
  if (config.guildId && member.guild.id !== config.guildId) return;
  if (member.user.bot) return; // boty mają osobny log (blokada-botów)
  const wiekMs = Date.now() - member.user.createdTimestamp;
  const wiekDni = Math.floor(wiekMs / (24 * 60 * 60 * 1000));
  const mlodeKonto = wiekDni < 7;
  await log(member.client, {
    tytul: 'Dołączył na serwer',
    opis: `**Użytkownik:** <@${member.id}> (\`${member.user.tag}\`)\n` +
      `**Konto utworzone:** <t:${Math.floor(member.user.createdTimestamp / 1000)}:f> (${wiekDni} dni temu)` +
      (mlodeKonto ? '\n⚠️ **Młode konto** — zwiększone ryzyko spamu/raidu' : ''),
    kolor: mlodeKonto ? kolory.ostrzezenie : kolory.sukces,
    kanal: 'logi',
  });
}

async function onCzlonekOpuscil(member) {
  if (config.guildId && member.guild.id !== config.guildId) return;
  if (member.user.bot) return;
  const dolaczylTekst = member.joinedTimestamp
    ? ` (był tu od <t:${Math.floor(member.joinedTimestamp / 1000)}:R>)`
    : '';
  await log(member.client, {
    tytul: 'Opuścił serwer',
    opis: `**Użytkownik:** <@${member.id}> (\`${member.user.tag}\`)${dolaczylTekst}\n` +
      '-# Jeśli to był ban/kick, osobny wpis pojawi się obok.',
    kolor: kolory.neutralny,
    kanal: 'logi',
  });
}

async function obsluzWpisAudytu(wpis, guild) {
  if (!wpis || !guild) return;
  if (config.guildId && guild.id !== config.guildId) return;
  // Pomijamy akcje samego bota (tworzenie ticketów, nadawanie ról po weryfikacji itd.) żeby nie zasyfiać logów
  if (wpis.executorId === guild.client.user.id) return;

  if (wpis.action === AuditLogEvent.ChannelCreate) return onChannelCreate(wpis, guild);
  if (wpis.action === AuditLogEvent.ChannelUpdate) return onChannelUpdate(wpis, guild);
  if (wpis.action === AuditLogEvent.MemberRoleUpdate) return onMemberRoleUpdate(wpis, guild);
  if (wpis.action === AuditLogEvent.MemberBanAdd) return onBanAdd(wpis, guild);
  if (wpis.action === AuditLogEvent.MemberBanRemove) return onBanRemove(wpis, guild);
  if (wpis.action === AuditLogEvent.MemberKick) return onKick(wpis, guild);
  if (wpis.action === AuditLogEvent.MemberUpdate) return onMemberUpdate(wpis, guild);
}

function rejestruj() {}

module.exports = { rejestruj, obsluzWpisAudytu, onCzlonekDolaczyl, onCzlonekOpuscil };
