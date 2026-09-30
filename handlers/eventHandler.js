const fs = require('fs');
const path = require('path');

function zaladujEventy(client) {
  const katalog = path.join(__dirname, '..', 'events');
  if (!fs.existsSync(katalog)) return;
  for (const plik of fs.readdirSync(katalog).filter(f => f.endsWith('.js'))) {
    const event = require(path.join(katalog, plik));
    if (!event?.name) continue;
    const handler = (...args) => event.execute(...args, client);
    if (event.once) client.once(event.name, handler);
    else client.on(event.name, handler);
    console.log(`[events] podpięto ${event.name}`);
  }
}

module.exports = { zaladujEventy };
