const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const db = require('../database/db.js');
const config = require('../config.js');
const karty = require('../utils/karty.js');
const { jestStaff, jestLider } = require('../utils/uprawnienia.js');
const { walidujNick } = require('../utils/minecraft.js');
const { opublikujList } = require('../modules/listy-goncze.js');
const { log } = require('../utils/logger.js');
const kolory = require('../utils/kolory.js');

const q = {
  utworz: db.prepare('INSERT INTO listy_goncze (nick, powod, nagroda, wystawca_id, wystawca_panstwo_id, status, wygasa, utworzony) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'),
  panstwoLidera: db.prepare('SELECT * FROM panstwa WHERE lider_id = ?'),
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('list-gonczy')
    .setDescription('Wystaw list gończy')
    .setDMPermission(false)
    .addStringOption(o => o.setName('nick').setDescription('Nick poszukiwanego').setRequired(true))
    .addStringOption(o => o.setName('powod').setDescription('Powód').setRequired(true))
    .addStringOption(o => o.setName('nagroda').setDescription('Nagroda (np. 5 diamentów)'))
    .addIntegerOption(o => o.setName('waznosc-dni').setDescription('Ważność w dniach').setMinValue(1).setMaxValue(365)),

  async execute(interaction) {
    const czyStaff = jestStaff(interaction.member);
    const czyLider = jestLider(interaction.member);
    if (!czyStaff && !czyLider) {
      return interaction.reply({
        ...karty.kartaBlad('Brak uprawnień', 'Listy gończe mogą wystawiać liderzy państw i staff.'),
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
    }
    const nick = interaction.options.getString('nick').trim();
    if (!walidujNick(nick)) {
      return interaction.reply({
        ...karty.kartaBlad('Nieprawidłowy nick', 'Nick musi mieć 3–16 znaków (litery, cyfry, podkreślnik).'),
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
    }
    const powod = interaction.options.getString('powod');
    const nagroda = interaction.options.getString('nagroda') || null;
    const dni = interaction.options.getInteger('waznosc-dni') || config.listyGoncze.domyslnaWaznoscDni;
    const wygasa = Date.now() + dni * 24 * 60 * 60 * 1000;

    const panstwoLidera = q.panstwoLidera.get(interaction.user.id);
    const status = czyStaff ? 'aktywny' : 'oczekuje';

    const info = q.utworz.run(
      nick, powod, nagroda, interaction.user.id,
      panstwoLidera?.id || null, status, wygasa, Date.now()
    );
    const listId = info.lastInsertRowid;

    if (status === 'aktywny') {
      const blad = await opublikujList(interaction.client, listId);
      await interaction.reply({
        ...(blad
          ? karty.kartaOstrzezenie('List aktywny, ale nieopublikowany', `List **#${listId}** na \`${nick}\` jest aktywny, ale nie trafił na kanał: ${blad}.`)
          : karty.kartaSukces('List gończy opublikowany', `List **#${listId}** na \`${nick}\` jest już aktywny.`)),
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
    } else {
      // Zgłoszenie do zatwierdzenia staffowi
      await log(interaction.client, {
        tytul: 'List gończy oczekuje zatwierdzenia',
        opis: `**ID:** #${listId}\n**Nick:** \`${nick}\`\n**Powód:** ${powod}\n**Nagroda:** ${nagroda || 'brak'}\n**Wystawca:** <@${interaction.user.id}>${panstwoLidera ? ` (${panstwoLidera.nazwa})` : ''}\n\nUżyj \`/list-gonczy-admin zatwierdz id:${listId}\` lub \`/list-gonczy-admin odrzuc id:${listId}\`.`,
        kolor: kolory.ostrzezenie,
      });
      await interaction.reply({
        ...karty.kartaOstrzezenie('Oczekuje zatwierdzenia', `List **#${listId}** trafił do staffu. Otrzymasz wiadomość prywatną po rozpatrzeniu.`),
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
    }
  },
};
