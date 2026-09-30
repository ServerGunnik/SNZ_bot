const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const db = require('../database/db.js');
const karty = require('../utils/karty.js');
const { jestStaff } = require('../utils/uprawnienia.js');
const { opublikujList, zamknijList } = require('../modules/listy-goncze.js');
const { log } = require('../utils/logger.js');
const kolory = require('../utils/kolory.js');

async function powiadomWystawce(client, list, payload) {
  const user = await client.users.fetch(list.wystawca_id).catch(() => null);
  if (user) await user.send(payload).catch(() => null);
}

const q = {
  poId: db.prepare('SELECT * FROM listy_goncze WHERE id = ?'),
  // Ważność liczona od zatwierdzenia, a nie od złożenia
  zatwierdz: db.prepare("UPDATE listy_goncze SET status = 'aktywny', wygasa = ? WHERE id = ?"),
  odrzuc: db.prepare("UPDATE listy_goncze SET status = 'odrzucony', zamkniety = ?, zamkniety_przez = ? WHERE id = ?"),
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('list-gonczy-admin')
    .setDescription('Zarządzanie listami gończymi (staff)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addSubcommand(s => s.setName('zatwierdz').setDescription('Zatwierdź oczekujący list')
      .addIntegerOption(o => o.setName('id').setDescription('ID listu').setRequired(true))
    )
    .addSubcommand(s => s.setName('odrzuc').setDescription('Odrzuć oczekujący list')
      .addIntegerOption(o => o.setName('id').setDescription('ID listu').setRequired(true))
      .addStringOption(o => o.setName('powod').setDescription('Powód odrzucenia').setRequired(true))
    )
    .addSubcommand(s => s.setName('zamknij').setDescription('Ręcznie zamknij list')
      .addIntegerOption(o => o.setName('id').setDescription('ID listu').setRequired(true))
      .addStringOption(o => o.setName('status').setDescription('Status końcowy').setRequired(true)
        .addChoices({ name: 'zrealizowany', value: 'zrealizowany' }, { name: 'wygasly', value: 'wygasly' }))
    ),

  async execute(interaction) {
    if (!jestStaff(interaction.member)) {
      return interaction.reply({
        ...karty.kartaBlad('Brak uprawnień', 'Ta komenda jest dla staffu.'),
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
    }
    const sub = interaction.options.getSubcommand();
    const id = interaction.options.getInteger('id');
    const list = q.poId.get(id);
    if (!list) return interaction.reply({
      ...karty.kartaBlad('Brak listu', `Nie znaleziono listu **#${id}**.`),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });

    if (sub === 'zatwierdz') {
      if (list.status !== 'oczekuje') return interaction.reply({
        ...karty.kartaOstrzezenie('Zły status', `List jest w statusie **${list.status}**.`),
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
      const waznoscMs = list.wygasa ? list.wygasa - list.utworzony : null;
      q.zatwierdz.run(waznoscMs ? Date.now() + waznoscMs : null, id);
      await opublikujList(interaction.client, id);
      await powiadomWystawce(interaction.client, list,
        karty.kartaSukces('List gończy zatwierdzony', `Twój list **#${id}** na \`${list.nick}\` został opublikowany.`));
      await log(interaction.client, {
        tytul: 'List gończy zatwierdzony',
        opis: `**#${id}** \`${list.nick}\` — zatwierdził <@${interaction.user.id}>`,
        kolor: kolory.sukces,
      });
      return interaction.reply({
        ...karty.kartaSukces('Zatwierdzony', `List **#${id}** został opublikowany.`),
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
    }

    if (sub === 'odrzuc') {
      if (list.status !== 'oczekuje') return interaction.reply({
        ...karty.kartaOstrzezenie('Zły status', `List jest w statusie **${list.status}**.`),
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
      const powod = interaction.options.getString('powod');
      q.odrzuc.run(Date.now(), interaction.user.id, id);
      await powiadomWystawce(interaction.client, list,
        karty.kartaBlad('List gończy odrzucony', `Twój list **#${id}** na \`${list.nick}\` został odrzucony.\n**Powód:** ${powod}`));
      await log(interaction.client, {
        tytul: 'List gończy odrzucony',
        opis: `**#${id}** \`${list.nick}\`\n**Powód:** ${powod}\n**Odrzucił:** <@${interaction.user.id}>`,
        kolor: kolory.blad,
      });
      return interaction.reply({
        ...karty.kartaSukces('Odrzucony', `List **#${id}** został odrzucony.`),
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
    }

    if (sub === 'zamknij') {
      if (list.status !== 'aktywny') return interaction.reply({
        ...karty.kartaOstrzezenie('Zły status', `List jest w statusie **${list.status}**.`),
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
      const status = interaction.options.getString('status');
      await zamknijList(interaction.client, id, status, interaction.user.id);
      return interaction.reply({
        ...karty.kartaSukces('Zamknięto', `List **#${id}** oznaczono jako **${status}**.`),
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
    }
  },
};
