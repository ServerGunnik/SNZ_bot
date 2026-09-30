const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');
const config = require('./config.js');

const komendy = [];
const katalog = path.join(__dirname, 'commands');
for (const plik of fs.readdirSync(katalog).filter(f => f.endsWith('.js'))) {
  const k = require(path.join(katalog, plik));
  if (k?.data) komendy.push(k.data.toJSON());
}

(async () => {
  if (!config.token || !config.clientId || !config.guildId) {
    console.error('Brak BOT_TOKEN / CLIENT_ID / GUILD_ID w .env');
    process.exit(1);
  }
  const rest = new REST({ version: '10' }).setToken(config.token);
  console.log(`Rejestruję ${komendy.length} komend guildowych...`);
  await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), { body: komendy });
  console.log('Gotowe.');
})().catch(console.error);
