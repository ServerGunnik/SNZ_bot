const { Client, GatewayIntentBits, Partials } = require('discord.js');
const config = require('./config.js');
const { zaladujKomendy } = require('./handlers/commandHandler.js');
const { zaladujEventy } = require('./handlers/eventHandler.js');
const { zaladujModuly } = require('./handlers/componentHandler.js');

if (!config.token) {
  console.error('Brak BOT_TOKEN w .env');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel],
});

zaladujKomendy(client);
zaladujEventy(client);
zaladujModuly(client);

process.on('unhandledRejection', (r) => console.error('[unhandledRejection]', r));
process.on('uncaughtException', (e) => console.error('[uncaughtException]', e));

client.login(config.token);
