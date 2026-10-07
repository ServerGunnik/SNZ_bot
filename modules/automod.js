// Automod: flood, powtarzanie tej samej treści, masowe oznaczanie, próby @everyone/@here i zaproszenia na inne serwery.
// Staff i osoby z uprawnieniem "Zarządzanie wiadomościami" są pomijane.
const { PermissionFlagsBits } = require('discord.js');
const config = require('../config.js');
const { jestStaff } = require('../utils/uprawnienia.js');
const { log } = require('../utils/logger.js');
const kolory = require('../utils/kolory.js');

const ZAPROSZENIE = /(discord\.gg|discord(?:app)?\.com\/invite)\/[\w-]+/i;
const EVERYONE = /@(everyone|here)\b/i;
const CZAS_KOMUNIKATU_MS = 6000;

const historia = new Map(); // userId -> [{ id, kanal, czas, tresc }]
// Wiadomości usunięte przez automod - logi wiadomości ich nie dublują (automod loguje je sam)
const usunietePrzezAutomod = new Set();

function pominiety(wiadomosc) {
  const cfg = config.automod;
  if (!cfg.wlaczony || !wiadomosc.guild || wiadomosc.webhookId || wiadomosc.system) return true;
  if (config.guildId && wiadomosc.guild.id !== config.guildId) return true;
  // Nasze własne wiadomości (karty, logi, odpowiedzi bota) nigdy nie są automodowane
  if (wiadomosc.author?.id === wiadomosc.client.user.id) return true;
  if (cfg.pomijaneKanaly.includes(wiadomosc.channelId) || cfg.pomijaneKanaly.includes(wiadomosc.channel?.parentId)) return true;
  const member = wiadomosc.member;
  if (!member) return false;
  // Boty NIGDY nie są pomijane przez automod - nawet z uprawnieniami moderatora.
  // Token legalnej, zweryfikowanej aplikacji może zostać przejęty i wykorzystany do ataku.
  if (member.user?.bot) return false;
  // Zwykłe konta: staff/osoby z ManageMessages pomijane
  return jestStaff(member) || member.permissions.has(PermissionFlagsBits.ManageMessages);
}

// Zapamiętuje wiadomość i zwraca naruszenie floodu/powtórzeń: { powod, wiadomosci } albo null
function sprawdzFlood(wiadomosc) {
  const { flood, powtorzenia } = config.automod;
  const teraz = Date.now();
  const okno = Math.max(flood.oknoMs, powtorzenia.oknoMs);
  const tresc = (wiadomosc.content || '').trim().toLowerCase();
  const lista = (historia.get(wiadomosc.author.id) || []).filter(w => teraz - w.czas <= okno);
  lista.push({ id: wiadomosc.id, kanal: wiadomosc.channel, czas: teraz, tresc });
  historia.set(wiadomosc.author.id, lista);

  const wOknieFloodu = lista.filter(w => teraz - w.czas <= flood.oknoMs);
  if (wOknieFloodu.length >= flood.wiadomosci) return { powod: 'flood (zbyt wiele wiadomości naraz)', wiadomosci: wOknieFloodu };
  if (tresc) {
    const takieSame = lista.filter(w => w.tresc === tresc && teraz - w.czas <= powtorzenia.oknoMs);
    if (takieSame.length >= powtorzenia.ile) return { powod: 'powtarzanie tej samej wiadomości', wiadomosci: takieSame };
  }
  return null;
}

async function usunWiadomosci(wiadomosci) {
  const poKanale = new Map();
  for (const w of wiadomosci) {
    usunietePrzezAutomod.add(w.id);
    setTimeout(() => usunietePrzezAutomod.delete(w.id), 60 * 1000);
    if (!poKanale.has(w.kanal.id)) poKanale.set(w.kanal.id, { kanal: w.kanal, ids: [] });
    poKanale.get(w.kanal.id).ids.push(w.id);
  }
  for (const { kanal, ids } of poKanale.values()) {
    if (ids.length > 1) await kanal.bulkDelete(ids, true).catch(() => null);
    else await kanal.messages.delete(ids[0]).catch(() => null);
  }
}

async function naruszenie(wiadomosc, powod, doUsuniecia) {
  historia.delete(wiadomosc.author.id);
  await usunWiadomosci(doUsuniecia);

  const { wyciszenieMs } = config.automod;
  const member = wiadomosc.member;
  let kara = 'usunięcie wiadomości';
  // Discord nie pozwala wyciszać botów - banujemy, żeby nie można było dodać tego samego bota ponownie
  if (member?.user?.bot) {
    if (member.bannable) {
      const ok = await member.ban({ reason: `Automod: ${powod}`, deleteMessageSeconds: 24 * 60 * 60 })
        .then(() => true).catch(() => false);
      if (ok) kara += ' + BAN bota + skasowanie jego wiadomości z 24h';
      else kara += ' (próba bana nieudana)';
    } else if (member.kickable) {
      const ok = await member.kick(`Automod: ${powod}`).then(() => true).catch(() => false);
      if (ok) kara += ' + wyrzucenie bota (nie można zbanować)';
    } else {
      kara += ' (bot ma za wysoką rolę, nie da się ani zbanować ani wyrzucić)';
    }
  } else if (wyciszenieMs > 0 && member?.moderatable && !member.isCommunicationDisabled()) {
    const ok = await member.timeout(wyciszenieMs, `Automod: ${powod}`).then(() => true).catch(() => false);
    if (ok) kara += ` + wyciszenie ${Math.round(wyciszenieMs / 60000)} min`;
  }

  const komunikat = await wiadomosc.channel.send({
    content: `<@${wiadomosc.author.id}>, automod usunął Twoją wiadomość: **${powod}**.`,
    allowedMentions: { users: [wiadomosc.author.id] },
  }).catch(() => null);
  if (komunikat) setTimeout(() => komunikat.delete().catch(() => null), CZAS_KOMUNIKATU_MS);

  await log(wiadomosc.client, {
    tytul: `Automod — ${powod}`,
    opis:
      `**Użytkownik:** <@${wiadomosc.author.id}> (\`${wiadomosc.author.tag}\`)\n**Kanał:** <#${wiadomosc.channelId}>\n` +
      `**Kara:** ${kara}\n**Usunięto wiadomości:** ${doUsuniecia.length}\n\n` +
      `**Treść:**\n\`\`\`\n${(wiadomosc.content || '(brak tekstu)').slice(0, 800).replace(/```/g, 'ʼʼʼ')}\n\`\`\``,
    kolor: kolory.ostrzezenie,
    kanal: 'logiWiadomosci',
  });
}

async function obsluzWiadomosc(wiadomosc) {
  if (pominiety(wiadomosc)) return;
  const cfg = config.automod;
  const tresc = wiadomosc.content || '';
  const ta = [{ id: wiadomosc.id, kanal: wiadomosc.channel }];

  if (cfg.blokujEveryone && EVERYONE.test(tresc)) return naruszenie(wiadomosc, 'próba oznaczenia @everyone/@here', ta);
  if (cfg.blokujZaproszenia && ZAPROSZENIE.test(tresc)) return naruszenie(wiadomosc, 'zaproszenie na inny serwer Discord', ta);
  const oznaczenia = wiadomosc.mentions.users.filter(u => !u.bot && u.id !== wiadomosc.author.id).size + wiadomosc.mentions.roles.size;
  if (oznaczenia > cfg.maxOznaczen) return naruszenie(wiadomosc, `masowe oznaczanie (${oznaczenia} osób/ról)`, ta);

  const flood = sprawdzFlood(wiadomosc);
  if (flood) return naruszenie(wiadomosc, flood.powod, flood.wiadomosci);
}

function rejestruj() {}

module.exports = { rejestruj, obsluzWiadomosc, usunietePrzezAutomod };
