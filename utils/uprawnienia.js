const { PermissionFlagsBits } = require('discord.js');
const config = require('../config.js');

// Przyjmuje pojedyncze ID albo tablicę ID (role w configu to listy po przecinku)
function maRole(member, role) {
  if (!member?.roles?.cache || !role) return false;
  const lista = Array.isArray(role) ? role : [role];
  return lista.some(id => id && member.roles.cache.has(id));
}

// Format pingu dla listy ID; zwraca też allowedMentions, żeby nie wysyłać ciszy
function pingRol(role) {
  const lista = (Array.isArray(role) ? role : [role]).filter(Boolean);
  return {
    tekst: lista.map(id => `<@&${id}>`).join(' '),
    role: lista,
    pusta: lista.length === 0,
  };
}

// Właściciel serwera i technik (TECHNIK_ID) omijają wszystkie checki uprawnień bota
function wszechwladny(member) {
  const uid = member?.id || member?.user?.id;
  if (!uid) return false;
  if (member.guild?.ownerId === uid) return true;
  return config.technicy.includes(uid);
}

const jestStaff = (member) => wszechwladny(member) || maRole(member, config.role.staff);
const jestLider = (member) => wszechwladny(member) || maRole(member, config.role.lider);
const jestSedzia = (member) => wszechwladny(member) || maRole(member, config.role.sedzia);
const jestZweryfikowany = (member) => wszechwladny(member) || maRole(member, config.role.zweryfikowany);

// Uprawnienia, które pozwalają zniszczyć serwer - pilnuje ich antynuke i selfrole
const UPRAWNIENIA_ADMINISTRACYJNE = [
  PermissionFlagsBits.Administrator,
  PermissionFlagsBits.ManageGuild,
  PermissionFlagsBits.ManageRoles,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.ManageWebhooks,
  PermissionFlagsBits.BanMembers,
  PermissionFlagsBits.KickMembers,
];

// Selfrole dodatkowo nie może rozdawać uprawnień moderacyjnych
const UPRAWNIENIA_NIE_DLA_SELFROLE = [
  ...UPRAWNIENIA_ADMINISTRACYJNE,
  PermissionFlagsBits.MentionEveryone,
  PermissionFlagsBits.ModerateMembers,
  PermissionFlagsBits.ManageMessages,
  PermissionFlagsBits.ManageNicknames,
  PermissionFlagsBits.MoveMembers,
  PermissionFlagsBits.ViewAuditLog,
];

function maUprawnienia(bitfield, lista) {
  const bity = BigInt(bitfield ?? 0);
  return lista.some(p => (bity & p) === p);
}

const rolaAdministracyjna = (rola) => Boolean(rola) && maUprawnienia(rola.permissions.bitfield, UPRAWNIENIA_ADMINISTRACYJNE);

module.exports = {
  maRole, pingRol, wszechwladny, jestStaff, jestLider, jestSedzia, jestZweryfikowany,
  UPRAWNIENIA_ADMINISTRACYJNE, UPRAWNIENIA_NIE_DLA_SELFROLE, maUprawnienia, rolaAdministracyjna,
};
