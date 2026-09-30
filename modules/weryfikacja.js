const {
  ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, MessageFlags,
} = require('discord.js');
const db = require('../database/db.js');
const config = require('../config.js');
const karty = require('../utils/karty.js');
const { walidujNick } = require('../utils/minecraft.js');
const { log } = require('../utils/logger.js');
const kolory = require('../utils/kolory.js');

const stmtPoUser = db.prepare('SELECT * FROM weryfikacja WHERE user_id = ?');
const stmtPoNick = db.prepare('SELECT * FROM weryfikacja WHERE nick = ? COLLATE NOCASE');
const stmtZapisz = db.prepare('INSERT INTO weryfikacja (user_id, nick, data) VALUES (?, ?, ?)');

async function onStart(interaction) {
  const istnieje = stmtPoUser.get(interaction.user.id);
  if (istnieje) {
    return interaction.reply({
      ...karty.kartaOstrzezenie('Już zweryfikowany', `Twój nick to \`${istnieje.nick}\`. Skontaktuj się ze staffem, jeśli chcesz go zmienić.`),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  }
  const modal = new ModalBuilder()
    .setCustomId('weryfikacja:modal')
    .setTitle('Weryfikacja obywatela SNZ');
  const input = new TextInputBuilder()
    .setCustomId('nick')
    .setLabel('Nick z serwera Minecraft')
    .setPlaceholder('np. Steve123')
    .setStyle(TextInputStyle.Short)
    .setMinLength(config.weryfikacja.minDlugoscNicka)
    .setMaxLength(config.weryfikacja.maxDlugoscNicka)
    .setRequired(true);
  modal.addComponents(new ActionRowBuilder().addComponents(input));
  await interaction.showModal(modal);
}

async function onModal(interaction) {
  const nick = interaction.fields.getTextInputValue('nick').trim();

  if (!walidujNick(nick)) {
    return interaction.reply({
      ...karty.kartaBlad('Nieprawidłowy nick', 'Nick musi mieć 3–16 znaków i zawierać wyłącznie litery, cyfry oraz podkreślnik.'),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  }

  if (stmtPoUser.get(interaction.user.id)) {
    return interaction.reply({
      ...karty.kartaOstrzezenie('Już zweryfikowany', 'Twoje konto zostało już powiązane z nickiem Minecraft.'),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  }

  if (stmtPoNick.get(nick)) {
    return interaction.reply({
      ...karty.kartaBlad('Nick zajęty', 'Ten nick jest już powiązany z innym kontem Discord. Skontaktuj się ze staffem, jeśli to Twój nick.'),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  }

  const rola = interaction.guild.roles.cache.get(config.role.zweryfikowany);
  if (!rola) {
    return interaction.reply({
      ...karty.kartaBlad('Błąd konfiguracji', 'Rola zweryfikowanego nie istnieje. Skontaktuj się ze staffem.'),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  }

  try {
    await interaction.member.roles.add(rola, 'Weryfikacja przez bota');
    if (config.weryfikacja.zmienPseudonim && interaction.member.manageable) {
      await interaction.member.setNickname(nick, 'Weryfikacja').catch(() => null);
    }
  } catch (e) {
    return interaction.reply({
      ...karty.kartaBlad('Brak uprawnień bota', 'Bot nie może nadać roli. Sprawdź hierarchię ról i uprawnienia.'),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  }

  stmtZapisz.run(interaction.user.id, nick, Date.now());

  await interaction.reply({
    ...karty.kartaSukces('Weryfikacja pomyślna', `Witaj w Sojuszu Narodów Zjednoczonych, **${nick}**. Rola została nadana.`),
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  });

  await log(interaction.client, {
    tytul: 'Nowa weryfikacja',
    opis: `**Użytkownik:** <@${interaction.user.id}>\n**Nick MC:** \`${nick}\``,
    kolor: kolory.sukces,
  });
}

function rejestruj({ zarejestruj }) {
  zarejestruj('weryfikacja:start', onStart);
  zarejestruj('weryfikacja:modal', onModal);
}

module.exports = { rejestruj };
