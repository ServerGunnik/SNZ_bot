const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const db = require('../database/db.js');
const karty = require('../utils/karty.js');
const { jestStaff } = require('../utils/uprawnienia.js');
const { zmienSedziego, konfliktInteresow } = require('../modules/sad.js');

const EPHEMERAL_V2 = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;
const q = {
  poNumerze: db.prepare('SELECT * FROM sprawy WHERE numer = ?'),
  aktywnaSedziego: db.prepare("SELECT * FROM sprawy WHERE sedzia_id = ? AND status IN ('przyjeta','w_toku')"),
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sprawa-sedzia')
    .setDescription('Awaryjna zmiana sędziego sprawy (tylko właściciel serwera)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addStringOption(o => o.setName('numer').setDescription('Numer sprawy (SNZ-YYYY-NNNN)').setRequired(true))
    .addUserOption(o => o.setName('sedzia').setDescription('Nowy sędzia (musi należeć do staffu)').setRequired(true)),

  async execute(interaction) {
    // Sędzia sprawy jest niezmienny - wyjątek ma tylko właściciel serwera (np. sędzia odszedł z serwera)
    if (interaction.user.id !== interaction.guild.ownerId) {
      return interaction.reply({ ...karty.kartaBlad('Brak uprawnień', 'Sędziego może awaryjnie zmienić wyłącznie właściciel serwera.'), flags: EPHEMERAL_V2 });
    }
    const numer = interaction.options.getString('numer').trim().toUpperCase();
    const sprawa = q.poNumerze.get(numer);
    if (!sprawa) {
      return interaction.reply({ ...karty.kartaBlad('Brak sprawy', `Nie znaleziono sprawy **${numer}**.`), flags: EPHEMERAL_V2 });
    }
    if (!['przyjeta', 'w_toku'].includes(sprawa.status)) {
      return interaction.reply({ ...karty.kartaBlad('Nie można zmienić', 'Sędziego można zmienić tylko w sprawie, która ma sędziego i czeka na wyrok.'), flags: EPHEMERAL_V2 });
    }
    const nowy = interaction.options.getUser('sedzia');
    if (nowy.id === sprawa.sedzia_id) {
      return interaction.reply({ ...karty.kartaOstrzezenie('Bez zmian', `<@${nowy.id}> już jest sędzią tej sprawy.`), flags: EPHEMERAL_V2 });
    }
    const czlonek = await interaction.guild.members.fetch(nowy.id).catch(() => null);
    if (!czlonek || !jestStaff(czlonek)) {
      return interaction.reply({ ...karty.kartaBlad('Nieprawidłowy sędzia', 'Nowy sędzia musi być na serwerze i należeć do staffu.'), flags: EPHEMERAL_V2 });
    }
    const konflikt = konfliktInteresow(sprawa, nowy.id);
    if (konflikt) {
      return interaction.reply({ ...karty.kartaBlad('Konflikt interesów', `<@${nowy.id}> nie może orzekać: ${konflikt.replace(/^jesteś/, 'jest').replace(/^należysz/, 'należy')}.`), flags: EPHEMERAL_V2 });
    }
    const zajety = q.aktywnaSedziego.get(nowy.id);
    if (zajety) {
      return interaction.reply({ ...karty.kartaBlad('Sędzia zajęty', `<@${nowy.id}> prowadzi już sprawę **${zajety.numer}**.`), flags: EPHEMERAL_V2 });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await zmienSedziego(interaction.guild, sprawa, nowy.id, interaction.user.id);
    await interaction.editReply(karty.kartaSukces('Sędzia zmieniony', `Sprawę **${sprawa.numer}** prowadzi teraz <@${nowy.id}>.`));
  },
};
