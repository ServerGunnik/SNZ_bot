// Backup wiadomości z wszystkich kanałów: trzymamy ostatnie N na kanał.
// Przy usunięciu kanału ochrona-kanalow odtwarza wiadomości webhookiem z nazwą
// i awatarem oryginalnego autora - dla widza wygląda jakby nic się nie stało.
const { AttachmentBuilder } = require('discord.js');
const db = require('../database/db.js');
const config = require('../config.js');

const q = {
  wstaw: db.prepare(`INSERT INTO wiadomosci_kopie
    (wiadomosc_id, kanal_id, autor_id, autor_nazwa, autor_awatar, tresc, zalaczniki, utworzono)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(wiadomosc_id) DO UPDATE SET tresc = excluded.tresc, zalaczniki = excluded.zalaczniki`),
  // Przycinamy do limitNaKanal najnowszych, resztę kasujemy
  usunPonadLimit: db.prepare(`DELETE FROM wiadomosci_kopie
    WHERE kanal_id = ? AND id NOT IN (
      SELECT id FROM wiadomosci_kopie WHERE kanal_id = ? ORDER BY utworzono DESC LIMIT ?
    )`),
  aktualizuj: db.prepare('UPDATE wiadomosci_kopie SET tresc = ? WHERE wiadomosc_id = ?'),
  wiadomosciKanalu: db.prepare('SELECT * FROM wiadomosci_kopie WHERE kanal_id = ? ORDER BY utworzono ASC'),
  usunKanalu: db.prepare('DELETE FROM wiadomosci_kopie WHERE kanal_id = ?'),
};

// Pomijane: wątki (osobne zdarzenie threadDelete), DM, boty (webhooki + nasz bot są odtwarzane inaczej),
// wiadomości systemowe (np. powitania Discorda, boosty)
function pominac(wiadomosc) {
  if (!wiadomosc.guild) return true;
  if (wiadomosc.channel?.isThread?.()) return true;
  if (wiadomosc.author?.bot) return true;
  if (wiadomosc.system) return true;
  return false;
}

function zapamietaj(wiadomosc) {
  if (!config.backupWiadomosci.wlaczony || pominac(wiadomosc)) return;
  const autor = wiadomosc.author;
  const zalaczniki = [...wiadomosc.attachments.values()].map(a => ({ name: a.name, url: a.url }));
  try {
    q.wstaw.run(
      wiadomosc.id,
      wiadomosc.channelId,
      autor.id,
      autor.displayName || autor.username || autor.tag || 'Nieznany',
      autor.displayAvatarURL?.({ size: 128 }) || null,
      wiadomosc.content || '',
      JSON.stringify(zalaczniki),
      wiadomosc.createdTimestamp || Date.now(),
    );
    q.usunPonadLimit.run(wiadomosc.channelId, wiadomosc.channelId, config.backupWiadomosci.limitNaKanal);
  } catch (e) {
    console.error('[backup-wiadomosci] zapis', e.message);
  }
}

function aktualizuj(wiadomosc) {
  if (!config.backupWiadomosci.wlaczony || pominac(wiadomosc)) return;
  try {
    q.aktualizuj.run(wiadomosc.content || '', wiadomosc.id);
  } catch (e) {
    console.error('[backup-wiadomosci] edycja', e.message);
  }
}

// Discord zabrania "discord" i "clyde" w nazwach webhooków; limit 1-80 znaków
function sanityzujUsername(nazwa) {
  const s = (nazwa || 'Nieznany').replace(/discord|clyde/gi, '*');
  return s.slice(0, 80) || 'Nieznany';
}

async function odtworzWiadomosciNaKanale(nowyKanal, staryKanalId) {
  const kopie = q.wiadomosciKanalu.all(staryKanalId);
  if (!kopie.length) return { odtworzonych: 0, wTranskrypcie: 0 };

  const limit = config.backupWiadomosci.limitNaKanal;
  const doPrzywrocenia = kopie.slice(-limit);
  const doTranskryptu = kopie.length > limit ? kopie.slice(0, -limit) : [];

  const webhook = await nowyKanal.createWebhook({
    name: 'SNZ-przywracanie',
    reason: 'Odtworzenie historii wiadomości po usunięciu kanału',
  }).catch((e) => { console.error('[backup-wiadomosci] webhook', e.message); return null; });

  let odtworzonych = 0;
  if (webhook) {
    for (const k of doPrzywrocenia) {
      const zalaczniki = JSON.parse(k.zalaczniki || '[]');
      // Linki do załączników dopisujemy do treści - obrazki się rozwiną, pliki zostaną klikalne
      const content = ((k.tresc || '') + (zalaczniki.length ? `\n${zalaczniki.map(z => z.url).join('\n')}` : '')).trim().slice(0, 2000);
      if (!content) continue;
      const ok = await webhook.send({
        username: sanityzujUsername(k.autor_nazwa),
        avatarURL: k.autor_awatar || undefined,
        content,
        allowedMentions: { parse: [] },
      }).then(() => true).catch((e) => {
        console.error('[backup-wiadomosci] replay', e.message);
        return false;
      });
      if (ok) odtworzonych++;
    }
    await webhook.delete('Historia odtworzona').catch(() => null);
  }

  if (doTranskryptu.length) {
    const linie = [
      `=== Starsza historia kanału #${nowyKanal.name} (stary ID: ${staryKanalId}) ===`,
      `Odtworzono bezpośrednio: ${doPrzywrocenia.length} najnowszych wiadomości.`,
      `W tym pliku: ${doTranskryptu.length} starszych wiadomości (najstarsze pierwsze).`,
      '',
    ];
    for (const k of doTranskryptu) {
      const czas = new Date(k.utworzono).toISOString();
      const zalaczniki = JSON.parse(k.zalaczniki || '[]');
      linie.push(`[${czas}] ${k.autor_nazwa} (${k.autor_id}):`);
      if (k.tresc) linie.push(k.tresc);
      if (zalaczniki.length) linie.push('  załączniki: ' + zalaczniki.map(z => `${z.name || 'plik'} ${z.url}`).join('; '));
      linie.push('');
    }
    const buffer = Buffer.from(linie.join('\n'), 'utf8');
    const plik = new AttachmentBuilder(buffer, { name: `historia-${nowyKanal.name}-${Date.now()}.txt` });
    await nowyKanal.send({ files: [plik], allowedMentions: { parse: [] } }).catch(() => null);
  }

  q.usunKanalu.run(staryKanalId);
  return { odtworzonych, wTranskrypcie: doTranskryptu.length };
}

function rejestruj() {}

module.exports = { rejestruj, zapamietaj, aktualizuj, odtworzWiadomosciNaKanale };
