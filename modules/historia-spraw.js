// Historia spraw sądowych (/historia-spraw): lista z filtrami i stronicowaniem + szczegóły sprawy.
// Administracja, ranga sądu i sędziowie widzą wszystkie sprawy; pozostali tylko te, w których brali udział
// (oraz szczegóły spraw z wyrokiem opublikowanym publicznie).
const { MessageFlags } = require('discord.js');
const db = require('../database/db.js');
const karty = require('../utils/karty.js');
const { jestStaff, jestSedzia, mozeZdjacCooldownSadu } = require('../utils/uprawnienia.js');
const { idPozwanego, stanWykonania } = require('./sad.js');

const EPHEMERAL_V2 = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;
const NA_STRONE = 5;

const STATUSY = {
  wszystkie: null,
  w_toku: ['zlozona', 'przyjeta', 'w_toku', 'odwolanie'],
  zakonczone: ['wyrok', 'zamknieta'],
};

const q = {
  wszystkie: db.prepare('SELECT * FROM sprawy ORDER BY id DESC'),
  poId: db.prepare('SELECT * FROM sprawy WHERE id = ?'),
  poNumerze: db.prepare('SELECT * FROM sprawy WHERE numer = ? COLLATE NOCASE'),
  sprawyZKaraUsera: db.prepare('SELECT DISTINCT sprawa_id FROM sprawy_kary WHERE user_id = ?'),
  liczbaDowodow: db.prepare('SELECT COUNT(*) c FROM sprawy_dowody WHERE sprawa_id = ?'),
};

function pelnyDostep(member) {
  return jestStaff(member) || mozeZdjacCooldownSadu(member) || jestSedzia(member);
}

// Kim był użytkownik w sprawie (puste = nie brał udziału)
function roleWSprawie(sprawa, userId, ukarane = null) {
  if (!userId) return [];
  const role = [];
  if (sprawa.pozywajacy_id === userId) role.push('pozywający');
  if (idPozwanego(sprawa) === userId) role.push(sprawa.pozwany_typ === 'panstwo' ? 'pozwany (król państwa)' : 'pozwany');
  if (sprawa.sedzia_id === userId) role.push('sędzia');
  if (sprawa.poprzedni_sedzia === userId) role.push('poprzedni sędzia');
  if (sprawa.prokurator_id === userId) role.push('prokurator');
  const zKara = ukarane || new Set(q.sprawyZKaraUsera.all(userId).map(r => r.sprawa_id));
  if (zKara.has(sprawa.id) && !role.some(r => r.startsWith('pozw') || r === 'pozywający')) role.push('ukarany(a)');
  return role;
}

const zakodujStan = ({ gracz, sedzia, status }) => `${gracz || '-'}:${sedzia || '-'}:${status}`;
function odkodujStan(czesci) {
  const [gracz, sedzia, status] = czesci;
  return {
    gracz: gracz && gracz !== '-' ? gracz : null,
    sedzia: sedzia && sedzia !== '-' ? sedzia : null,
    status: status in STATUSY ? status : 'wszystkie',
  };
}

// Widok listy. Bez pełnego dostępu filtr gracza jest zawsze ustawiony na pytającego.
function widokHistorii(member, { gracz = null, sedzia = null, status = 'wszystkie', strona = 1, guildId }) {
  const pelny = pelnyDostep(member);
  const filtr = {
    gracz: pelny ? gracz : member.id,
    sedzia: pelny ? sedzia : null,
    status: status in STATUSY ? status : 'wszystkie',
  };
  const ukarane = filtr.gracz ? new Set(q.sprawyZKaraUsera.all(filtr.gracz).map(r => r.sprawa_id)) : null;
  const statusy = STATUSY[filtr.status];

  const sprawy = q.wszystkie.all().filter(s =>
    (!statusy || statusy.includes(s.status)) &&
    (!filtr.sedzia || s.sedzia_id === filtr.sedzia) &&
    (!filtr.gracz || roleWSprawie(s, filtr.gracz, ukarane).length > 0));

  const stron = Math.max(1, Math.ceil(sprawy.length / NA_STRONE));
  const s = Math.min(Math.max(1, strona), stron);
  const wpisy = sprawy.slice((s - 1) * NA_STRONE, s * NA_STRONE).map(sprawa => ({
    sprawa,
    role: filtr.gracz ? roleWSprawie(sprawa, filtr.gracz, ukarane) : null,
    wykonanie: sprawa.wyrok_data ? stanWykonania(sprawa) : null,
  }));

  return karty.kartaHistoriiSpraw({
    wpisy,
    total: sprawy.length,
    strona: s,
    stron,
    stan: zakodujStan(filtr),
    filtr,
    podsumowanie: filtr.gracz ? podsumowanieGracza(sprawy, filtr.gracz, ukarane) : null,
    ograniczone: !pelny,
    guildId,
  });
}

// Statystyka gracza z wszystkich spraw spełniających filtr (nie tylko z bieżącej strony)
function podsumowanieGracza(sprawy, userId, ukarane) {
  const licz = (rola) => sprawy.filter(s => roleWSprawie(s, userId, ukarane).some(r => r.startsWith(rola))).length;
  let kar = 0;
  let splaconych = 0;
  for (const sprawa of sprawy) {
    if (!sprawa.wyrok_data && !ukarane.has(sprawa.id)) continue;
    const z = stanWykonania(sprawa).zobowiazani.find(o => o.userId === userId);
    if (!z) continue;
    kar += z.karyId.length;
    if (z.splata) splaconych += z.karyId.length;
  }
  return `**Pozwany(a):** ${licz('pozwany')} • **Pozywający(a):** ${licz('pozywający')} • **Sędzia:** ${licz('sędzia')} • **Prokurator:** ${licz('prokurator')}\n` +
    `**Kary:** ${kar}${kar ? ` (spłacone: ${splaconych}, niespłacone: ${kar - splaconych})` : ''}`;
}

// Szczegóły jednej sprawy. Zwraca kartę albo { blad }.
function widokSzczegolow(member, sprawa, { guildId, powrot = null }) {
  if (!sprawa) return { blad: 'Nie znaleziono takiej sprawy.' };
  const pelny = pelnyDostep(member);
  const udzial = roleWSprawie(sprawa, member.id).length > 0;
  if (!pelny && !udzial && !sprawa.wyrok_publiczny) {
    return { blad: `Sprawa **${sprawa.numer}** nie jest publiczna i nie brałeś(aś) w niej udziału.` };
  }
  return karty.kartaSzczegolowSprawy({
    sprawa,
    // Dodatkowe kary mogą istnieć jeszcze przed wyrokiem - stan liczymy zawsze
    wykonanie: stanWykonania(sprawa),
    liczbaDowodow: q.liczbaDowodow.get(sprawa.id).c,
    guildId,
    powrot,
  });
}

// hspr:str:<gracz>:<sedzia>:<status>:<strona>
async function onStrona(interaction) {
  const czesci = interaction.customId.split(':');
  const stan = odkodujStan(czesci.slice(2, 5));
  await interaction.update(widokHistorii(interaction.member, {
    ...stan, strona: parseInt(czesci[5], 10) || 1, guildId: interaction.guild.id,
  }));
}

// hspr:szcz:<gracz>:<sedzia>:<status>:<strona> (select z numerem sprawy)
async function onSzczegoly(interaction) {
  const czesci = interaction.customId.split(':');
  const sprawa = q.poId.get(parseInt(interaction.values?.[0], 10));
  const powrot = `hspr:str:${czesci.slice(2, 6).join(':')}`;
  const wynik = widokSzczegolow(interaction.member, sprawa, { guildId: interaction.guild.id, powrot });
  if (wynik.blad) {
    return interaction.reply({ ...karty.kartaBlad('Brak dostępu', wynik.blad), flags: EPHEMERAL_V2 });
  }
  await interaction.update(wynik);
}

function rejestruj({ zarejestruj }) {
  zarejestruj('hspr:str', onStrona);
  zarejestruj('hspr:szcz', onSzczegoly);
}

module.exports = { rejestruj, widokHistorii, widokSzczegolow, roleWSprawie, pelnyDostep, q };
