const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, ChannelType } = require('discord.js');
const db = require('../database/db.js');
const karty = require('../utils/karty.js');
const config = require('../config.js');
const { jestStaff } = require('../utils/uprawnienia.js');
const { log } = require('../utils/logger.js');
const kolory = require('../utils/kolory.js');

const EPHEMERAL_V2 = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;

const q = {
  aktywna: db.prepare('SELECT * FROM rekrutacja WHERE aktywna = 1 ORDER BY id DESC LIMIT 1'),
  wstaw: db.prepare('INSERT INTO rekrutacja (kategoria_id, poczekalnia_id, pokoj_id, utworzyl, utworzono) VALUES (?, ?, ?, ?, ?)'),
  zamknij: db.prepare('UPDATE rekrutacja SET aktywna = 0 WHERE id = ?'),
};

// Role staff/helper/lider/sedzia - wszyscy mają prawo mówić i widzieć wszystko
function rolaStaffowe() {
  return [
    ...config.role.staff,
    ...config.role.helper,
    ...config.role.lider,
    ...config.role.sedzia,
  ];
}

async function stworzKanaly(interaction) {
  const guild = interaction.guild;
  const istniejaca = q.aktywna.get();
  if (istniejaca) {
    const poczekalnia = guild.channels.cache.get(istniejaca.poczekalnia_id);
    const pokoj = guild.channels.cache.get(istniejaca.pokoj_id);
    if (poczekalnia || pokoj) {
      return interaction.editReply(karty.kartaOstrzezenie('Rekrutacja już trwa',
        `Istniejące kanały: ${poczekalnia ? `<#${poczekalnia.id}>` : '_poczekalnia usunięta_'} / ${pokoj ? `<#${pokoj.id}>` : '_pokój usunięty_'}\nNajpierw zakończ: \`/recru usun\``));
    }
    // Kanały zniknęły z serwera, ale wpis został - oznacz jako zamkniętą
    q.zamknij.run(istniejaca.id);
  }

  // Kategoria "Rekrutacja" - szukamy po nazwie albo tworzymy nową
  let kategoria = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === 'rekrutacja');
  if (!kategoria) {
    kategoria = await guild.channels.create({
      name: 'Rekrutacja',
      type: ChannelType.GuildCategory,
      reason: 'Rekrutacja: tworzę kategorię',
    }).catch(e => ({ blad: e.message }));
    if (kategoria?.blad) {
      return interaction.editReply(karty.kartaBlad('Nie udało się utworzyć kategorii', kategoria.blad));
    }
  }

  const everyoneId = guild.id;
  const botId = guild.client.user.id;
  const uprStaffu = [
    PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect,
    PermissionFlagsBits.Speak, PermissionFlagsBits.MuteMembers,
    PermissionFlagsBits.DeafenMembers, PermissionFlagsBits.MoveMembers,
    PermissionFlagsBits.PrioritySpeaker, PermissionFlagsBits.ManageChannels,
  ];
  const staffyIds = [...new Set(rolaStaffowe())];

  // Poczekalnia: wszyscy widzą i mogą dołączyć, ale NIE mogą mówić. Staff mówi i moderuje.
  const poczekalnia = await guild.channels.create({
    name: '📣 Poczekalnia rekrutacji',
    type: ChannelType.GuildVoice,
    parent: kategoria.id,
    reason: 'Rekrutacja: poczekalnia',
    permissionOverwrites: [
      { id: everyoneId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect], deny: [PermissionFlagsBits.Speak, PermissionFlagsBits.UseVAD, PermissionFlagsBits.Stream] },
      { id: botId, allow: [...uprStaffu, PermissionFlagsBits.ManageRoles] },
      ...staffyIds.map(id => ({ id, allow: uprStaffu })),
    ],
  }).catch(e => ({ blad: e.message }));
  if (poczekalnia?.blad) {
    return interaction.editReply(karty.kartaBlad('Nie udało się utworzyć poczekalni', poczekalnia.blad));
  }

  // Pokój rekrutacyjny: nikt NIE widzi/łączy sam z siebie - staff moderator wrzuca kandydata ręcznie przez „Przenieś".
  // Po wrzuceniu kandydat może mówić (bo overwrite dla @everyone pozwala Speak dla członków już w kanale - Connect zablokowany).
  const pokoj = await guild.channels.create({
    name: '🎯 Pokój rekrutacyjny',
    type: ChannelType.GuildVoice,
    parent: kategoria.id,
    reason: 'Rekrutacja: pokój do rozmowy',
    permissionOverwrites: [
      { id: everyoneId, deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect], allow: [PermissionFlagsBits.Speak, PermissionFlagsBits.UseVAD] },
      { id: botId, allow: [...uprStaffu, PermissionFlagsBits.MoveMembers] },
      ...staffyIds.map(id => ({ id, allow: [...uprStaffu, PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect] })),
    ],
  }).catch(e => ({ blad: e.message }));
  if (pokoj?.blad) {
    await poczekalnia.delete('Rollback - nieudane tworzenie pokoju rekrutacyjnego').catch(() => null);
    return interaction.editReply(karty.kartaBlad('Nie udało się utworzyć pokoju', pokoj.blad));
  }

  q.wstaw.run(kategoria.id, poczekalnia.id, pokoj.id, interaction.user.id, Date.now());

  await log(interaction.client, {
    tytul: 'Rekrutacja — utworzono kanały',
    opis: `**Poczekalnia:** <#${poczekalnia.id}>\n**Pokój rekrutacyjny:** <#${pokoj.id}>\n**Kategoria:** ${kategoria.name}\n**Utworzył:** <@${interaction.user.id}>`,
    kolor: kolory.info,
  });

  return interaction.editReply(karty.kartaSukces('Rekrutacja uruchomiona',
    `**Poczekalnia:** <#${poczekalnia.id}> — kandydaci dołączają tutaj (brak mikrofonu, nic nie powiedzą).\n` +
    `**Pokój rekrutacyjny:** <#${pokoj.id}> — staff wrzuca kandydata na rozmowę (prawy klik → Przenieś).\n\n` +
    'Po skończeniu rekrutacji: `/recru usun` — bot skasuje oba kanały.'));
}

async function usunKanaly(interaction) {
  const istniejaca = q.aktywna.get();
  if (!istniejaca) {
    return interaction.editReply(karty.kartaOstrzezenie('Brak aktywnej rekrutacji', 'Nic do usunięcia. Użyj `/recru stworz` żeby zacząć.'));
  }

  const guild = interaction.guild;
  const poczekalnia = guild.channels.cache.get(istniejaca.poczekalnia_id);
  const pokoj = guild.channels.cache.get(istniejaca.pokoj_id);
  const kategoria = istniejaca.kategoria_id && guild.channels.cache.get(istniejaca.kategoria_id);

  const usuniete = [];
  for (const [nazwa, kanal] of [['poczekalnia', poczekalnia], ['pokój', pokoj]]) {
    if (!kanal) continue;
    const ok = await kanal.delete(`Rekrutacja zakończona przez ${interaction.user.tag}`).then(() => true).catch(() => false);
    if (ok) usuniete.push(nazwa);
  }

  // Kategoria znika tylko jeśli jest pusta - może są tam inne kanały z poprzednich sesji
  if (kategoria && kategoria.children.cache.size === 0) {
    await kategoria.delete(`Rekrutacja zakończona przez ${interaction.user.tag}`).catch(() => null);
    usuniete.push('kategoria');
  }

  q.zamknij.run(istniejaca.id);

  await log(interaction.client, {
    tytul: 'Rekrutacja — usunięto kanały',
    opis: `**Usunięto:** ${usuniete.length ? usuniete.join(', ') : '_nic (kanały już nie istniały)_'}\n**Zakończył:** <@${interaction.user.id}>`,
    kolor: kolory.neutralny,
  });

  return interaction.editReply(karty.kartaSukces('Rekrutacja zakończona',
    `Usunięto: ${usuniete.length ? usuniete.join(', ') : '_nic — kanały już nie istniały_'}`));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('recru')
    .setDescription('System rekrutacji: poczekalnia + pokój do rozmów')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .setDMPermission(false)
    .addSubcommand(s => s.setName('stworz').setDescription('Utwórz poczekalnię i pokój rekrutacyjny'))
    .addSubcommand(s => s.setName('usun').setDescription('Usuń kanały rekrutacyjne (zakończ sesję)')),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (!jestStaff(interaction.member)) {
      return interaction.editReply(karty.kartaBlad('Brak uprawnień', 'Komenda tylko dla pełnego staffu.'));
    }

    const sub = interaction.options.getSubcommand();
    if (sub === 'stworz') return stworzKanaly(interaction);
    if (sub === 'usun') return usunKanaly(interaction);
  },
};
