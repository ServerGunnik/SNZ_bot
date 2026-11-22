const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const db = require('../database/db.js');
const config = require('../config.js');
const karty = require('../utils/karty.js');
const { jestStaff } = require('../utils/uprawnienia.js');
const { log } = require('../utils/logger.js');
const kolory = require('../utils/kolory.js');
const { liczAktywne, ostrzezeniaUzytkownika, czyAktywne } = require('../modules/ostrzezenia.js');
const { zalozSpraweZaOstrzezenia } = require('../modules/sad.js');

const q = {
  wstaw: db.prepare('INSERT INTO ostrzezenia (user_id, powod, wystawca_id, data) VALUES (?, ?, ?, ?)'),
  wszystkie: db.prepare('SELECT COUNT(*) c FROM ostrzezenia WHERE user_id = ?'),
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Wystaw ostrzeżenie użytkownikowi')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setDMPermission(false)
    .addUserOption(o => o.setName('uzytkownik').setDescription('Osoba do ostrzeżenia').setRequired(true))
    .addStringOption(o => o.setName('powod').setDescription('Powód').setRequired(true)),

  async execute(interaction) {
    if (!jestStaff(interaction.member)) {
      return interaction.reply({
        ...karty.kartaBlad('Brak uprawnień', 'Tylko staff.'),
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
    }
    const user = interaction.options.getUser('uzytkownik');
    const powod = interaction.options.getString('powod');
    // Założenie kanału sprawy może potrwać dłużej niż 3 s, które Discord daje na odpowiedź
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const info = q.wstaw.run(user.id, powod, interaction.user.id, Date.now());
    // Do progów liczą się tylko aktywne ostrzeżenia (niewygasłe, bez wyroków sądu - patrz config.ostrzezenia)
    const suma = liczAktywne(user.id);
    const wszystkie = q.wszystkie.get(user.id).c;
    const prog = config.ostrzezenia.prog;
    const wlaczony = (p) => p > 0 && suma >= p;

    let auto = '';
    // Rozprawa z urzędu - jedna otwarta naraz na osobę
    if (wlaczony(prog.rozprawa) && !user.bot) {
      try {
        const aktywne = ostrzezeniaUzytkownika(user.id).filter(w => czyAktywne(w));
        const wynik = await zalozSpraweZaOstrzezenia(interaction.guild, {
          userId: user.id, wystawcaId: interaction.user.id, ostrzezenia: aktywne,
        });
        auto += wynik.istniejaca
          ? `\n**Rozprawa:** gracz ma już otwartą sprawę z urzędu **${wynik.istniejaca.numer}**${wynik.istniejaca.kanal_id ? ` (<#${wynik.istniejaca.kanal_id}>)` : ''}.`
          : `\n**Autokara:** rozprawa sądowa **${wynik.sprawa.numer}** — <#${wynik.kanal.id}>.`;
      } catch (e) {
        console.error('[warn] rozprawa z urzędu', e);
        auto += `\n**Rozprawa:** nie udało się założyć sprawy (${e.message}). Złóż ją ręcznie przez \`/pozew\`.`;
      }
    }
    // Opcjonalne automatyczne kary (domyślnie wyłączone: prog 0)
    const member = (wlaczony(prog.ban) || wlaczony(prog.mute))
      ? await interaction.guild.members.fetch(user.id).catch(() => null)
      : null;
    if (member) {
      if (wlaczony(prog.ban)) {
        await member.ban({ reason: `Automat: ${suma} ostrzeżeń` }).catch(() => {});
        auto += `\n**Autokara:** BAN po ${suma} warnach.`;
      } else if (wlaczony(prog.mute)) {
        await member.timeout(config.ostrzezenia.dlugoscMuteMs, `Automat: ${suma} ostrzeżeń`).catch(() => {});
        auto += `\n**Autokara:** wyciszenie ${Math.round(config.ostrzezenia.dlugoscMuteMs / 60000)} min.`;
      }
    }

    await log(interaction.client, {
      tytul: 'Wystawiono ostrzeżenie',
      opis: `**Użytkownik:** <@${user.id}>\n**Powód:** ${powod}\n**Wystawca:** <@${interaction.user.id}>\n**Aktywne warny:** ${suma} (wszystkich: ${wszystkie})${auto}`,
      kolor: kolory.ostrzezenie,
    });
    await interaction.editReply(karty.kartaSukces('Ostrzeżenie wystawione',
      `\`#${info.lastInsertRowid}\` dla <@${user.id}>. Aktywnych: **${suma}** (wszystkich: ${wszystkie}).${auto}`));
  },
};
