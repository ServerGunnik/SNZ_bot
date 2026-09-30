const config = require('../config.js');

function glowaUrl(nick) {
  return config.listyGoncze.apiGlowyUrl(nick);
}

function walidujNick(nick) {
  return config.weryfikacja.regexNicka.test(nick);
}

module.exports = { glowaUrl, walidujNick };
