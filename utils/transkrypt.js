const { AttachmentBuilder } = require('discord.js');

async function zbierzWiadomosci(kanal, limit = 500) {
  const wiadomosci = [];
  let ostatnie = null;
  while (wiadomosci.length < limit) {
    const paczka = await kanal.messages.fetch({ limit: 100, before: ostatnie || undefined }).catch(() => null);
    if (!paczka || paczka.size === 0) break;
    wiadomosci.push(...paczka.values());
    ostatnie = paczka.last().id;
    if (paczka.size < 100) break;
  }
  return wiadomosci.reverse();
}

// Tekst z kart Components V2 (TextDisplay zagnieżdżone w kontenerach/sekcjach)
function tekstKomponentow(komponenty) {
  const wynik = [];
  for (const k of komponenty || []) {
    if (typeof k.content === 'string') wynik.push(k.content);
    if (k.components?.length) wynik.push(...tekstKomponentow(k.components));
  }
  return wynik;
}

function formatujTekst(wiadomosci, kanal) {
  const linie = [];
  linie.push(`=== Transkrypt kanału #${kanal.name} (${kanal.id}) ===`);
  linie.push(`Wygenerowano: ${new Date().toISOString()}`);
  linie.push('');
  for (const w of wiadomosci) {
    const czas = w.createdAt.toISOString();
    const autor = `${w.author.tag} (${w.author.id})`;
    const tresc = w.content || '';
    const zalaczniki = w.attachments.size
      ? '\n  załączniki: ' + [...w.attachments.values()].map(a => a.url).join(', ')
      : '';
    const tekstKart = tekstKomponentow(w.components);
    const komponenty = tekstKart.length
      ? '\n  ' + tekstKart.join('\n').split('\n').join('\n  ')
      : (w.components?.length ? '\n  [wiadomość z komponentami]' : '');
    linie.push(`[${czas}] ${autor}: ${tresc}${zalaczniki}${komponenty}`);
  }
  return linie.join('\n');
}

async function transkrypt(kanal) {
  const wiadomosci = await zbierzWiadomosci(kanal);
  const tekst = formatujTekst(wiadomosci, kanal);
  const buffer = Buffer.from(tekst, 'utf8');
  return new AttachmentBuilder(buffer, { name: `transkrypt-${kanal.name}-${Date.now()}.txt` });
}

module.exports = { transkrypt };
