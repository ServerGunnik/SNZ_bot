// Logi usuniętych i edytowanych wiadomości (kanał KANAL_LOGI_WIADOMOSCI, domyślnie KANAL_LOGI)
const config = require('../config.js');
const { log } = require('../utils/logger.js');
const kolory = require('../utils/kolory.js');

const MAX_TRESC = 1500;

function przytnij(tekst) {
  if (!tekst) return '_(brak tekstu)_';
  const t = tekst.length > MAX_TRESC ? `${tekst.slice(0, MAX_TRESC)}…` : tekst;
  // Blok kodu pokazuje treść dokładnie tak, jak została napisana
  return `\`\`\`\n${t.replace(/```/g, 'ʼʼʼ')}\n\`\`\``;
}

function doLogowania(wiadomosc) {
  if (!wiadomosc.guild) return false;
  if (config.guildId && wiadomosc.guild.id !== config.guildId) return false;
  if (wiadomosc.author?.bot || wiadomosc.webhookId) return false;
  return true;
}

function autorISzczegoly(wiadomosc) {
  return (
    `**Autor:** ${wiadomosc.author ? `<@${wiadomosc.author.id}> (\`${wiadomosc.author.tag}\`)` : '_nieznany_'}\n` +
    `**Kanał:** <#${wiadomosc.channelId}>\n` +
    `**Wysłana:** <t:${Math.floor(wiadomosc.createdTimestamp / 1000)}:f>`
  );
}

async function obsluzUsuniecie(wiadomosc) {
  if (!doLogowania(wiadomosc)) return;
  // Wiadomość sprzed uruchomienia bota - Discord nie przesyła jej treści
  if (wiadomosc.partial) {
    await log(wiadomosc.client, {
      tytul: 'Usunięto wiadomość',
      opis: `**Kanał:** <#${wiadomosc.channelId}>\n**ID wiadomości:** \`${wiadomosc.id}\`\n_Treść nieznana — wiadomość wysłana przed uruchomieniem bota._`,
      kolor: kolory.blad,
      kanal: 'logiWiadomosci',
    });
    return;
  }
  const zalaczniki = [...wiadomosc.attachments.values()].map(a => `[${a.name}](${a.url})`);
  await log(wiadomosc.client, {
    tytul: 'Usunięto wiadomość',
    opis:
      `${autorISzczegoly(wiadomosc)}\n\n**Treść:**\n${przytnij(wiadomosc.content)}` +
      (zalaczniki.length ? `\n**Załączniki:** ${zalaczniki.join(', ')}` : ''),
    kolor: kolory.blad,
    kanal: 'logiWiadomosci',
  });
}

async function obsluzEdycje(stara, nowa) {
  if (nowa.partial) nowa = await nowa.fetch().catch(() => null);
  if (!nowa || !doLogowania(nowa)) return;
  // Discord wysyła update także przy np. rozwinięciu podglądu linku - logujemy tylko zmianę treści
  if (!stara.partial && stara.content === nowa.content) return;
  await log(nowa.client, {
    tytul: 'Edytowano wiadomość',
    opis:
      `${autorISzczegoly(nowa)}\n**Link:** ${nowa.url}\n\n` +
      `**Przed:**\n${stara.partial ? '_Treść nieznana — wiadomość wysłana przed uruchomieniem bota._' : przytnij(stara.content)}\n` +
      `**Po:**\n${przytnij(nowa.content)}`,
    kolor: kolory.ostrzezenie,
    kanal: 'logiWiadomosci',
  });
}

async function obsluzMasoweUsuniecie(wiadomosci, kanal) {
  if (!kanal.guild || (config.guildId && kanal.guild.id !== config.guildId)) return;
  const znane = [...wiadomosci.values()].filter(w => !w.partial && !w.author?.bot).reverse();
  const podglad = znane.slice(0, 15).map(w => `<@${w.author.id}>: ${(w.content || '_(brak tekstu)_').slice(0, 120)}`);
  await log(kanal.client, {
    tytul: 'Masowo usunięto wiadomości',
    opis:
      `**Kanał:** <#${kanal.id}>\n**Liczba:** ${wiadomosci.size}` +
      (podglad.length ? `\n\n${podglad.join('\n')}${znane.length > podglad.length ? `\n-# …oraz ${znane.length - podglad.length} kolejnych` : ''}` : ''),
    kolor: kolory.blad,
    kanal: 'logiWiadomosci',
  });
}

function rejestruj() {}

module.exports = { rejestruj, obsluzUsuniecie, obsluzEdycje, obsluzMasoweUsuniecie };
