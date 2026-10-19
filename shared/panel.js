/*
 * Panel del reproductor a la derecha (estilo Yandex Музыка, mejorado). Usa player.js (setTrack, playIndex, sync…)
 * y añade: lista de todas las pistas (las no accesibles llevan a la zona del álbum, #listen), frase de cada pista,
 * panel plegable, y botón play de cada bloque que al pasar el ratón crece, dice qué hará el clic y suelta notas musicales.
 */
(() => {
  const wide = matchMedia('(min-width: 981px)');
  const list = document.getElementById('pList');
  const phrase = document.getElementById('pPhrase');
  const toggleBtn = document.getElementById('phToggle');

  // lista: las 3 gratis suenan aquí; el resto, en gris, solo con el botón a la zona del álbum (#listen), como el de arriba
  list.innerHTML = TRACKS.map((tr) => `<li class="${tr.free ? 'free' : 'locked'}" data-n="${tr.n}">
      <span class="ln">${tr.n}</span><span class="lt">${tr.t}</span>
      ${tr.free ? `<span class="ld">${fmt(tr.d)}</span>${eqHTML(4)}` : '<a class="ph-rel" href="#listen">Слушать альбом</a>'}</li>`).join('');
  list.addEventListener('click', (e) => {
    const li = e.target.closest('li');
    if (li && li.classList.contains('free')) playIndex(FREE.findIndex((t) => t.n === li.dataset.n));
  });

  // en escritorio el panel está siempre visible, con la primera pista preparada (sin sonar)
  // la primera pista queda preparada (sin sonar); en escritorio el panel está siempre visible
  if (idx < 0) setTrack(0);
  const showWide = () => { if (wide.matches) player.classList.add('show'); };
  showWide();
  wide.addEventListener('change', showWide);


  // plegar / desplegar (se recuerda). Plegado: franja estrecha; clic en ella (fuera de los botones) la abre.
  // Secuencia suave: se funde el contenido, cambia el ancho del panel, vuelve el contenido
  const KEY = 'tv-v2-min';
  let busy = false;
  function applyMin(min) {
    document.body.classList.toggle('ph-min', min);
    toggleBtn.setAttribute('aria-expanded', String(!min));
    toggleBtn.setAttribute('aria-label', min ? 'Развернуть плеер' : 'Свернуть плеер');
    try { localStorage.setItem(KEY, min ? '1' : '0'); } catch { /* modo privado */ }
  }
  function setMin(min) {
    if (busy || min === document.body.classList.contains('ph-min')) return;
    busy = true;
    player.classList.add('ph-fade');
    setTimeout(() => {
      applyMin(min);
      setTimeout(() => { player.classList.remove('ph-fade'); busy = false; dispatchEvent(new Event('resize')); }, 560);
    }, 200);
  }
  let startMin = false;
  try { startMin = localStorage.getItem(KEY) === '1'; } catch { /* */ }
  applyMin(startMin);
  toggleBtn.addEventListener('click', (e) => { e.stopPropagation(); setMin(!document.body.classList.contains('ph-min')); });
  player.addEventListener('click', (e) => {
    if (document.body.classList.contains('ph-min') && !e.target.closest('button, input, a, .p-bar')) setMin(false);
  });

  // con el ratón dentro del panel la página no se mueve: la rueda solo desplaza la lista (y se queda en sus bordes)
  player.addEventListener('wheel', (e) => {
    if (!wide.matches) return;
    if (list.contains(e.target) && !document.body.classList.contains('ph-min')) {
      const up = e.deltaY < 0;
      const edge = up ? list.scrollTop <= 0 : list.scrollTop + list.clientHeight >= list.scrollHeight - 1;
      if (!edge) return; // la lista se desplaza sola
    }
    e.preventDefault();
  }, {passive: false});

  function refresh() {
    const n = idx >= 0 ? FREE[idx].n : null;
    const on = !audio.paused;
    const tr = TRACKS.find((t) => t.n === n);
    phrase.textContent = tr ? tr.p : '';
    list.querySelectorAll('li').forEach((li) => {
      li.classList.toggle('current', li.dataset.n === n);
      li.classList.toggle('on', li.dataset.n === n && on);
    });
    // botones de los bloques: lo que pasará al hacer clic (se ve al pasar el ratón)
    blockBtns.forEach((b) => {
      const mine = b.dataset.n === n;
      const started = mine && (audio.currentTime > 5 || store.get(n) > 5); // «продолжить» solo si ya se escuchó algo
      b.querySelector('.lbl-h').textContent = mine && on ? 'пауза' : started ? 'продолжить' : 'слушать';
    });
  }
  // botón play de cada bloque: en reposo «слушать» / «играет» + ecualizador;
  // al pasar el ratón crece, el texto cambia a la acción y su icono (play o pausa) entra suave por la derecha
  const ICO_H = '<span class="ico-h"><svg class="h-play" viewBox="0 0 10 10"><path d="M2 1v8l7-4z"/></svg>'
    + '<svg class="h-pause" viewBox="0 0 10 10"><path d="M2 1h2.2v8H2zM5.8 1H8v8H5.8z"/></svg></span>';
  const blockBtns = [...document.querySelectorAll('.track .play[data-n]')];
  blockBtns.forEach((b) => {
    const lbl = b.querySelector('.lbl');
    const stack = document.createElement('span');
    stack.className = 'lbls';
    lbl.replaceWith(stack);
    stack.append(lbl);
    stack.insertAdjacentHTML('beforeend', '<span class="lbl-h" aria-hidden="true"></span>');
    b.insertAdjacentHTML('beforeend', ICO_H);
  });

  ['play', 'pause', 'loadstart'].forEach((ev) => audio.addEventListener(ev, refresh));
  refresh();

  // notas musicales alrededor del botón play de cada bloque, al pasar el ratón (si va a sonar): suben, se mecen y se desvanecen
  const GLYPHS = ['♪', '♫', '♩', '♬'];
  const rnd = (a, b) => a + Math.random() * (b - a);
  function spawn(box) {
    if (document.hidden) return;
    const s = document.createElement('span');
    s.className = 'note';
    s.textContent = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
    s.style.left = `${rnd(4, 92)}%`;
    s.style.bottom = `${rnd(40, 95)}%`;
    s.style.fontSize = `${rnd(13, 22)}px`;
    s.style.setProperty('--d', `${rnd(3.2, 4.6)}s`);
    s.style.setProperty('--dx1', `${rnd(-16, 16)}px`);
    s.style.setProperty('--dx2', `${rnd(-26, 26)}px`);
    s.style.setProperty('--r0', `${rnd(-14, 14)}deg`);
    s.style.setProperty('--r1', `${rnd(-10, 10)}deg`);
    s.style.setProperty('--r2', `${rnd(-16, 16)}deg`);
    s.addEventListener('animationend', () => s.remove());
    box.appendChild(s);
  }
  function emitter(box, every) {
    let t = 0;
    return {
      start() { if (t) return; spawn(box); t = setInterval(() => spawn(box), every); },
      stop() { clearInterval(t); t = 0; },
    };
  }

  // play del panel: mismas notas al pasar el ratón, solo si está en pausa (si va a pausar, nada se anima)
  const pBox = document.createElement('span');
  pBox.className = 'notes';
  pBox.setAttribute('aria-hidden', 'true');
  pPlay.appendChild(pBox);
  const pEm = emitter(pBox, 380);
  const pUpdate = () => (pPlay.matches(':hover') && audio.paused ? pEm.start() : pEm.stop());
  pPlay.addEventListener('mouseenter', pUpdate);
  pPlay.addEventListener('mouseleave', pEm.stop);
  audio.addEventListener('play', pUpdate);
  audio.addEventListener('pause', pUpdate);

  blockBtns.forEach((b) => {
    const box = document.createElement('span');
    box.className = 'notes';
    box.setAttribute('aria-hidden', 'true');
    b.appendChild(box);
    const em = emitter(box, 380);
    // notas solo si el clic va a hacer sonar (слушать / продолжить); si va a pausar, nada se anima
    const update = () => (b.matches(':hover') && !b.classList.contains('on') ? em.start() : em.stop());
    b.addEventListener('mouseenter', update);
    b.addEventListener('mouseleave', em.stop);
    audio.addEventListener('play', update);
    audio.addEventListener('pause', update);
  });
})();
