const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const config = require('../config.js');
const karty = require('../utils/karty.js');
const { jestStaff } = require('../utils/uprawnienia.js');
const { log } = require('../utils/logger.js');
const kolory = require('../utils/kolory.js');
const antynuke = require('../modules/antynuke.js');

function odpowiedz(interaction, payload) {
  return interaction.reply({ ...payload, flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('antynuke')
    .setDescription('Ochrona serwera: antynuke i anty-raid')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addSubcommand(s => s.setName('status').setDescription('Pokaż ustawienia i stan ochrony'))
    .addSubcommand(s => s.setName('whitelist-dodaj').setDescription('Dodaj zaufaną osobę/bota (tylko właściciel)')
      .addUserOption(o => o.setName('uzytkownik').setDescription('Osoba lub bot').setRequired(true)))
    .addSubcommand(s => s.setName('whitelist-usun').setDescription('Usuń z whitelisty (tylko właściciel)')
      .addUserOption(o => o.setName('uzytkownik').setDescription('Osoba lub bot').setRequired(true)))
    .addSubcommand(s => s.setName('whitelist-lista').setDescription('Lista whitelisty'))
    .addSubcommand(s => s.setName('raid').setDescription('Ręcznie włącz/wyłącz tryb anty-raid')
      .addStringOption(o => o.setName('stan').setDescription('Stan trybu').setRequired(true)
        .addChoices({ name: 'włącz', value: 'wlacz' }, { name: 'wyłącz', value: 'wylacz' }))),

  async execute(interaction) {
    if (!jestStaff(interaction.member) && interaction.user.id !== interaction.guild.ownerId) {
      return odpowiedz(interaction, karty.kartaBlad('Brak uprawnień', 'Ta komenda jest dla staffu.'));
    }
    const sub = interaction.options.getSubcommand();
    const czyWlasciciel = interaction.user.id === interaction.guild.ownerId;

    if (sub === 'status') {
      const s = antynuke.status();
      const an = config.antynuke;
      const ar = config.antyraid;
      const opis =
        `**Antynuke:** ${s.antynuke ? 'włączony' : 'wyłączony'}\n` +
        `**Kara:** ${{ role: 'odebranie ról', kick: 'wyrzucenie', ban: 'ban' }[an.kara] || an.kara}\n` +
        `**Progi (w ${an.oknoMs / 1000}s):** bany ${an.progi.ban}, kicki ${an.progi.kick}, usunięte kanały ${an.progi.kanalUsun}, ` +
        `nowe kanały ${an.progi.kanalUtworz}, usunięte role ${an.progi.rolaUsun}, nadanie uprawnień admina ${an.progi.nadanieUprawnien} (zawsze cofane), ` +
        `webhooki ${an.progi.webhook}, uprawnienia kanałów ${an.progi.uprawnieniaKanalow}, ustawienia serwera ${an.progi.serwer}\n` +
        `**Przywracanie szkód:** ${an.przywracaj ? 'tak' : 'nie'}\n` +
        `**Blokada uprawnień nowych botów:** ${an.blokadaUprawnienBotow ? 'tak (zmienia je tylko właściciel, /bot-uprawnienia)' : 'nie'}\n` +
        `**Wyrzucanie botów dodanych spoza whitelisty:** ${an.wyrzucajBoty ? 'tak' : 'nie'}\n\n` +
        `**Anty-raid:** ${s.antyraid ? 'włączony' : 'wyłączony'} — próg ${ar.progDolaczen} dołączeń w ${ar.oknoMs / 1000}s\n` +
        `**Tryb anty-raid:** ${s.trybRaidu ? `AKTYWNY do <t:${Math.floor(s.trybRaiduDo / 1000)}:T>` : 'nieaktywny'}`;
      const bot = interaction.guild.members.me;
      const stopka = bot?.permissions.has(PermissionFlagsBits.ViewAuditLog)
        ? 'Rola bota powinna być jak najwyżej, inaczej nie ukarze osób z wyższą rolą.'
        : 'UWAGA: bot nie ma uprawnienia "Wyświetl dziennik zdarzeń" — antynuke nie działa!';
      return odpowiedz(interaction, karty.kartaInfo({ tytul: 'Ochrona serwera', opis, stopka }));
    }

    if (sub === 'whitelist-lista') {
      const zEnv = config.antynuke.whitelist;
      const zBazy = antynuke.listaWhitelisty();
      const opis =
        `**Zawsze:** właściciel <@${interaction.guild.ownerId}>, bot <@${interaction.client.user.id}>\n` +
        `**Z .env:** ${zEnv.length ? zEnv.map(id => `<@${id}>`).join(', ') : '_brak_'}\n` +
        `**Dodani komendą:** ${zBazy.length ? zBazy.map(id => `<@${id}>`).join(', ') : '_brak_'}`;
      return odpowiedz(interaction, karty.kartaInfo({ tytul: 'Whitelista antynuke', opis }));
    }

    if (sub === 'whitelist-dodaj' || sub === 'whitelist-usun') {
      if (!czyWlasciciel) {
        return odpowiedz(interaction, karty.kartaBlad('Brak uprawnień', 'Whitelistą zarządza wyłącznie właściciel serwera.'));
      }
      const user = interaction.options.getUser('uzytkownik');
      if (sub === 'whitelist-dodaj') {
        antynuke.dodajDoWhitelisty(user.id, interaction.user.id);
      } else if (!antynuke.usunZWhitelisty(user.id)) {
        return odpowiedz(interaction, karty.kartaOstrzezenie('Brak wpisu', `<@${user.id}> nie był na whiteliście (lub jest w .env).`));
      }
      const dodano = sub === 'whitelist-dodaj';
      await log(interaction.client, {
        tytul: dodano ? 'Antynuke — dodano do whitelisty' : 'Antynuke — usunięto z whitelisty',
        opis: `**Użytkownik:** <@${user.id}>\n**Przez:** <@${interaction.user.id}>`,
        kolor: dodano ? kolory.ostrzezenie : kolory.info,
        kanal: 'logiAntynuke',
      });
      return odpowiedz(interaction, karty.kartaSukces(
        dodano ? 'Dodano do whitelisty' : 'Usunięto z whitelisty',
        `<@${user.id}> ${dodano ? 'nie będzie blokowany przez antynuke' : 'znów podlega antynuke'}.`
      ));
    }

    if (sub === 'raid') {
      const wlacz = interaction.options.getString('stan') === 'wlacz';
      antynuke.ustawTrybRaidu(interaction.client, wlacz);
      await log(interaction.client, {
        tytul: wlacz ? 'Anty-raid — tryb włączony ręcznie' : 'Anty-raid — tryb wyłączony ręcznie',
        opis: `**Przez:** <@${interaction.user.id}>`,
        kolor: wlacz ? kolory.ostrzezenie : kolory.sukces,
        kanal: 'logiAntynuke',
      });
      return odpowiedz(interaction, karty.kartaSukces(
        wlacz ? 'Tryb anty-raid włączony' : 'Tryb anty-raid wyłączony',
        wlacz
          ? `Każdy nowy członek będzie wyrzucany przez ${Math.round(config.antyraid.czasTrybuMs / 60000)} min.`
          : 'Nowi członkowie mogą dołączać normalnie.'
      ));
    }
  },
};
