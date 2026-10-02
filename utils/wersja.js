// Wersja kodu (skrót commita git) - wypisywana przy starcie, żeby łatwo sprawdzić, czy bot działa na aktualnym kodzie
const { execSync } = require('child_process');
const path = require('path');

function wersjaKodu() {
  try {
    return execSync('git log -1 --format="%h %cd" --date=format:"%Y-%m-%d %H:%M"', {
      cwd: path.join(__dirname, '..'), stdio: ['ignore', 'pipe', 'ignore'],
    }).toString().trim();
  } catch {
    return 'nieznana (brak git)';
  }
}

module.exports = { wersjaKodu };
