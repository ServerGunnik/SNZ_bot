const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const karty = require('../utils/karty.js');
const { jestStaff } = require('../utils/uprawnienia.js');
const { log } = require('../utils/logger.js');
const kolory = require('../utils/kolory.js');

const EPHEMERAL_V2 = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;
const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000; // Discord limit: 28 dni

// Parsuje "30m", "2h", "7d" na milisekundy. Bez jednostki = minuty.
function parsujCzas(txt) {
  if (!txt) return null;
  const m = txt.trim().toLowerCase().match(/^(\d+)\s*(s|m|h|d)?$/);
  if (!m) return null;
  const liczba = parseInt(m[1], 10);
  const jednostki = { s: 1000, m: 60 * 1000, h: 60 * 60 * 1000, d: 24 * 60 * 60 * 1000 };
  return liczba * (jednostki[m[2] || 'm']);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mute')
    .setDescription('Wycisz użytkownika (Discord timeout, max 28 dni)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setDMPermission(false)
    .addUserOption(o => o.setName('uzytkownik').setDescription('Kogo wyciszyć').setRequired(true))
    .addStringOption(o => o.setName('czas').setDescription('Czas, np. 30m, 2h, 7d (max 28d)').setRequired(true))
    .addStringOption(o => o.setName('powod').setDescription('Powód').setRequired(true)),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (!jestStaff(interaction.member)) {
      return interaction.editReply(karty.kartaBlad('Brak uprawnień', 'Komenda dla staffu.'));
    }

    const user = interaction.options.getUser('uzytkownik');
    const czasTxt = interaction.options.getString('czas');
    const powod = interaction.options.getString('powod');

    if (user.id === interaction.user.id) {
      return interaction.editReply(karty.kartaBlad('Nieprawidłowy cel', 'Nie możesz wyciszyć samego siebie.'));
    }
    if (user.bot) {
      return interaction.editReply(karty.kartaBlad('Nieprawidłowy cel', 'Botów nie da się wyciszyć (Discord). Zbanuj albo wyrzuć.'));
    }

    const czasMs = parsujCzas(czasTxt);
    if (!czasMs || czasMs < 1000) {
      return interaction.editReply(karty.kartaBlad('Nieprawidłowy czas', 'Użyj np. `30m`, `2h`, `7d`. Jednostki: `s`, `m`, `h`, `d`. Bez jednostki = minuty.'));
    }
    if (czasMs > MAX_TIMEOUT_MS) {
      return interaction.editReply(karty.kartaBlad('Za długi czas', 'Discord pozwala na mute maks. 28 dni.'));
    }

    const czlonek = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (!czlonek) {
      return interaction.editReply(karty.kartaBlad('Brak użytkownika', 'Tej osoby nie ma na serwerze.'));
    }
    if (!czlonek.moderatable) {
      return interaction.editReply(karty.kartaBlad('Nie można wyciszyć', 'Ta osoba ma wyższą rolę niż bot albo jest właścicielem serwera.'));
    }

    const wynik = await czlonek.timeout(czasMs, `${powod} (przez ${interaction.user.tag})`).then(() => null).catch(e => e.message);
    if (wynik) {
      return interaction.editReply(karty.kartaBlad('Nie udało się wyciszyć', wynik));
    }

    const koniec = Math.floor((Date.now() + czasMs) / 1000);
    await log(interaction.client, {
      tytul: 'Mute (ręczny)',
      opis: `**Kogo:** <@${user.id}>\n**Czas:** ${czasTxt} (do <t:${koniec}:f>)\n**Powód:** ${powod}\n**Wyciszył:** <@${interaction.user.id}>`,
      kolor: kolory.ostrzezenie,
    });

    return interaction.editReply(karty.kartaSukces('Wyciszono',
      `<@${user.id}> wyciszony na **${czasTxt}** (do <t:${koniec}:R>).\n**Powód:** ${powod}`));
  },
};
