const { MessageFlags } = require('discord.js');
const db = require('../database/db.js');
const config = require('../config.js');
const karty = require('../utils/karty.js');
const { jestStaff } = require('../utils/uprawnienia.js');
const { log } = require('../utils/logger.js');
const kolory = require('../utils/kolory.js');

const q = {
  poId: db.prepare('SELECT * FROM mod_call WHERE id = ?'),
  aktywne: db.prepare("SELECT * FROM mod_call WHERE user_id = ? AND status = 'oczekuje'"),
  wszystkieOczekujace: db.prepare("SELECT * FROM mod_call WHERE status = 'oczekuje'"),
  utworz: db.prepare("INSERT INTO mod_call (user_id, kanal_id, wiadomosc_id, utworzone) VALUES (?, ?, ?, ?)"),
  zapiszWiad: db.prepare('UPDATE mod_call SET wiadomosc_id = ? WHERE id = ?'),
  // Status ustawiany PRZED przeniesieniem gracza, żeby wyjście z poczekalni nie anulowało wezwania
  przyjmij: db.prepare("UPDATE mod_call SET status = 'przyjete', przyjete = ?, przyjmujacy = ?, pomoc_kanal_id = ? WHERE id = ? AND status = 'oczekuje'"),
  cofnijPrzyjecie: db.prepare("UPDATE mod_call SET status = 'oczekuje', przyjete = NULL, przyjmujacy = NULL, pomoc_kanal_id = NULL WHERE id = ?"),
  anuluj: db.prepare("UPDATE mod_call SET status = 'anulowane' WHERE id = ? AND status = 'oczekuje'"),
  poWiadomosci: db.prepare('SELECT * FROM mod_call WHERE wiadomosc_id = ?'),
  incPing: db.prepare('UPDATE mod_call SET liczba_pingow = liczba_pingow + 1 WHERE id = ?'),
  doSprzatniecia: db.prepare("SELECT * FROM mod_call WHERE pomoc_kanal_id = ? AND status = 'przyjete' AND sprzatniete = 0"),
  sprzatniete: db.prepare('UPDATE mod_call SET sprzatniete = 1 WHERE id = ?'),
};

const aktywnePingi = new Map(); // id wezwania -> setTimeout

function wiadomoscPingu(tekst = '') {
  const modPing = config.role.modPing;
  return {
    content: `${modPing ? `<@&${modPing}> ` : ''}${tekst || 'Ktoś czeka na pomoc w poczekalni.'}`,
    allowedMentions: modPing ? { roles: [modPing] } : { parse: [] },
  };
}

async function kanalModow(client) {
  return config.kanaly.modCall ? client.channels.fetch(config.kanaly.modCall).catch(() => null) : null;
}

// Aktualizacja karty wezwania (np. po anulowaniu), żeby nie wisiał na niej przycisk "Przyjmij"
async function aktualizujKarte(client, mc, payload) {
  const kanal = await kanalModow(client);
  const wiad = kanal && mc.wiadomosc_id && await kanal.messages.fetch(mc.wiadomosc_id).catch(() => null);
  if (wiad) await wiad.edit(payload).catch(() => null);
}

function zatrzymajPingi(id) {
  clearTimeout(aktywnePingi.get(id));
  aktywnePingi.delete(id);
}

async function anulujWezwanie(client, mc, powod) {
  if (q.anuluj.run(mc.id).changes === 0) return;
  zatrzymajPingi(mc.id);
  await aktualizujKarte(client, mc, karty.kartaModCall({ user_id: mc.user_id, kanal_id: mc.kanal_id, waiting: false, status: powod }));
}

// Cykliczne przypomnienia, dopóki ktoś nie przyjmie wezwania (maksymalnie config.wolanieModa.maxPingow)
function zaplanujPingi(client, guild, id) {
  zatrzymajPingi(id);
  const t = setTimeout(async () => {
    const stan = q.poId.get(id);
    if (!stan || stan.status !== 'oczekuje') return;
    const memb = await guild.members.fetch(stan.user_id).catch(() => null);
    if (!memb || memb.voice.channelId !== config.kanaly.poczekalnia) {
      await anulujWezwanie(client, stan, 'Anulowane — gracz opuścił poczekalnię');
      return;
    }
    if (stan.liczba_pingow >= config.wolanieModa.maxPingow) return;
    q.incPing.run(id);
    const kanal = await kanalModow(client);
    if (kanal) await kanal.send(wiadomoscPingu(`ponowne wezwanie — <@${stan.user_id}> nadal czeka.`)).catch(() => {});
    zaplanujPingi(client, guild, id);
  }, config.wolanieModa.interwalPingMs);
  aktywnePingi.set(id, t);
}

// Gdy kanał pomocy opustoszeje, zdejmujemy nadane na czas rozmowy uprawnienia
async function sprzatnijKanalPomocy(kanal) {
  if (!kanal || kanal.members.size > 0) return;
  for (const mc of q.doSprzatniecia.all(kanal.id)) {
    for (const userId of [mc.user_id, mc.przyjmujacy].filter(Boolean)) {
      await kanal.permissionOverwrites.delete(userId, 'Wołanie moderatora - rozmowa zakończona').catch(() => {});
    }
    q.sprzatniete.run(mc.id);
  }
}

async function obsluzZmianeStanuGlosowego(oldState, newState, client) {
  const poczekalnia = config.kanaly.poczekalnia;
  if (!poczekalnia) return;

  // Ktoś wyszedł z kanału pomocy - jeśli został pusty, sprzątamy uprawnienia
  if (oldState.channelId && oldState.channelId !== newState.channelId && config.kanaly.pomoc.includes(oldState.channelId)) {
    await sprzatnijKanalPomocy(oldState.channel);
  }

  // Wyjście z poczekalni przed przyjęciem = anulowanie wezwania
  if (oldState.channelId === poczekalnia && newState.channelId !== poczekalnia) {
    const aktywne = q.aktywne.get(newState.id);
    if (aktywne) await anulujWezwanie(client, aktywne, 'Anulowane — gracz opuścił poczekalnię');
    return;
  }

  const wszedl = newState.channelId === poczekalnia && oldState.channelId !== poczekalnia;
  if (!wszedl || newState.member?.user.bot) return;
  if (q.aktywne.get(newState.id)) return;

  const kanalMod = await kanalModow(client);
  if (!kanalMod) return;

  const id = q.utworz.run(newState.id, newState.channelId, null, Date.now()).lastInsertRowid;
  await kanalMod.send(wiadomoscPingu()).catch(() => null);
  const karta = await kanalMod.send(karty.kartaModCall({ user_id: newState.id, kanal_id: newState.channelId }));
  q.zapiszWiad.run(karta.id, id);
  zaplanujPingi(client, newState.guild, id);
}

async function onPrzyjmij(interaction) {
  if (!jestStaff(interaction.member)) {
    return interaction.reply({
      ...karty.kartaBlad('Brak uprawnień', 'Tylko staff może przyjmować zgłoszenia.'),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  }
  const mc = q.poWiadomosci.get(interaction.message.id);
  if (!mc || mc.status !== 'oczekuje') {
    return interaction.reply({
      ...karty.kartaOstrzezenie('Zgłoszenie nieaktualne', 'Ktoś już je przyjął albo gracz opuścił poczekalnię.'),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  }

  const guild = interaction.guild;
  const czlonek = await guild.members.fetch(mc.user_id).catch(() => null);
  if (!czlonek || czlonek.voice.channelId !== config.kanaly.poczekalnia) {
    await anulujWezwanie(interaction.client, mc, 'Anulowane — gracz opuścił poczekalnię');
    return interaction.reply({
      ...karty.kartaOstrzezenie('Użytkownik odszedł', 'Osoba wołająca opuściła poczekalnię.'),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  }

  // Znajdź wolny kanał Pomoc
  const wolny = config.kanaly.pomoc.map(kid => guild.channels.cache.get(kid)).find(kan => kan && kan.members.size === 0);
  if (!wolny) {
    return interaction.reply({
      ...karty.kartaBlad('Brak wolnych kanałów', 'Wszystkie kanały pomocy są zajęte.'),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  }

  if (q.przyjmij.run(Date.now(), interaction.user.id, wolny.id, mc.id).changes === 0) {
    return interaction.reply({
      ...karty.kartaOstrzezenie('Zgłoszenie nieaktualne', 'Ktoś inny właśnie je przyjął.'),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  }
  zatrzymajPingi(mc.id);

  // Przenieś usera + staffa (uprawnienia zostaną zdjęte, gdy kanał opustoszeje)
  try {
    await wolny.permissionOverwrites.edit(interaction.user.id, { ViewChannel: true, Connect: true });
    await wolny.permissionOverwrites.edit(mc.user_id, { ViewChannel: true, Connect: true });
    await czlonek.voice.setChannel(wolny, 'Wołanie moderatora - przyjęte');
    if (interaction.member.voice?.channelId) {
      await interaction.member.voice.setChannel(wolny).catch(() => {});
    }
  } catch (e) {
    q.cofnijPrzyjecie.run(mc.id);
    zaplanujPingi(interaction.client, guild, mc.id);
    return interaction.reply({
      ...karty.kartaBlad('Błąd przeniesienia', e.message),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  }

  await interaction.update(karty.kartaModCall({
    user_id: mc.user_id, kanal_id: wolny.id, waiting: false, przyjmujacy: interaction.user.id,
  }));

  const czekano = Math.round((Date.now() - mc.utworzone) / 1000);
  await log(interaction.client, {
    tytul: 'Wołanie moderatora przyjęte',
    opis: `**Użytkownik:** <@${mc.user_id}>\n**Staff:** <@${interaction.user.id}>\n**Kanał pomocy:** <#${wolny.id}>\n**Czas oczekiwania:** ${czekano}s`,
    kolor: kolory.sukces,
  });
}

// Po restarcie bota: wznowienie przypomnień dla osób, które nadal czekają, i sprzątanie po reszcie
async function przywrocWezwania(client) {
  const guild = config.guildId ? await client.guilds.fetch(config.guildId).catch(() => null) : client.guilds.cache.first();
  if (!guild) return;
  for (const mc of q.wszystkieOczekujace.all()) {
    const memb = await guild.members.fetch(mc.user_id).catch(() => null);
    if (memb?.voice.channelId === config.kanaly.poczekalnia) zaplanujPingi(client, guild, mc.id);
    else await anulujWezwanie(client, mc, 'Anulowane — gracz opuścił poczekalnię');
  }
  for (const kid of config.kanaly.pomoc) await sprzatnijKanalPomocy(guild.channels.cache.get(kid));
}

function rejestruj({ zarejestruj }) {
  zarejestruj('modcall:przyjmij', onPrzyjmij);
}

module.exports = { rejestruj, obsluzZmianeStanuGlosowego, przywrocWezwania };
