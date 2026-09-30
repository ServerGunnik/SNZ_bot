const fs = require('fs');
const path = require('path');
const { Collection } = require('discord.js');

function zaladujKomendy(client) {
  client.commands = new Collection();
  const katalog = path.join(__dirname, '..', 'commands');
  if (!fs.existsSync(katalog)) return;

  for (const plik of fs.readdirSync(katalog).filter(f => f.endsWith('.js'))) {
    const komenda = require(path.join(katalog, plik));
    if (komenda?.data?.name && typeof komenda.execute === 'function') {
      client.commands.set(komenda.data.name, komenda);
      console.log(`[commands] załadowano /${komenda.data.name}`);
    } else {
      console.warn(`[commands] pominięto ${plik}: brak data/execute`);
    }
  }
}

module.exports = { zaladujKomendy };
