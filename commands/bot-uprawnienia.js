const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const karty = require('../utils/karty.js');
const { jestStaff } = require('../utils/uprawnienia.js');
const { log } = require('../utils/logger.js');
const kolory = require('../utils/kolory.js');
const blokadaBotow = require('../modules/blokada-botow.js');

function odpowiedz(interaction, payload) {
  return interaction.reply({ ...payload, flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('bot-uprawnienia')
    .setDescription('Uprawnienia dodanych botów (zmienia je tylko właściciel)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addSubcommand(s => s.setName('lista').setDescription('Boty objęte blokadą i ich uprawnienia'))
    .addSubcommand(s => s.setName('przywroc').setDescription('Nadaj botowi uprawnienia, o które prosił przy dodaniu (tylko właściciel)')
      .addUserOption(o => o.setName('bot').setDescription('Bot').setRequired(true)))
    .addSubcommand(s => s.setName('zablokuj').setDescription('Odbierz uprawnienia botowi dodanemu wcześniej (tylko właściciel)')
      .addUserOption(o => o.setName('bot').setDescription('Bot').setRequired(true))),

  async execute(interaction) {
    const guild = interaction.guild;
    const czyWlasciciel = interaction.user.id === guild.ownerId;
    const sub = interaction.options.getSubcommand();

    if (sub === 'lista') {
      if (!czyWlasciciel && !jestStaff(interaction.member)) {
        return odpowiedz(interaction, karty.kartaBlad('Brak uprawnień', 'Ta komenda jest dla staffu.'));
      }
      const boty = blokadaBotow.lista();
      const pelny = boty.length
        ? boty.slice(0, 20).map(b =>
          `**<@${b.bot_id}>**${b.dodal ? ` — dodał <@${b.dodal}>` : ''}, <t:${Math.floor(b.data / 1000)}:d>\n` +
          `Teraz: ${blokadaBotow.nazwyUprawnien(b.dozwolone)}\n` +
          `Prosił o: ${b.rola_id ? blokadaBotow.nazwyUprawnien(b.pierwotne) : '_bot bez własnej roli_'}`
        ).join('\n\n') + (boty.length > 20 ? `\n\n…i ${boty.length - 20} więcej` : '')
        : '_Żaden bot nie jest objęty blokadą._';
      const opis = pelny.length > 3800 ? `${pelny.slice(0, 3800)}…` : pelny;
      return odpowiedz(interaction, karty.kartaInfo({
        tytul: 'Uprawnienia botów',
        opis,
        stopka: 'Zmienić je może tylko właściciel serwera: ręcznie w ustawieniach roli bota albo /bot-uprawnienia przywroc.',
      }));
    }

    if (!czyWlasciciel) {
      return odpowiedz(interaction, karty.kartaBlad('Brak uprawnień', 'Uprawnieniami botów zarządza wyłącznie właściciel serwera.'));
    }
    const user = interaction.options.getUser('bot');
    if (!user.bot) return odpowiedz(interaction, karty.kartaBlad('To nie bot', `<@${user.id}> nie jest botem.`));
    if (user.id === interaction.client.user.id) {
      return odpowiedz(interaction, karty.kartaBlad('Nieprawidłowy bot', 'Ta komenda nie dotyczy SNZ_bot.'));
    }

    if (sub === 'przywroc') {
      const wynik = await blokadaBotow.przywroc(guild, user.id);
      if (wynik.blad) return odpowiedz(interaction, karty.kartaBlad('Nie przywrócono', wynik.blad));
      await log(interaction.client, {
        tytul: 'Blokada botów — właściciel przywrócił uprawnienia',
        opis: `**Bot:** <@${user.id}>\n**Rola:** <@&${wynik.rola.id}>\n**Uprawnienia:** ${wynik.uprawnienia}`,
        kolor: kolory.ostrzezenie,
        kanal: 'logiAntynuke',
      });
      return odpowiedz(interaction, karty.kartaSukces('Uprawnienia przywrócone', `<@${user.id}> ma teraz: ${wynik.uprawnienia}`));
    }

    if (sub === 'zablokuj') {
      const member = await guild.members.fetch(user.id).catch(() => null);
      if (!member) return odpowiedz(interaction, karty.kartaBlad('Brak bota', 'Tego bota nie ma na serwerze.'));
      const wynik = await blokadaBotow.zablokuj(guild, member);
      return odpowiedz(interaction, karty.kartaSukces(
        'Bot objęty blokadą',
        wynik.rola
          ? `Rola <@&${wynik.rola.id}> nie ma już uprawnień. Zmiany innych osób będą cofane.`
          : `<@${user.id}> nie ma własnej roli — pilnuję, żeby nikt poza Tobą nie nadał mu ról ani uprawnień na kanałach.`
      ));
    }
  },
};
