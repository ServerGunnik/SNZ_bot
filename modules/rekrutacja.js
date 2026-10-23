// System rekrutacji: /recru stworz tworzy dwa kanały głosowe, /recru usun je usuwa.
// - „Poczekalnia rekrutacyjna”: każdy może wejść, ale nie może mówić (brak uprawnienia Mów na kanale).
// - „Rekrutacja”: widoczna tylko dla staffu; kandydat przeniesiony tutaj dostaje na czas rozmowy
//   własne uprawnienia do kanału i może normalnie rozmawiać.
// Wyciszenie wynika z uprawnień kanału, a nie z server-mute, więc kandydat, który wyjdzie
// z poczekalni w dowolny sposób, nigdy nie zostaje wyciszony na reszcie serwera.
const { PermissionFlagsBits, ChannelType } = require('discord.js');
const db = require('../database/db.js');
const config = require('../config.js');
const { wszechwladny, maRole } = require('../utils/uprawnienia.js');

const q = {
  aktywna: db.prepare('SELECT * FROM rekrutacja WHERE aktywna = 1 ORDER BY id DESC LIMIT 1'),
  wstaw: db.prepare('INSERT INTO rekrutacja (kategoria_id, kategoria_utworzona, poczekalnia_id, pokoj_id, utworzyl, utworzono) VALUES (?, ?, ?, ?, ?, ?)'),
  zamknij: db.prepare('UPDATE rekrutacja SET aktywna = 0 WHERE id = ?'),
};

const NAZWA_KATEGORII = 'Rekrutacja';
const NAZWA_POCZEKALNI = '📣 Poczekalnia rekrutacyjna';
const NAZWA_POKOJU = '🎯 Rekrutacja';

const P = PermissionFlagsBits;
// Kandydat w pokoju rekrutacyjnym (nadawane na czas rozmowy)
const DOSTEP_KANDYDATA = { ViewChannel: true, Connect: true, Speak: true, UseVAD: true };

function aktywnaRekrutacja() {
  return q.aktywna.get() || null;
}

// Role prowadzące rekrutację, które faktycznie istnieją na serwerze (błędne ID z .env wysypałyby tworzenie kanału)
function roleRekrutujacych(guild) {
  return [...new Set([...config.role.staff, ...config.role.helper])].filter(id => guild.roles.cache.has(id));
}

// Discord odrzuca kanał, w którym bot ustawia uprawnienie, którego sam nie ma - zostawiamy tylko te, które ma
function tylkoPosiadane(guild, lista) {
  const me = guild.members.me;
  if (!me) return lista;
  return lista.filter(p => me.permissions.has(p));
}

function nadpisania(guild, { everyone, bot, rekrutujacy }) {
  const role = roleRekrutujacych(guild);
  return [
    { id: guild.id, allow: tylkoPosiadane(guild, everyone.allow), deny: tylkoPosiadane(guild, everyone.deny) },
    { id: guild.client.user.id, allow: tylkoPosiadane(guild, bot) },
    ...role.map(id => ({ id, allow: tylkoPosiadane(guild, rekrutujacy) })),
  ];
}

async function stworz(guild, autorId) {
  const istniejaca = q.aktywna.get();
  if (istniejaca) {
    if (guild.channels.cache.has(istniejaca.poczekalnia_id) || guild.channels.cache.has(istniejaca.pokoj_id)) {
      return { blad: 'już trwa', istniejaca };
    }
    q.zamknij.run(istniejaca.id); // kanały usunięte ręcznie - zaczynamy od nowa
  }

  const me = guild.members.me;
  if (me && !me.permissions.has(P.ManageChannels)) {
    return { blad: 'Bot nie ma uprawnienia „Zarządzanie kanałami”.' };
  }

  // Kategoria „Rekrutacja”: istniejąca albo nowa (nową usuniemy przy /recru usun)
  let kategoria = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === NAZWA_KATEGORII.toLowerCase());
  let kategoriaUtworzona = false;
  if (!kategoria) {
    try {
      kategoria = await guild.channels.create({ name: NAZWA_KATEGORII, type: ChannelType.GuildCategory, reason: 'Rekrutacja: kategoria' });
      kategoriaUtworzona = true;
    } catch (e) {
      return { blad: `Nie udało się utworzyć kategorii: ${e.message}` };
    }
  }

  const rekrutujacy = [P.ViewChannel, P.Connect, P.Speak, P.UseVAD, P.MoveMembers];
  const bot = [P.ViewChannel, P.Connect, P.Speak, P.MoveMembers, P.ManageChannels];

  let poczekalnia;
  let pokoj;
  try {
    poczekalnia = await guild.channels.create({
      name: NAZWA_POCZEKALNI,
      type: ChannelType.GuildVoice,
      parent: kategoria.id,
      reason: 'Rekrutacja: poczekalnia',
      // Każdy wchodzi, nikt poza rekrutującymi nie mówi
      permissionOverwrites: nadpisania(guild, {
        everyone: { allow: [P.ViewChannel, P.Connect], deny: [P.Speak, P.Stream] },
        bot,
        rekrutujacy,
      }),
    });
    pokoj = await guild.channels.create({
      name: NAZWA_POKOJU,
      type: ChannelType.GuildVoice,
      parent: kategoria.id,
      reason: 'Rekrutacja: pokój rozmowy',
      // Ukryty dla wszystkich; kandydat dostaje dostęp po przeniesieniu
      permissionOverwrites: nadpisania(guild, {
        everyone: { allow: [], deny: [P.ViewChannel, P.Connect] },
        bot,
        rekrutujacy,
      }),
    });
  } catch (e) {
    // Sprzątanie po nieudanej próbie - żadnych osieroconych kanałów
    if (poczekalnia) await poczekalnia.delete('Rekrutacja: wycofanie nieudanego tworzenia').catch(() => null);
    if (kategoriaUtworzona) await kategoria.delete('Rekrutacja: wycofanie nieudanego tworzenia').catch(() => null);
    return { blad: `Nie udało się utworzyć kanałów: ${e.message}` };
  }

  q.wstaw.run(kategoria.id, kategoriaUtworzona ? 1 : 0, poczekalnia.id, pokoj.id, autorId, Date.now());
  return { kategoria, poczekalnia, pokoj, brakMoveMembers: me ? !me.permissions.has(P.MoveMembers) : false };
}

async function usun(guild, autorTag) {
  const istniejaca = q.aktywna.get();
  if (!istniejaca) return { nic: true };

  const powod = `Rekrutacja zakończona przez ${autorTag}`;
  const usuniete = [];
  const nieUsuniete = [];
  for (const [nazwa, id] of [['poczekalnia', istniejaca.poczekalnia_id], ['pokój rekrutacji', istniejaca.pokoj_id]]) {
    const kanal = guild.channels.cache.get(id) || await guild.channels.fetch(id).catch(() => null);
    if (!kanal) continue; // już nie istnieje
    const ok = await kanal.delete(powod).then(() => true).catch(() => false);
    (ok ? usuniete : nieUsuniete).push(nazwa);
  }

  // Kategorię usuwamy tylko, jeśli to bot ją utworzył i nie ma w niej innych kanałów
  const kategoria = istniejaca.kategoria_id && (guild.channels.cache.get(istniejaca.kategoria_id) || await guild.channels.fetch(istniejaca.kategoria_id).catch(() => null));
  if (kategoria && istniejaca.kategoria_utworzona) {
    const pozostale = guild.channels.cache.filter(c => c.parentId === kategoria.id).size;
    if (pozostale === 0) {
      const ok = await kategoria.delete(powod).then(() => true).catch(() => false);
      (ok ? usuniete : nieUsuniete).push('kategoria');
    }
  }

  // Rekord zamykamy tylko, gdy nic nie zostało - inaczej /recru usun można powtórzyć
  if (!nieUsuniete.length) q.zamknij.run(istniejaca.id);
  return { usuniete, nieUsuniete };
}

// Rekrutujący (staff, helper, właściciel, technik) nie potrzebują osobnego dostępu
function rekrutujacy(member) {
  return wszechwladny(member) || maRole(member, [...config.role.staff, ...config.role.helper]);
}

// voiceStateUpdate: kandydat przeniesiony do pokoju dostaje dostęp, po wyjściu go traci
async function obsluzZmianeStanuGlosowego(oldState, newState) {
  const rek = aktywnaRekrutacja();
  if (!rek) return;
  const member = newState.member || oldState.member;
  if (!member || member.user.bot || rekrutujacy(member)) return;

  const wszedlDoPokoju = newState.channelId === rek.pokoj_id && oldState.channelId !== rek.pokoj_id;
  const wyszedlZPokoju = oldState.channelId === rek.pokoj_id && newState.channelId !== rek.pokoj_id;

  if (wszedlDoPokoju) {
    await newState.channel?.permissionOverwrites.edit(member.id, DOSTEP_KANDYDATA, { reason: 'Rekrutacja: kandydat na rozmowie' }).catch(() => null);
    // Kandydaci wyciszeni server-mutem przez poprzednią wersję poczekalni
    if (member.voice?.serverMute) await member.voice.setMute(false, 'Rekrutacja: rozmowa').catch(() => null);
  } else if (wyszedlZPokoju) {
    await oldState.channel?.permissionOverwrites.delete(member.id, 'Rekrutacja: koniec rozmowy').catch(() => null);
  }
}

function rejestruj() {}

module.exports = { rejestruj, aktywnaRekrutacja, stworz, usun, obsluzZmianeStanuGlosowego };
