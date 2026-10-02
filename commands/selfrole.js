const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const db = require('../database/db.js');
const karty = require('../utils/karty.js');
const { jestStaff } = require('../utils/uprawnienia.js');
const { powodBlokadyRoli, odswiezPanel } = require('../modules/selfrole.js');

const q = {
  utworzGrupe: db.prepare('INSERT INTO selfrole_grupy (nazwa, opis, tryb) VALUES (?, ?, ?)'),
  usunGrupe: db.prepare('DELETE FROM selfrole_grupy WHERE id = ?'),
  grupa: db.prepare('SELECT * FROM selfrole_grupy WHERE id = ?'),
  role: db.prepare('SELECT * FROM selfrole_role WHERE grupa_id = ? ORDER BY id'),
  dodajRole: db.prepare('INSERT INTO selfrole_role (grupa_id, role_id, etykieta, opis, emoji) VALUES (?, ?, ?, ?, ?)'),
  usunRole: db.prepare('DELETE FROM selfrole_role WHERE id = ?'),
  wpisRoli: db.prepare('SELECT * FROM selfrole_role WHERE id = ?'),
  zapiszWiadomosc: db.prepare('UPDATE selfrole_grupy SET kanal_id = ?, wiadomosc_id = ? WHERE id = ?'),
  wszystkieGrupy: db.prepare('SELECT * FROM selfrole_grupy ORDER BY id'),
};

async function odpowiedzBrakUprawnien(interaction) {
  await interaction.reply({
    ...karty.kartaBlad('Brak uprawnień', 'Ta komenda jest dla staffu.'),
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('selfrole')
    .setDescription('Zarządzanie panelami selfrole')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addSubcommand(s => s.setName('grupa-utworz').setDescription('Utwórz nową grupę selfrole')
      .addStringOption(o => o.setName('nazwa').setDescription('Nazwa grupy').setRequired(true))
      .addStringOption(o => o.setName('tryb').setDescription('Wybór wielu ról czy jednej').setRequired(true)
        .addChoices({ name: 'multi (wiele ról)', value: 'multi' }, { name: 'single (jedna z listy)', value: 'single' }))
      .addStringOption(o => o.setName('opis').setDescription('Opis grupy'))
    )
    .addSubcommand(s => s.setName('grupa-usun').setDescription('Usuń grupę selfrole')
      .addIntegerOption(o => o.setName('id').setDescription('ID grupy').setRequired(true))
    )
    .addSubcommand(s => s.setName('grupa-lista').setDescription('Lista grup selfrole'))
    .addSubcommand(s => s.setName('rola-dodaj').setDescription('Dodaj rolę do grupy')
      .addIntegerOption(o => o.setName('grupa').setDescription('ID grupy').setRequired(true))
      .addRoleOption(o => o.setName('rola').setDescription('Rola do dodania').setRequired(true))
      .addStringOption(o => o.setName('etykieta').setDescription('Etykieta w panelu').setRequired(true))
      .addStringOption(o => o.setName('opis').setDescription('Opis roli'))
      .addStringOption(o => o.setName('emoji').setDescription('Emoji (unicode lub <a:name:id>)'))
    )
    .addSubcommand(s => s.setName('rola-usun').setDescription('Usuń rolę z grupy')
      .addIntegerOption(o => o.setName('id').setDescription('ID wpisu roli').setRequired(true))
    )
    .addSubcommand(s => s.setName('wystaw').setDescription('Wystaw panel grupy w bieżącym kanale')
      .addIntegerOption(o => o.setName('grupa').setDescription('ID grupy').setRequired(true))
    ),

  async execute(interaction) {
    if (!jestStaff(interaction.member)) return odpowiedzBrakUprawnien(interaction);
    const sub = interaction.options.getSubcommand();

    if (sub === 'grupa-utworz') {
      const nazwa = interaction.options.getString('nazwa');
      const tryb = interaction.options.getString('tryb');
      const opis = interaction.options.getString('opis') || null;
      const info = q.utworzGrupe.run(nazwa, opis, tryb);
      return interaction.reply({
        ...karty.kartaSukces('Grupa utworzona', `ID: **${info.lastInsertRowid}**\nNazwa: **${nazwa}**\nTryb: ${tryb}`),
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
    }

    if (sub === 'grupa-usun') {
      const id = interaction.options.getInteger('id');
      const grupa = q.grupa.get(id);
      q.usunGrupe.run(id);
      await odswiezPanel(interaction.client, grupa, true);
      return interaction.reply({
        ...karty.kartaSukces('Grupa usunięta', `Usunięto grupę **#${id}**.`),
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
    }

    if (sub === 'grupa-lista') {
      const grupy = q.wszystkieGrupy.all();
      const opis = grupy.length
        ? grupy.map(g => `\`#${g.id}\` **${g.nazwa}** (${g.tryb})${g.opis ? ` — ${g.opis}` : ''}`).join('\n')
        : '_Brak grup._';
      return interaction.reply({
        ...karty.kartaInfo({ tytul: 'Grupy selfrole', opis }),
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
    }

    if (sub === 'rola-dodaj') {
      const grupa = interaction.options.getInteger('grupa');
      if (!q.grupa.get(grupa)) {
        return interaction.reply({
          ...karty.kartaBlad('Brak grupy', `Grupa **#${grupa}** nie istnieje.`),
          flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        });
      }
      if (q.role.all(grupa).length >= 25) {
        return interaction.reply({
          ...karty.kartaBlad('Limit ról', 'Grupa może mieć maksymalnie 25 ról (limit Discorda dla listy wyboru).'),
          flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        });
      }
      const rola = interaction.options.getRole('rola');
      const blokada = powodBlokadyRoli(interaction.guild.roles.cache.get(rola.id), interaction.guild);
      if (blokada) {
        return interaction.reply({
          ...karty.kartaBlad('Tej roli nie można dodać', `<@&${rola.id}> — ${blokada}.`),
          flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        });
      }
      const etykieta = interaction.options.getString('etykieta');
      const opis = interaction.options.getString('opis') || null;
      const emoji = interaction.options.getString('emoji') || null;
      const info = q.dodajRole.run(grupa, rola.id, etykieta, opis, emoji);
      await odswiezPanel(interaction.client, q.grupa.get(grupa));
      return interaction.reply({
        ...karty.kartaSukces('Rola dodana', `Dodano <@&${rola.id}> do grupy **#${grupa}** (wpis #${info.lastInsertRowid}).`),
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
    }

    if (sub === 'rola-usun') {
      const id = interaction.options.getInteger('id');
      const wpis = q.wpisRoli.get(id);
      q.usunRole.run(id);
      if (wpis) await odswiezPanel(interaction.client, q.grupa.get(wpis.grupa_id));
      return interaction.reply({
        ...karty.kartaSukces('Rola usunięta', `Usunięto wpis #${id}.`),
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
    }

    if (sub === 'wystaw') {
      const id = interaction.options.getInteger('grupa');
      const grupa = q.grupa.get(id);
      if (!grupa) {
        return interaction.reply({
          ...karty.kartaBlad('Brak grupy', `Grupa **#${id}** nie istnieje.`),
          flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        });
      }
      const role = q.role.all(id);
      if (!role.length) {
        return interaction.reply({
          ...karty.kartaBlad('Grupa pusta', 'Dodaj przynajmniej jedną rolę przed wystawieniem panelu.'),
          flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        });
      }
      const msg = await interaction.channel.send(karty.panelSelfrole(grupa, role));
      q.zapiszWiadomosc.run(interaction.channel.id, msg.id, id);
      return interaction.reply({
        ...karty.kartaSukces('Panel wystawiony', `Panel grupy **${grupa.nazwa}** został opublikowany.`),
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
    }
  },
};
