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
    GatewayIntentBits.GuildModeration,
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

client.login(config.token).catch((e) => {
  if (/disallowed intents/i.test(e?.message || '')) {
    console.error(
      '\n[BŁĄD] Discord odrzucił połączenie: "Used disallowed intents".\n' +
      'Bot używa uprzywilejowanych intencji, które trzeba włączyć ręcznie:\n' +
      '  1. Wejdź na https://discord.com/developers/applications i wybierz aplikację bota\n' +
      '  2. Zakładka "Bot" -> sekcja "Privileged Gateway Intents"\n' +
      '  3. Włącz "SERVER MEMBERS INTENT" oraz "MESSAGE CONTENT INTENT" i zapisz zmiany\n' +
      '  4. Uruchom bota ponownie (npm start)\n'
    );
  } else if (/invalid token/i.test(e?.message || '') || e?.code === 'TokenInvalid') {
    console.error('\n[BŁĄD] Nieprawidłowy BOT_TOKEN w .env. Wygeneruj nowy token w zakładce "Bot" portalu deweloperskiego.\n');
  } else {
    console.error('[login]', e);
  }
  process.exit(1);
});
