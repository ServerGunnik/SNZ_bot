// System rekrutacji: dwa kanały głosowe tworzone komendą /recru stworz.
// Poczekalnia: kandydat może wejść, ale nie może mówić (deny Speak na kanale).
// Pokój rekrutacyjny: niewidoczny dla @everyone; staff przenosi kandydata, a bot daje mu
// wtedy osobny overwrite (widok + mówienie), żeby mógł normalnie rozmawiać.
const { PermissionFlagsBits, ChannelType } = require('discord.js');
const db = require('../database/db.js');
const config = require('../config.js');
const { wszechwladny, maRole } = require('../utils/uprawnienia.js');

const q = {
  aktywna: db.prepare('SELECT * FROM rekrutacja WHERE aktywna = 1 ORDER BY id DESC LIMIT 1'),
  wszystkieAktywne: db.prepare('SELECT * FROM rekrutacja WHERE aktywna = 1 ORDER BY id'),
  wstaw: db.prepare('INSERT INTO rekrutacja (kategoria_id, poczekalnia_id, pokoj_id, utworzyl, utworzono) VALUES (?, ?, ?, ?, ?)'),
  zamknij: db.prepare('UPDATE rekrutacja SET aktywna = 0 WHERE id = ?'),
};

const NAZWA_KATEGORII = 'Rekrutacja';
const NAZWA_POCZEKALNI = '📣 Poczekalnia rekrutacyjna';
const NAZWA_POKOJU = '🎯 Rekrutacja';

function rolaStaffowe() {
  return [...new Set([
    ...config.role.staff, ...config.role.helper,
    ...config.role.lider, ...config.role.sedzia,
  ])];
}

function aktywnaRekrutacja() {
  return q.aktywna.get() || null;
}

// Uprawnienia staffu na kanałach rekrutacyjnych (rozmowa + przenoszenie kandydatów)
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
// Kandydat przeniesiony do pokoju rekrutacyjnego
const UPRAWNIENIA_KANDYDATA = {
  ViewChannel: true, Connect: true, Speak: true, UseVAD: true,
};

// Discord odrzuca cały kanał, jeśli overwrite przyznaje uprawnienie, którego bot sam nie ma,
// albo wskazuje nieistniejącą rolę - dlatego oba przypadki odsiewamy zawczasu.
function tylkoPosiadane(guild, uprawnienia) {
  const bot = guild.members.me?.permissions;
  if (!bot || bot.has(PermissionFlagsBits.Administrator)) return uprawnienia;
  return uprawnienia.filter(p => bot.has(p));
}

function overwrite(guild, staffyIds) {
  const staffu = tylkoPosiadane(guild, UPRAWNIENIA_STAFFU_VOICE);
  return [
    { id: guild.client.user.id, allow: tylkoPosiadane(guild, UPRAWNIENIA_BOTA) },
    ...staffyIds.map(id => ({ id, allow: staffu })),
  ];
}

function brakujaceUprawnieniaBota(guild) {
  const bot = guild.members.me?.permissions;
  if (!bot) return [];
  const wymagane = { ManageChannels: 'Zarządzanie kanałami', ManageRoles: 'Zarządzanie rolami', MoveMembers: 'Przenoszenie członków' };
  return Object.entries(wymagane).filter(([p]) => !bot.has(PermissionFlagsBits[p])).map(([, nazwa]) => nazwa);
}

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

  const brakuje = brakujaceUprawnieniaBota(guild);
  if (brakuje.length) return { blad: `bot nie ma uprawnień: ${brakuje.join(', ')}` };

  // Kategoria "Rekrutacja" - szukamy istniejącej, jeśli nie ma to tworzymy
  let kategoria = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === NAZWA_KATEGORII.toLowerCase());
  let nowaKategoria = false;
  if (!kategoria) {
    try {
      kategoria = await guild.channels.create({
        name: NAZWA_KATEGORII,
        type: ChannelType.GuildCategory,
        reason: 'Rekrutacja: tworzę kategorię',
      });
      nowaKategoria = true;
    } catch (e) {
      return { blad: `kategoria: ${e.message}` };
    }
  }
  const sprzatnijKategorie = async () => {
    if (nowaKategoria) await kategoria.delete('Rollback - nieudane tworzenie rekrutacji').catch(() => null);
  };

  const staffyIds = rolaStaffowe().filter(id => guild.roles.cache.has(id));

  // Poczekalnia: wszyscy mogą dołączyć, ale nie mogą mówić ani streamować
  let poczekalnia;
  try {
    poczekalnia = await guild.channels.create({
      name: NAZWA_POCZEKALNI,
      type: ChannelType.GuildVoice,
      parent: kategoria.id,
      reason: 'Rekrutacja: poczekalnia',
      permissionOverwrites: [
        {
          id: guild.id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect],
          deny: [PermissionFlagsBits.Speak, PermissionFlagsBits.UseVAD, PermissionFlagsBits.Stream],
        },
        ...overwrite(guild, staffyIds),
      ],
    });
  } catch (e) {
    await sprzatnijKategorie();
    return { blad: `poczekalnia: ${e.message}` };
  }

  // Pokój rekrutacyjny: niewidoczny dla @everyone, dostępny dla staffu. Kandydat dostaje dostęp
  // dopiero po przeniesieniu przez staff (patrz obsluzZmianeStanuGlosowego).
  let pokoj;
  try {
    pokoj = await guild.channels.create({
      name: NAZWA_POKOJU,
      type: ChannelType.GuildVoice,
      parent: kategoria.id,
      reason: 'Rekrutacja: pokój do rozmowy',
      permissionOverwrites: [
        {
          id: guild.id,
          deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect],
        },
        ...overwrite(guild, staffyIds),
      ],
    });
  } catch (e) {
    await poczekalnia.delete('Rollback - nieudane tworzenie pokoju').catch(() => null);
    await sprzatnijKategorie();
    return { blad: `pokój: ${e.message}` };
  }

  q.wstaw.run(nowaKategoria ? kategoria.id : null, poczekalnia.id, pokoj.id, autorId, Date.now());

  return { kategoria, poczekalnia, pokoj, staffyIds };
}

async function usun(guild, autorTag) {
  const rekrutacje = q.wszystkieAktywne.all();
  if (!rekrutacje.length) return { nic: true };

  const powod = `Rekrutacja zakończona przez ${autorTag}`;
  const usuniete = [];
  const bledy = [];
  for (const rek of rekrutacje) {
    let ok = true;
    for (const [nazwa, id] of [['poczekalnia', rek.poczekalnia_id], ['pokój', rek.pokoj_id]]) {
      const kanal = guild.channels.cache.get(id);
      if (!kanal) continue;
      try {
        await kanal.delete(powod);
        usuniete.push(nazwa);
      } catch (e) {
        ok = false;
        bledy.push(`${nazwa}: ${e.message}`);
      }
    }

    // Kategorię usuwamy tylko jeśli bot ją utworzył i nic w niej nie zostało
    const kategoria = rek.kategoria_id && guild.channels.cache.get(rek.kategoria_id);
    if (kategoria && !guild.channels.cache.some(c => c.parentId === kategoria.id)) {
      try {
        await kategoria.delete(powod);
        usuniete.push('kategoria');
      } catch (e) {
        ok = false;
        bledy.push(`kategoria: ${e.message}`);
      }
    }

    // Wpis zostaje aktywny, jeśli coś się nie usunęło - kolejne /recru usun spróbuje ponownie
    if (ok) q.zamknij.run(rek.id);
  }

  return { usuniete, bledy };
}

// Czy użytkownik jest staffem (nie traktujemy go jak kandydata)?
function staffRekrutacji(member) {
  if (!member) return true;
  if (wszechwladny(member)) return true;
  const staffyIds = rolaStaffowe();
  return Boolean(staffyIds.length && maRole(member, staffyIds));
}

// Hook do voiceStateUpdate: kandydat przeniesiony do pokoju dostaje prawo mówienia
async function obsluzZmianeStanuGlosowego(oldState, newState) {
  const rek = aktywnaRekrutacja();
  if (!rek) return;
  const member = newState.member || oldState.member;
  if (!member || member.user.bot) return;
  if (staffRekrutacji(member)) return;

  const wszedlDoPokoju = newState.channelId === rek.pokoj_id && oldState.channelId !== rek.pokoj_id;
  if (!wszedlDoPokoju) return;

  const pokoj = newState.channel;
  if (pokoj) {
    await pokoj.permissionOverwrites.edit(member.id, UPRAWNIENIA_KANDYDATA, { reason: 'Rekrutacja: kandydat w pokoju' })
      .catch((e) => console.error('[rekrutacja] overwrite kandydata', e.message));
  }
  // Starsza wersja wyciszała kandydatów server-mutem - zdejmujemy go, jeśli został
  if (newState.serverMute) {
    await member.voice.setMute(false, 'Rekrutacja: kandydat w pokoju').catch(() => null);
  }
}

function rejestruj() {}

module.exports = { rejestruj, aktywnaRekrutacja, stworz, usun, obsluzZmianeStanuGlosowego };
