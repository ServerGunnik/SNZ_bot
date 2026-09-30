// Publiczna lista państw sojuszu (/sojusz-lista) + config JSON dla moda.
const { MessageFlags, AttachmentBuilder } = require('discord.js');
const config = require('../config.js');
const karty = require('../utils/karty.js');
const { stronicuj } = require('../utils/paginacja.js');
const { wszystkiePanstwa, panstwoPoId, skladPanstwa, configSojuszu } = require('./panstwa.js');

const EPHEMERAL_V2 = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;
const MAX_PODGLAD = 3000;

function widokListy(strona = 1) {
  const panstwa = wszystkiePanstwa().map(panstwo => ({ panstwo, sklad: skladPanstwa(panstwo) }));
  const p = stronicuj(panstwa, strona, config.panstwa.panstwNaStrone);
  return karty.kartaListySojuszu({
    wpisy: p.strona,
    strona: p.aktualnaStrona,
    stron: p.stron,
    liczbaPanstw: panstwa.length,
    liczbaGraczy: panstwa.reduce((n, w) => n + w.sklad.length, 0),
    statusy: config.panstwa.statusy,
  });
}

function widokSkladu(panstwo, strona = 1) {
  const sklad = skladPanstwa(panstwo);
  const naStrone = config.panstwa.czlonkowNaStrone;
  const p = stronicuj(sklad, strona, naStrone);
  return karty.kartaSkladuPanstwa({
    panstwo,
    sklad: p.strona,
    strona: p.aktualnaStrona,
    stron: p.stron,
    naStrone,
    total: sklad.length,
    statusy: config.panstwa.statusy,
  });
}

function wiadomoscConfigu() {
  const dane = configSojuszu();
  const json = JSON.stringify(dane, null, 2);
  const nazwaPliku = config.panstwa.plikConfigu;
  return {
    ...karty.kartaConfigu({
      nazwaPliku,
      liczbaWpisow: dane.length,
      podglad: json.length <= MAX_PODGLAD ? json : null,
    }),
    files: [new AttachmentBuilder(Buffer.from(json, 'utf8'), { name: nazwaPliku })],
  };
}

async function onStrona(interaction) {
  const [, , stronaStr] = interaction.customId.split(':');
  await interaction.update(widokListy(parseInt(stronaStr, 10) || 1));
}

async function onWyborPanstwa(interaction) {
  const panstwo = panstwoPoId(parseInt(interaction.values[0], 10));
  if (!panstwo) return interaction.update(widokListy(1));
  await interaction.update(widokSkladu(panstwo, 1));
}

async function onStronaSkladu(interaction) {
  const [, , idStr, stronaStr] = interaction.customId.split(':');
  const panstwo = panstwoPoId(parseInt(idStr, 10));
  if (!panstwo) return interaction.update(widokListy(1));
  await interaction.update(widokSkladu(panstwo, parseInt(stronaStr, 10) || 1));
}

async function onConfig(interaction) {
  await interaction.reply({ ...wiadomoscConfigu(), flags: EPHEMERAL_V2 });
}

function rejestruj({ zarejestruj }) {
  zarejestruj('sojuszlista:str', onStrona);
  zarejestruj('sojuszlista:panstwo', onWyborPanstwa);
  zarejestruj('sojuszlista:czl', onStronaSkladu);
  zarejestruj('sojuszlista:config', onConfig);
}

module.exports = { rejestruj, widokListy, wiadomoscConfigu };
