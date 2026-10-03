const { ActivityType } = require('discord.js');

module.exports = {
  name: 'clientReady',
  once: true,
  async execute(client) {
    console.log(`Zalogowano jako ${client.user.tag}`);
    console.log(`[SNZ] Wersja kodu: ${require('../utils/wersja.js').wersjaKodu()}`);
    client.user.setPresence({
      activities: [{ name: 'Sojusz Narodów Zjednoczonych', type: ActivityType.Watching }],
      status: 'online',
    });

    // Zaplanuj cykliczne zadania
    const { uruchomZadaniaCykliczne } = require('../modules/listy-goncze.js');
    uruchomZadaniaCykliczne(client);
    require('../modules/listy-goncze.js').odswiezKartyZgloszen(client)
      .catch((e) => console.error('[ready] karty zgłoszeń', e));
    require('../modules/tickety.js').uruchomZadaniaTicketow(client);
    require('../modules/kopie.js').uruchomKopie();
    require('../modules/ochrona-logow.js').uruchomOchrone(client);
    await require('../modules/wolanie-moda.js').przywrocWezwania(client)
      .catch((e) => console.error('[ready] przywracanie wezwań', e));
  },
};
