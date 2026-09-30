const { MessageFlags, ChannelType, PermissionFlagsBits } = require('discord.js');
const db = require('../database/db.js');
const config = require('../config.js');
const karty = require('../utils/karty.js');
const { jestStaff } = require('../utils/uprawnienia.js');
const { log } = require('../utils/logger.js');
const kolory = require('../utils/kolory.js');

const q = {
  aktywne: db.prepare("SELECT * FROM mod_call WHERE user_id = ? AND status = 'oczekuje'"),
  utworz: db.prepare("INSERT INTO mod_call (user_id, kanal_id, wiadomosc_id, utworzone) VALUES (?, ?, ?, ?)"),
  zapiszWiad: db.prepare('UPDATE mod_call SET wiadomosc_id = ? WHERE id = ?'),
  przyjmij: db.prepare("UPDATE mod_call SET status = 'przyjete', przyjete = ?, przyjmujacy = ? WHERE id = ?"),
  anuluj: db.prepare("UPDATE mod_call SET status = 'anulowane' WHERE id = ?"),
  poWiadomosci: db.prepare('SELECT * FROM mod_call WHERE wiadomosc_id = ?'),
  incPing: db.prepare('UPDATE mod_call SET liczba_pingow = liczba_pingow + 1 WHERE id = ?'),
};

const aktywnePingi = new Map(); // id -> setTimeout

async function obsluzZmianeStanuGlosowego(oldState, newState, client) {
  const poczekalnia = config.kanaly.poczekalnia;
  if (!poczekalnia) return;
  const wszedl = newState.channelId === poczekalnia && oldState.channelId !== poczekalnia;
  if (!wszedl) return;

  const aktywne = q.aktywne.get(newState.id);
  if (aktywne) return;

  const kanalMod = await client.channels.fetch(config.kanaly.modCall).catch(() => null);
  if (!kanalMod) return;

  const modPing = config.role.modPing;
  const info = q.utworz.run(newState.id, newState.channelId, null, Date.now());
  const id = info.lastInsertRowid;

  const wiadomosc = await kanalMod.send({
    content: modPing ? `<@&${modPing}>` : null,
    allowedMentions: modPing ? { roles: [modPing] } : undefined,
  });
  const karta = await kanalMod.send(karty.kartaModCall({ user_id: newState.id, kanal_id: newState.channelId }));
  q.zapiszWiad.run(karta.id, id);

  // Cykliczny ping
  const zaplanuj = () => {
    const t = setTimeout(async () => {
      const stan = db.prepare('SELECT * FROM mod_call WHERE id = ?').get(id);
      if (!stan || stan.status !== 'oczekuje') return;
      // Czy user nadal w poczekalni?
      const memb = await newState.guild.members.fetch(newState.id).catch(() => null);
      if (!memb || memb.voice.channelId !== poczekalnia) {
        q.anuluj.run(id);
        return;
      }
      if (stan.liczba_pingow >= config.wolanieModa.maxPingow) return;
      q.incPing.run(id);
      await kanalMod.send({
        content: modPing ? `<@&${modPing}> ponowne wezwanie` : 'Ponowne wezwanie',
        allowedMentions: modPing ? { roles: [modPing] } : undefined,
      }).catch(() => {});
      zaplanuj();
    }, config.wolanieModa.interwalPingMs);
    aktywnePingi.set(id, t);
  };
  zaplanuj();

  void wiadomosc;
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
      ...karty.kartaOstrzezenie('Zgłoszenie już przyjęte', 'Ktoś inny mógł je już podjąć.'),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  }

  const guild = interaction.guild;
  const czlonek = await guild.members.fetch(mc.user_id).catch(() => null);
  if (!czlonek || czlonek.voice.channelId !== config.kanaly.poczekalnia) {
    q.anuluj.run(mc.id);
    return interaction.reply({
      ...karty.kartaOstrzezenie('Użytkownik odszedł', 'Osoba wołająca opuściła poczekalnię.'),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  }

  // Znajdź wolny kanał Pomoc
  const pomocIds = config.kanaly.pomoc;
  let wolny = null;
  for (const kid of pomocIds) {
    const kan = guild.channels.cache.get(kid);
    if (kan && kan.members.size === 0) { wolny = kan; break; }
  }
  if (!wolny) {
    return interaction.reply({
      ...karty.kartaBlad('Brak wolnych kanałów', 'Wszystkie kanały pomocy są zajęte.'),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  }

  // Przenieś usera + staffa
  try {
    await wolny.permissionOverwrites.edit(interaction.user.id, { ViewChannel: true, Connect: true });
    await wolny.permissionOverwrites.edit(mc.user_id, { ViewChannel: true, Connect: true });
    await czlonek.voice.setChannel(wolny, 'Wołanie moderatora - przyjęte');
    if (interaction.member.voice?.channelId) {
      await interaction.member.voice.setChannel(wolny).catch(() => {});
    }
  } catch (e) {
    return interaction.reply({
      ...karty.kartaBlad('Błąd przeniesienia', e.message),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  }

  q.przyjmij.run(Date.now(), interaction.user.id, mc.id);
  const t = aktywnePingi.get(mc.id);
  if (t) clearTimeout(t);
  aktywnePingi.delete(mc.id);

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

function rejestruj({ zarejestruj }) {
  zarejestruj('modcall:przyjmij', onPrzyjmij);
}

module.exports = { rejestruj, obsluzZmianeStanuGlosowego };
