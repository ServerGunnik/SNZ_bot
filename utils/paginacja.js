function stronicuj(tablica, strona, naStrone) {
  const total = tablica.length;
  const stron = Math.max(1, Math.ceil(total / naStrone));
  const s = Math.min(Math.max(1, strona), stron);
  const start = (s - 1) * naStrone;
  return {
    strona: tablica.slice(start, start + naStrone),
    total,
    stron,
    aktualnaStrona: s,
  };
}
module.exports = { stronicuj };
