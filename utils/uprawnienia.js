const { PermissionFlagsBits } = require('discord.js');
const config = require('../config.js');

function maRole(member, roleId) {
  return roleId && member?.roles?.cache?.has(roleId);
}

const jestStaff = (member) => maRole(member, config.role.staff);
const jestLider = (member) => maRole(member, config.role.lider);
const jestSedzia = (member) => maRole(member, config.role.sedzia);
const jestZweryfikowany = (member) => maRole(member, config.role.zweryfikowany);

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
  maRole, jestStaff, jestLider, jestSedzia, jestZweryfikowany,
  UPRAWNIENIA_ADMINISTRACYJNE, UPRAWNIENIA_NIE_DLA_SELFROLE, maUprawnienia, rolaAdministracyjna,
};
