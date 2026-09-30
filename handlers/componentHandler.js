// Rejestr handlerów dla przycisków, selectów i modali (customId => handler).
// Handler dobierany po prefiksie (segmenty rozdzielone ':').
// Przykład customId: "panstwo:str:12:3" -> szuka "panstwo:str:12:3", potem "panstwo:str:12", "panstwo:str", "panstwo".

const rejestr = new Map();

function zarejestruj(prefix, handler) {
  rejestr.set(prefix, handler);
}

function znajdz(customId) {
  const segmenty = customId.split(':');
  for (let i = segmenty.length; i > 0; i--) {
    const klucz = segmenty.slice(0, i).join(':');
    if (rejestr.has(klucz)) return rejestr.get(klucz);
  }
  return null;
}

function zaladujModuly(client) {
  const fs = require('fs');
  const path = require('path');
  const katalog = path.join(__dirname, '..', 'modules');
  if (!fs.existsSync(katalog)) return;
  for (const plik of fs.readdirSync(katalog).filter(f => f.endsWith('.js'))) {
    const mod = require(path.join(katalog, plik));
    if (typeof mod.rejestruj === 'function') {
      mod.rejestruj({ zarejestruj, client });
      console.log(`[modules] załadowano ${plik}`);
    }
  }
}

module.exports = { zarejestruj, znajdz, zaladujModuly };
