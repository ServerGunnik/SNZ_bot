// System rekrutacji: dwa kanały głosowe tworzone komendą /recru stworz, kandydaci wyciszani
// server-mutem przy dołączeniu do poczekalni, odciszani po przeniesieniu do pokoju rekrutacyjnego.
const { PermissionFlagsBits, ChannelType } = require('discord.js');
const db = require('../database/db.js');
const config = require('../config.js');
const { wszechwladny, maRole } = require('../utils/uprawnienia.js');

const q = {
  aktywna: db.prepare('SELECT * FROM rekrutacja WHERE aktywna = 1 ORDER BY id DESC LIMIT 1'),
  wstaw: db.prepare('INSERT INTO rekrutacja (kategoria_id, poczekalnia_id, pokoj_id, utworzyl, utworzono) VALUES (?, ?, ?, ?, ?)'),
  zamknij: db.prepare('UPDATE rekrutacja SET aktywna = 0 WHERE id = ?'),
};

function rolaStaffowe() {
  return [...new Set([
    ...config.role.staff, ...config.role.helper,
    ...config.role.lider, ...config.role.sedzia,
  ])];
}

function aktywnaRekrutacja() {
  return q.aktywna.get() || null;
}

// Minimalne uprawnienia staffu na kanałach rekrutacyjnych (unikamy niepotrzebnych grantów)
const UPRAWNIENIA_STAFFU_VOICE = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.Connect,
  PermissionFlagsBits.Speak,
  PermissionFlagsBits.UseVAD,
  PermissionFlagsBits.MuteMembers,
  PermissionFlagsBits.DeafenMembers,
  PermissionFlagsBits.MoveMembers,
];
const UPRAWNIENIA_BOTA = [
  ...UPRAWNIENIA_STAFFU_VOICE,
  PermissionFlagsBits.ManageChannels,
];

async function stworz(guild, autorId) {
  const istniejaca = q.aktywna.get();
  if (istniejaca) {
    const poczekalnia = guild.channels.cache.get(istniejaca.poczekalnia_id);
    const pokoj = guild.channels.cache.get(istniejaca.pokoj_id);
    if (poczekalnia || pokoj) {
      return { blad: 'już trwa', istniejaca };
    }
    q.zamknij.run(istniejaca.id);
  }

  // Kategoria "Rekrutacja" - szukamy istniejącej, jeśli nie ma to tworzymy
  let kategoria = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === 'rekrutacja');
  if (!kategoria) {
    try {
      kategoria = await guild.channels.create({
        name: 'Rekrutacja',
        type: ChannelType.GuildCategory,
        reason: 'Rekrutacja: tworzę kategorię',
      });
    } catch (e) {
      return { blad: `kategoria: ${e.message}` };
    }
  }

  const staffyIds = rolaStaffowe();

  // Poczekalnia: wszyscy mogą dołączyć, ale bez mikrofonu (deny Speak). Dodatkowo server-mute przy join.
  let poczekalnia;
  try {
    poczekalnia = await guild.channels.create({
      name: '📣 Poczekalnia rekrutacji',
      type: ChannelType.GuildVoice,
      parent: kategoria.id,
      reason: 'Rekrutacja: poczekalnia',
      permissionOverwrites: [
        {
          id: guild.id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect],
          deny: [PermissionFlagsBits.Speak, PermissionFlagsBits.UseVAD, PermissionFlagsBits.Stream],
        },
        { id: guild.client.user.id, allow: UPRAWNIENIA_BOTA },
        ...staffyIds.map(id => ({ id, allow: UPRAWNIENIA_STAFFU_VOICE })),
      ],
    });
  } catch (e) {
    return { blad: `poczekalnia: ${e.message}` };
  }

  // Pokój rekrutacyjny: niewidoczny dla @everyone, dostępny tylko dla staffu. Staff ręcznie przenosi kandydata.
  // Po przeniesieniu bot auto-unmute (patrz obsluzZmianeStanuGlosowego).
  let pokoj;
  try {
    pokoj = await guild.channels.create({
      name: '🎯 Pokój rekrutacyjny',
      type: ChannelType.GuildVoice,
      parent: kategoria.id,
      reason: 'Rekrutacja: pokój do rozmowy',
      permissionOverwrites: [
        {
          id: guild.id,
          deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect],
        },
        { id: guild.client.user.id, allow: UPRAWNIENIA_BOTA },
        ...staffyIds.map(id => ({ id, allow: UPRAWNIENIA_STAFFU_VOICE })),
      ],
    });
  } catch (e) {
    await poczekalnia.delete('Rollback - nieudane tworzenie pokoju').catch(() => null);
    return { blad: `pokój: ${e.message}` };
  }

  q.wstaw.run(kategoria.id, poczekalnia.id, pokoj.id, autorId, Date.now());

  return { kategoria, poczekalnia, pokoj };
}

async function usun(guild, autorTag) {
  const istniejaca = q.aktywna.get();
  if (!istniejaca) return { nic: true };

  const usuniete = [];
  for (const [nazwa, id] of [['poczekalnia', istniejaca.poczekalnia_id], ['pokój', istniejaca.pokoj_id]]) {
    const kanal = guild.channels.cache.get(id);
    if (!kanal) continue;
    const ok = await kanal.delete(`Rekrutacja zakończona przez ${autorTag}`).then(() => true).catch(() => false);
    if (ok) usuniete.push(nazwa);
  }

  const kategoria = istniejaca.kategoria_id && guild.channels.cache.get(istniejaca.kategoria_id);
  if (kategoria && kategoria.children?.cache.size === 0) {
    await kategoria.delete(`Rekrutacja zakończona przez ${autorTag}`).catch(() => null);
    usuniete.push('kategoria');
  }

  q.zamknij.run(istniejaca.id);
  return { usuniete };
}

// Czy użytkownik jest zwolniony z auto-mute? (staff, właściciel, technik)
function zwolnionyZMute(member) {
  if (!member) return true;
  if (wszechwladny(member)) return true;
  const staffyIds = rolaStaffowe();
  if (staffyIds.length && maRole(member, staffyIds)) return true;
  return false;
}

// Hook do voiceStateUpdate: auto-mute w poczekalni, unmute po wyjściu
async function obsluzZmianeStanuGlosowego(oldState, newState) {
  const rek = aktywnaRekrutacja();
  if (!rek) return;
  const member = newState.member || oldState.member;
  if (!member || member.user.bot) return;
  if (zwolnionyZMute(member)) return;

  const wszedlDoPoczekalni = newState.channelId === rek.poczekalnia_id && oldState.channelId !== rek.poczekalnia_id;
  const wyszedlZPoczekalni = oldState.channelId === rek.poczekalnia_id && newState.channelId !== rek.poczekalnia_id;

  if (wszedlDoPoczekalni && !member.voice.serverMute) {
    await member.voice.setMute(true, 'Rekrutacja: poczekalnia').catch(() => null);
    return;
  }
  // Przeniesienie z poczekalni do pokoju rekrutacyjnego (albo gdziekolwiek dalej) - zdejmujemy mute
  if (wyszedlZPoczekalni && member.voice.serverMute) {
    await member.voice.setMute(false, 'Rekrutacja: opuścił poczekalnię').catch(() => null);
  }
}

function rejestruj() {}

module.exports = { rejestruj, aktywnaRekrutacja, stworz, usun, obsluzZmianeStanuGlosowego };
