const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const db = require('../database/db.js');
const karty = require('../utils/karty.js');
const { jestStaff } = require('../utils/uprawnienia.js');
const { log } = require('../utils/logger.js');
const kolory = require('../utils/kolory.js');

const q = { poKanale: db.prepare("SELECT * FROM tickety WHERE kanal_id = ? AND status = 'otwarty'") };
const EPHEMERAL_V2 = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Zarządzanie bieżącym ticketem (administracja)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .setDMPermission(false)
    .addSubcommand(s => s.setName('dodaj').setDescription('Dodaj osobę do tego ticketu')
      .addUserOption(o => o.setName('uzytkownik').setDescription('Kogo dodać').setRequired(true)))
    .addSubcommand(s => s.setName('usun').setDescription('Usuń osobę z tego ticketu')
      .addUserOption(o => o.setName('uzytkownik').setDescription('Kogo usunąć').setRequired(true))),

  async execute(interaction) {
    if (!jestStaff(interaction.member)) {
      return interaction.reply({ ...karty.kartaBlad('Brak uprawnień', 'Ta komenda jest dla administracji.'), flags: EPHEMERAL_V2 });
    }
    const ticket = q.poKanale.get(interaction.channel.id);
    if (!ticket) {
      return interaction.reply({ ...karty.kartaBlad('To nie jest ticket', 'Użyj komendy na kanale otwartego ticketu.'), flags: EPHEMERAL_V2 });
    }
    const user = interaction.options.getUser('uzytkownik');
    const dodaj = interaction.options.getSubcommand() === 'dodaj';

    if (!dodaj && user.id === ticket.user_id) {
      return interaction.reply({ ...karty.kartaBlad('Nie można usunąć', 'Autora zgłoszenia nie można usunąć z ticketu.'), flags: EPHEMERAL_V2 });
    }
    if (user.bot) {
      return interaction.reply({ ...karty.kartaBlad('Bot', 'Botów nie dodaje się do ticketów.'), flags: EPHEMERAL_V2 });
    }

    const ok = dodaj
      ? await interaction.channel.permissionOverwrites.edit(user.id, {
        ViewChannel: true, SendMessages: true, AttachFiles: true, ReadMessageHistory: true,
      }, { reason: `Ticket #${ticket.id}: dodał ${interaction.user.tag}` }).then(() => true).catch(() => false)
      : await interaction.channel.permissionOverwrites.delete(user.id, `Ticket #${ticket.id}: usunął ${interaction.user.tag}`).then(() => true).catch(() => false);
    if (!ok) {
      return interaction.reply({ ...karty.kartaBlad('Błąd uprawnień', 'Bot nie może zmienić uprawnień tego kanału.'), flags: EPHEMERAL_V2 });
    }

    await interaction.reply({
      ...karty.kartaSukces(dodaj ? 'Dodano do ticketu' : 'Usunięto z ticketu', `<@${user.id}> ${dodaj ? 'ma teraz dostęp do' : 'nie ma już dostępu do'} tego zgłoszenia.`),
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { users: dodaj ? [user.id] : [] },
    });
    await log(interaction.client, {
      tytul: dodaj ? `Dodano osobę do ticketu #${ticket.id}` : `Usunięto osobę z ticketu #${ticket.id}`,
      opis: `**Osoba:** <@${user.id}>\n**Kanał:** <#${ticket.kanal_id}>\n**Przez:** <@${interaction.user.id}>`,
      kolor: kolory.info,
      kanal: 'logiTickety',
    });
  },
};
