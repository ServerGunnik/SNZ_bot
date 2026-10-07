const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const db = require('../database/db.js');
const config = require('../config.js');
const karty = require('../utils/karty.js');
const { jestStaff } = require('../utils/uprawnienia.js');
const { log } = require('../utils/logger.js');
const kolory = require('../utils/kolory.js');

const q = {
  poNazwie: db.prepare('SELECT * FROM panstwa WHERE nazwa = ? COLLATE NOCASE'),
  poId: db.prepare('SELECT * FROM panstwa WHERE id = ?'),
  poLiderze: db.prepare('SELECT * FROM panstwa WHERE lider_id = ?'),
  utworz: db.prepare('INSERT INTO panstwa (nazwa, lider_id, limit_czlonkow, utworzone) VALUES (?, ?, ?, ?)'),
  zmienLidera: db.prepare('UPDATE panstwa SET lider_id = ? WHERE id = ?'),
  ustawLimit: db.prepare('UPDATE panstwa SET limit_czlonkow = ? WHERE id = ?'),
  ustawSojusznik: db.prepare('UPDATE panstwa SET sojusznik = ? WHERE id = ?'),
  rozwiaz: db.prepare('DELETE FROM panstwa WHERE id = ?'),
  wszystkie: db.prepare('SELECT * FROM panstwa ORDER BY nazwa'),
  nickUsera: db.prepare('SELECT nick FROM weryfikacja WHERE user_id = ?'),
  czlonekPoNicku: db.prepare('SELECT * FROM panstwa_czlonkowie WHERE nick = ? COLLATE NOCASE'),
};

// Jeden gracz = jedno państwo: nick króla nie może być członkiem innego państwa
function konfliktKrola(userId, panstwoId = null) {
  const nick = q.nickUsera.get(userId)?.nick;
  if (!nick) return null;
  const czlonek = q.czlonekPoNicku.get(nick);
  if (!czlonek || czlonek.panstwo_id === panstwoId) return null;
  return { nick, panstwo: q.poId.get(czlonek.panstwo_id) };
}

async function nadajRoleLidera(guild, userId) {
  if (!config.role.lider.length) return;
  const czlonek = await guild.members.fetch(userId).catch(() => null);
  if (!czlonek) return;
  for (const id of config.role.lider) {
    const rola = guild.roles.cache.get(id);
    if (rola) await czlonek.roles.add(rola).catch(() => {});
  }
}

async function zabierzRoleLidera(guild, userId) {
  if (!userId || !config.role.lider.length) return;
  const czlonek = await guild.members.fetch(userId).catch(() => null);
  if (!czlonek) return;
  for (const id of config.role.lider) {
    const rola = guild.roles.cache.get(id);
    if (rola) await czlonek.roles.remove(rola).catch(() => {});
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('panstwo')
    .setDescription('Zarządzanie państwami (staff)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addSubcommand(s => s.setName('utworz').setDescription('Utwórz nowe państwo')
      .addStringOption(o => o.setName('nazwa').setDescription('Nazwa państwa').setRequired(true))
      .addUserOption(o => o.setName('lider').setDescription('Lider państwa').setRequired(true))
      .addIntegerOption(o => o.setName('limit').setDescription('Limit członków (domyślnie 20)').setMinValue(1).setMaxValue(500))
    )
    .addSubcommand(s => s.setName('zmien-lidera').setDescription('Zmień lidera państwa')
      .addStringOption(o => o.setName('nazwa').setDescription('Państwo').setRequired(true).setAutocomplete(true))
      .addUserOption(o => o.setName('lider').setDescription('Nowy lider').setRequired(true))
    )
    .addSubcommand(s => s.setName('limit').setDescription('Ustaw limit członków państwa')
      .addStringOption(o => o.setName('nazwa').setDescription('Państwo').setRequired(true).setAutocomplete(true))
      .addIntegerOption(o => o.setName('limit').setDescription('Nowy limit').setRequired(true).setMinValue(1).setMaxValue(500))
    )
    .addSubcommand(s => s.setName('rozwiaz').setDescription('Rozwiąż państwo')
      .addStringOption(o => o.setName('nazwa').setDescription('Państwo').setRequired(true).setAutocomplete(true))
    )
    .addSubcommand(s => s.setName('sojusznik').setDescription('Czy państwo jest w sojuszu (pole "allay" w configu moda)')
      .addStringOption(o => o.setName('nazwa').setDescription('Państwo').setRequired(true).setAutocomplete(true))
      .addBooleanOption(o => o.setName('sojusznik').setDescription('tak = w sojuszu, nie = poza sojuszem').setRequired(true))
    )
    .addSubcommand(s => s.setName('lista').setDescription('Lista wszystkich państw')),

  async autocomplete(interaction) {
    const wpis = interaction.options.getFocused().toLowerCase();
    const wszystkie = q.wszystkie.all();
    await interaction.respond(
      wszystkie.filter(p => p.nazwa.toLowerCase().includes(wpis)).slice(0, 25)
        .map(p => ({ name: p.nazwa, value: p.nazwa }))
    );
  },

  async execute(interaction) {
    if (!jestStaff(interaction.member)) {
      return interaction.reply({
        ...karty.kartaBlad('Brak uprawnień', 'Ta komenda jest dla staffu.'),
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
    }
    const sub = interaction.options.getSubcommand();

    if (sub === 'utworz') {
      const nazwa = interaction.options.getString('nazwa').trim();
      const lider = interaction.options.getUser('lider');
      const limit = interaction.options.getInteger('limit') || config.panstwa.domyslnyLimitCzlonkow;

      if (q.poNazwie.get(nazwa)) {
        return interaction.reply({
          ...karty.kartaBlad('Nazwa zajęta', 'Państwo o tej nazwie już istnieje.'),
          flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        });
      }
      if (q.poLiderze.get(lider.id)) {
        return interaction.reply({
          ...karty.kartaBlad('Konflikt lidera', 'Ten użytkownik jest już liderem innego państwa.'),
          flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        });
      }
      const konflikt = konfliktKrola(lider.id);
      if (konflikt) {
        return interaction.reply({
          ...karty.kartaBlad('Gracz w innym państwie', `Nick \`${konflikt.nick}\` jest członkiem państwa **${konflikt.panstwo?.nazwa || '???'}**. Niech tamten król go najpierw usunie.`),
          flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        });
      }
      const info = q.utworz.run(nazwa, lider.id, limit, Date.now());
      await nadajRoleLidera(interaction.guild, lider.id);
      await log(interaction.client, {
        tytul: 'Utworzono państwo',
        opis: `**Państwo:** ${nazwa}\n**Lider:** <@${lider.id}>\n**Limit:** ${limit}\n**Utworzył:** <@${interaction.user.id}>`,
        kolor: kolory.sukces,
        kanal: 'logiPanstwa',
      });
      return interaction.reply({
        ...karty.kartaSukces('Państwo utworzone', `**${nazwa}** (ID #${info.lastInsertRowid}) — lider <@${lider.id}>`),
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
    }

    if (sub === 'zmien-lidera') {
      const nazwa = interaction.options.getString('nazwa');
      const nowy = interaction.options.getUser('lider');
      const panstwo = q.poNazwie.get(nazwa);
      if (!panstwo) return interaction.reply({
        ...karty.kartaBlad('Brak państwa', `Nie znaleziono państwa **${nazwa}**.`),
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
      if (q.poLiderze.get(nowy.id) && q.poLiderze.get(nowy.id).id !== panstwo.id) {
        return interaction.reply({
          ...karty.kartaBlad('Konflikt lidera', 'Ten użytkownik jest już liderem innego państwa.'),
          flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        });
      }
      const konflikt = konfliktKrola(nowy.id, panstwo.id);
      if (konflikt) {
        return interaction.reply({
          ...karty.kartaBlad('Gracz w innym państwie', `Nick \`${konflikt.nick}\` jest członkiem państwa **${konflikt.panstwo?.nazwa || '???'}**. Niech tamten król go najpierw usunie.`),
          flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        });
      }
      await zabierzRoleLidera(interaction.guild, panstwo.lider_id);
      q.zmienLidera.run(nowy.id, panstwo.id);
      await nadajRoleLidera(interaction.guild, nowy.id);
      await log(interaction.client, {
        tytul: 'Zmiana lidera państwa',
        opis: `**Państwo:** ${panstwo.nazwa}\n**Poprzedni:** ${panstwo.lider_id ? `<@${panstwo.lider_id}>` : '_brak_'}\n**Nowy:** <@${nowy.id}>\n**Zmienił:** <@${interaction.user.id}>`,
        kolor: kolory.info,
        kanal: 'logiPanstwa',
      });
      return interaction.reply({
        ...karty.kartaSukces('Lider zmieniony', `Nowy lider **${panstwo.nazwa}**: <@${nowy.id}>`),
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
    }

    if (sub === 'limit') {
      const nazwa = interaction.options.getString('nazwa');
      const limit = interaction.options.getInteger('limit');
      const panstwo = q.poNazwie.get(nazwa);
      if (!panstwo) return interaction.reply({
        ...karty.kartaBlad('Brak państwa', `Nie znaleziono państwa **${nazwa}**.`),
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
      q.ustawLimit.run(limit, panstwo.id);
      await log(interaction.client, {
        tytul: 'Zmieniono limit państwa',
        opis: `**Państwo:** ${panstwo.nazwa}\n**Nowy limit:** ${limit}\n**Zmienił:** <@${interaction.user.id}>`,
        kolor: kolory.info,
        kanal: 'logiPanstwa',
      });
      return interaction.reply({
        ...karty.kartaSukces('Limit zmieniony', `**${panstwo.nazwa}** — nowy limit: **${limit}**`),
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
    }

    if (sub === 'rozwiaz') {
      const nazwa = interaction.options.getString('nazwa');
      const panstwo = q.poNazwie.get(nazwa);
      if (!panstwo) return interaction.reply({
        ...karty.kartaBlad('Brak państwa', `Nie znaleziono państwa **${nazwa}**.`),
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
      await zabierzRoleLidera(interaction.guild, panstwo.lider_id);
      q.rozwiaz.run(panstwo.id);
      await log(interaction.client, {
        tytul: 'Rozwiązano państwo',
        opis: `**Państwo:** ${panstwo.nazwa}\n**Lider:** ${panstwo.lider_id ? `<@${panstwo.lider_id}>` : '_brak_'}\n**Rozwiązał:** <@${interaction.user.id}>`,
        kolor: kolory.blad,
        kanal: 'logiPanstwa',
      });
      return interaction.reply({
        ...karty.kartaSukces('Państwo rozwiązane', `Państwo **${panstwo.nazwa}** przestało istnieć.`),
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
    }

    if (sub === 'sojusznik') {
      const nazwa = interaction.options.getString('nazwa');
      const sojusznik = interaction.options.getBoolean('sojusznik');
      const panstwo = q.poNazwie.get(nazwa);
      if (!panstwo) return interaction.reply({
        ...karty.kartaBlad('Brak państwa', `Nie znaleziono państwa **${nazwa}**.`),
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
      q.ustawSojusznik.run(sojusznik ? 1 : 0, panstwo.id);
      await log(interaction.client, {
        tytul: 'Zmieniono status sojuszu',
        opis: `**Państwo:** ${panstwo.nazwa}\n**W sojuszu:** ${sojusznik ? 'tak' : 'nie'}\n**Zmienił:** <@${interaction.user.id}>`,
        kolor: kolory.info,
        kanal: 'logiPanstwa',
      });
      return interaction.reply({
        ...karty.kartaSukces('Zapisano', `**${panstwo.nazwa}** — ${sojusznik ? 'w sojuszu' : 'poza sojuszem'} (\`allay: ${sojusznik}\`).`),
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
    }

    if (sub === 'lista') {
      const p = q.wszystkie.all();
      const opis = p.length
        ? p.map(x => `\`#${x.id}\` **${x.nazwa}** — lider ${x.lider_id ? `<@${x.lider_id}>` : '_brak_'} • limit ${x.limit_czlonkow}`).join('\n')
        : '_Brak państw._';
      return interaction.reply({
        ...karty.kartaInfo({ tytul: 'Państwa SNZ', opis }),
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
    }
  },
};
