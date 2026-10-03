const blokadaBotow = require('../modules/blokada-botow.js');

module.exports = {
  name: 'roleCreate',
  async execute(rola) {
    // Discord tworzy rolę zarządzaną bota przy jego dodaniu - od razu zerujemy jej uprawnienia
    if (!rola.tags?.botId) return;
    try {
      await blokadaBotow.zablokujRole(rola);
    } catch (e) {
      console.error('[roleCreate]', e);
    }
  },
};
