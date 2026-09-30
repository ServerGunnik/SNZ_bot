const config = require('../config.js');

function maRole(member, roleId) {
  return roleId && member?.roles?.cache?.has(roleId);
}

const jestStaff = (member) => maRole(member, config.role.staff);
const jestLider = (member) => maRole(member, config.role.lider);
const jestSedzia = (member) => maRole(member, config.role.sedzia);
const jestZweryfikowany = (member) => maRole(member, config.role.zweryfikowany);

module.exports = { maRole, jestStaff, jestLider, jestSedzia, jestZweryfikowany };
