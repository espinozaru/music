/*
 * Índice (presentación de discos): el fondo pasa al paisaje del disco bajo el ratón (o al que está en el centro, en el
 * teléfono) con un fundido lento; los discos aparecen al entrar en pantalla.
 */
(() => {
  const layers = [...document.querySelectorAll('.home .bg')];
  let front = 0, current = '';
  function setBg(url) {
    if (!url || url === current) return;
    current = url;
    const img = new Image();
    img.onload = () => {
      if (current !== url) return;
      const next = layers[1 - front];
      next.style.backgroundImage = `url("${url}")`;
      next.classList.add('on');
      layers[front].classList.remove('on');
      front = 1 - front;
    };
    img.src = url;
  }
  setBg(document.body.dataset.bg);

  const discs = [...document.querySelectorAll('.disc')];
  discs.forEach((d) => {
    d.addEventListener('mouseenter', () => setBg(d.dataset.bg));
    d.addEventListener('focusin', () => setBg(d.dataset.bg));
  });

  // aparición al entrar en pantalla; en pantallas táctiles, además, el disco del centro manda en el fondo
  const touch = matchMedia('(hover: none)').matches;
  const io = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (en.isIntersecting) en.target.classList.add('in');
      if (touch && en.isIntersecting && en.intersectionRatio > 0.6) setBg(en.target.dataset.bg); // solo el fondo; el vinilo no se mueve
    }
  }, {threshold: [0.15, 0.6]});
  discs.forEach((d) => io.observe(d));
})();
