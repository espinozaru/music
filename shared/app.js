/*
 * Espinoza — música. Un solo motor para todas las páginas (índice y álbumes), como una app:
 * · Navegación SIN recarga entre álbumes y el índice: se cambia el contenido, pero el reproductor y el fondo siguen vivos,
 *   así la música no se corta al pasar de un álbum a otro (como en Yandex Музыка).
 * · Fondo: lienzo WebGL fijo (parallax 2.5D por mapa de profundidad + agua; o fijo con SITE.still); cada bloque funde el suyo.
 * · Textos ligados a la POSICIÓN en pantalla; menú lateral con lupa tipo Dock; scroll imantado (CSS).
 * · Reproductor: cola = el álbum que suena (puede ser otro que el de la página); panel lateral plegable, lista, repetir,
 *   temporizador, volumen, compartir. Nunca autoplay.
 * Datos de cada página: window.SITE (tools/build.py). Los elementos con data-keep no se tocan al navegar.
 */
(() => {
  const ROOT = new URL('../', document.currentScript.src).href; // raíz del sitio (…/music/)
  let SITE = window.SITE;

  /* ======================= utilidades ======================= */
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const easeIO = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const fmt = (s) => { s = Math.max(0, Math.floor(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const $ = (id) => document.getElementById(id);
  const eqHTML = (n = 5) => `<span class="eq">${'<i></i>'.repeat(n)}</span>`;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
  const wide = matchMedia('(min-width: 981px)');
  const prefs = {
    get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* modo privado */ } },
  };

  /* ======================= 1. Fondo WebGL (persistente) ======================= */
  const VERT = `attribute vec2 p; varying vec2 uv;
void main(){ uv = vec2(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5); gl_Position = vec4(p, 0.0, 1.0); }`;
  const FRAG = `precision highp float;
varying vec2 uv;
uniform sampler2D imgA, depA, imgB, depB;
uniform vec4 rect; uniform vec2 cam; uniform float time, mixB, horA, horB, zoomK;
vec3 scene(sampler2D img, sampler2D dep, float horizon){
  vec2 base = rect.xy + (uv - 0.5) * rect.zw / zoomK + rect.zw * 0.5;
  vec2 q = base;
  for (int k = 0; k < 5; k++) { float d = texture2D(dep, q).r - 0.2; q = base - cam * d * rect.zw; }
  float d0 = texture2D(dep, q).r;
  float water = smoothstep(horizon, horizon + 0.03, q.y) * (1.0 - smoothstep(0.45, 0.62, d0));
  float k = (q.y - horizon) / max(0.01, 1.0 - horizon);
  float w = sin(q.y * (260.0 - 140.0 * k) - time * 0.9 + sin(q.x * 9.0 + time * 0.25) * 1.6) + 0.5 * sin(q.y * 520.0 + time * 1.3);
  q.x += w * 0.0016 * water * (0.4 + k); q.y += w * 0.0006 * water;
  q = clamp(q, 0.001, 0.999);
  return texture2D(img, q).rgb + water * 0.012 * w;
}
void main(){
  vec3 a = scene(imgA, depA, horA);
  vec3 b = scene(imgB, depB, horB);
  gl_FragColor = vec4(mix(a, b, smoothstep(0.0, 1.0, mixB)), 1.0);
}`;
  const canvas = $('scene');
  const gl = canvas.getContext('webgl');
  const prog = gl.createProgram();
  [[gl.VERTEX_SHADER, VERT], [gl.FRAGMENT_SHADER, FRAG]].forEach(([type, src]) => {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    gl.attachShader(prog, sh);
  });
  gl.linkProgram(prog);
  gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const aLoc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(aLoc);
  gl.vertexAttribPointer(aLoc, 2, gl.FLOAT, false, 0, 0);
  const U = (n) => gl.getUniformLocation(prog, n);

  const cache = {};
  const loadImg = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  const texFrom = (img) => {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    return t;
  };
  // id «song1» → assets/song1.webp de la página; con ruta («zen/assets/song1») → desde la raíz. Caché por URL absoluta.
  const bgUrl = (id) => (id.includes('/') ? new URL(id, ROOT) : new URL('assets/' + id, location.href)).href;
  const depthUrl = (u) => { const k = u.lastIndexOf('/'); return `${u.slice(0, k)}/depth/${u.slice(k + 1)}`; };
  const getScene = (id) => { const u = bgUrl(id); return (cache[u] ??= Promise.all([loadImg(u + '.webp'), loadImg(depthUrl(u) + '.webp')])
    .then(([img, dep]) => ({img: texFrom(img), dep: texFrom(dep), aspect: img.width / img.height}))); };

  let A = null, B = null, horA = 0.67, horB = 0.67, mixB = 0, mixTarget = 0, currentBg = '';
  const bindTex = (unit, tex, name) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(U(name), unit); };
  async function showBg(id, horizon) {
    const key = bgUrl(id);
    if (key === currentBg) return;
    currentBg = key;
    const s = await getScene(id);
    if (currentBg !== key) return;
    if (!A) { A = s; horA = horizon; return; }
    if (B && mixB > 0.5) { A = B; horA = horB; } // lo que se ve pasa a ser A; el nuevo fondo entra como B
    B = s; horB = horizon; mixB = 0; mixTarget = 1;
  }
  let mouseX = 0, camX = 0;
  addEventListener('pointermove', (e) => { mouseX = e.clientX / innerWidth - 0.5; });
  function resize() { const dpr = Math.min(devicePixelRatio, 2); canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr; }
  addEventListener('resize', resize);
  resize();
  function drawScene(time) {
    if (!A || SITE.type === 'home') return;
    const still = SITE.still;
    const scroll = scrollY / Math.max(1, document.body.scrollHeight - innerHeight);
    const target = still ? 0 : (scroll - 0.5) * 0.05 + mouseX * 0.02 + Math.sin(time * 0.05) * 0.006;
    camX += (target - camX) * 0.03;
    mixB += (mixTarget - mixB) * 0.025;
    const ca = canvas.width / canvas.height, zoom = 1.08;
    const sw = ca > A.aspect ? 1 : ca / A.aspect, sh = ca > A.aspect ? A.aspect / ca : 1;
    const w = sw / zoom, h = sh / zoom;
    const heroOut = clamp(scrollY / innerHeight, 0, 1);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform4f(U('rect'), (1 - w) / 2, (1 - h) / 2, w, h);
    gl.uniform1f(U('zoomK'), still ? 1 : 1 + easeIO(heroOut) * 0.06);
    gl.uniform2f(U('cam'), camX, 0);
    gl.uniform1f(U('time'), time);
    gl.uniform1f(U('horA'), still ? 2 : horA); // horizonte fuera de la imagen = sin agua
    gl.uniform1f(U('horB'), still ? 2 : horB);
    gl.uniform1f(U('mixB'), B ? mixB : 0);
    bindTex(0, A.img, 'imgA'); bindTex(1, A.dep, 'depA');
    bindTex(2, (B || A).img, 'imgB'); bindTex(3, (B || A).dep, 'depB');
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /* ======================= 2. Página (se rehace al navegar) ======================= */
  const page = {t0: performance.now(), blocks: [], sections: [], dock: null, mMenu: null, active: null, io: null, btns: []};
  const docTop = (el) => { let y = 0; for (let n = el; n; n = n.offsetParent) y += n.offsetTop; return y; };

  function initDock() {
    const side = $('side'), tip = $('sideTip');
    page.dock = null;
    if (!side || !SITE.items) return;
    side.innerHTML = SITE.items.map((it) =>
      `<a href="#t${it.n}" data-sec="t${it.n}" aria-label="${it.n}. ${esc(it.t)}"><span class="sn">${it.n}</span>${eqHTML(3)}</a>`).join('');
    const dock = {y: null, tip, items: [...side.querySelectorAll('a')].map((a, i) => ({a, s: 1, tr: SITE.items[i]})), shown: null};
    side.addEventListener('pointermove', (e) => { dock.y = e.clientY; });
    side.addEventListener('pointerleave', () => { dock.y = null; });
    side.addEventListener('click', (e) => {
      const a = e.target.closest('a[data-sec]');
      if (!a) return;
      e.preventDefault();
      $(a.dataset.sec).scrollIntoView({behavior: 'smooth', block: 'center'});
    });
    page.dock = dock;
  }
  function dockFrame() {
    const dock = page.dock;
    if (!dock) return;
    let closest = null, best = 1e9;
    for (const it of dock.items) {
      const r = it.a.getBoundingClientRect();
      it.cy = r.top + r.height / 2;
      it.right = r.right;
      const d = dock.y === null ? 1e9 : Math.abs(dock.y - it.cy);
      const target = dock.y === null ? 1 : 1 + 0.55 * Math.exp(-(d * d) / (2 * 30 * 30)); // lupa gaussiana
      it.s += (target - it.s) * 0.16;
      it.a.style.setProperty('--s', it.s.toFixed(3));
      if (d < best) { best = d; closest = it; }
    }
    if (dock.y !== null && closest) {
      if (dock.shown !== closest) { dock.shown = closest; dock.tip.innerHTML = `${esc(closest.tr.t)}${closest.tr.tag ? `<em>${closest.tr.tag}</em>` : ''}`; }
      dock.tip.style.left = closest.right + 14 + 'px';
      dock.tip.style.top = closest.cy + 'px';
      dock.tip.classList.add('show');
    } else { dock.tip.classList.remove('show'); dock.shown = null; }
  }
  function initMobileMenu() {
    const mMenu = $('mMenu'), mBtn = $('mBtn');
    page.mMenu = mMenu;
    if (!mMenu || !SITE.items) return;
    mMenu.innerHTML = SITE.items.map((it, i) => `<a href="#t${it.n}" data-sec="t${it.n}" style="transition-delay:${(0.04 * i).toFixed(2)}s">
      <span class="mn">${it.n}</span><span class="mt">${esc(it.t)}</span>${it.tag ? `<span class="mf">${it.tag}</span>` : ''}</a>`).join('');
    const setMenu = (open) => { document.body.classList.toggle('m-open', open); mBtn.setAttribute('aria-expanded', open); };
    mBtn.addEventListener('click', () => setMenu(!document.body.classList.contains('m-open')));
    mMenu.addEventListener('click', (e) => {
      const a = e.target.closest('a[data-sec]');
      if (!a) return;
      e.preventDefault();
      setMenu(false);
      $(a.dataset.sec).scrollIntoView({behavior: 'smooth', block: 'center'});
    });
  }

  // textos: visibles según su posición (0 = centro de pantalla); el título en escalera entra desde los lados al cargar
  function initFx() {
    page.blocks = [...document.querySelectorAll('main .fx')].map((el) => {
      if (el.dataset.split === 'words') el.innerHTML = el.textContent.trim().split(/\s+/).map((w) => `<span class="wd">${w}</span>`).join(' ');
      const parts = el.dataset.split === 'words' ? [...el.querySelectorAll('.wd')] : [el];
      return {el, parts, kind: el.dataset.fx || 'rise', intro: parseFloat(el.dataset.delay || 0), cur: parts.map(() => 0), cy: 0};
    });
  }
  // las palabras del título nunca se salen: si una es más ancha que el hueco libre, se achica
  function fitStair() {
    for (const w of document.querySelectorAll('.stair .w')) {
      w.style.fontSize = '';
      const ls = w.style.letterSpacing;
      w.style.letterSpacing = '0.06em';
      const sec = w.closest('section'), cs = getComputedStyle(sec);
      const box = sec.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const word = w.offsetWidth;
      w.style.letterSpacing = ls;
      if (word > box) w.style.fontSize = `${(parseFloat(getComputedStyle(w).fontSize) * box / word * 0.98).toFixed(1)}px`;
    }
  }
  function measure() { fitStair(); for (const b of page.blocks) b.cy = docTop(b.el) + b.el.offsetHeight / 2; }
  addEventListener('resize', measure);

  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const vis = (p) => smooth(0.56, 0.3, Math.abs(p));
  let lastNow = performance.now();
  function fxFrame(now) {
    const vh = innerHeight;
    const dt = Math.min(0.1, (now - lastNow) / 1000);
    lastNow = now;
    const k = 1 - Math.exp(-dt / 0.2);
    const since = (now - page.t0) / 1000;
    for (const b of page.blocks) {
      const pos = (b.cy - scrollY - vh / 2) / vh;
      if (Math.abs(pos) > 1.4 && b.cur.every((c) => c < 0.001)) continue;
      const drift = -pos * 24;
      if (b.kind === 'hero-l' || b.kind === 'hero-r') {
        const intro = easeIO(clamp((since - b.intro) / 1.8, 0, 1));
        b.cur[0] += (smooth(-0.5, -0.14, pos) - b.cur[0]) * k;
        const out = 1 - b.cur[0], sideDir = b.kind === 'hero-l' ? -1 : 1, el = b.el;
        el.style.opacity = (intro * b.cur[0]).toFixed(3);
        el.style.transform = `translate3d(${((1 - intro) * 130 * sideDir).toFixed(1)}px, ${(-out * 80 + drift).toFixed(1)}px, 0) scale(${(1 + out * 0.1).toFixed(3)})`;
        el.style.letterSpacing = `${(0.06 + (1 - intro) * 0.2).toFixed(3)}em`;
        const blur = Math.max(1 - intro, out) * 12;
        el.style.filter = blur < 0.05 ? 'none' : `blur(${blur.toFixed(1)}px)`;
        continue;
      }
      const gate = since > b.intro || pos > 0.6 ? 1 : 0;
      const n = b.parts.length;
      b.parts.forEach((el, i) => {
        const p = pos + (n > 1 ? (i - (n - 1) / 2) * 0.012 : 0);
        b.cur[i] += (vis(p) * gate - b.cur[i]) * k;
        const v = b.cur[i], hidden = 1 - v, dir = p >= 0 ? 1 : -1, lift = b.kind === 'title' ? 46 : 30;
        el.style.opacity = v.toFixed(3);
        el.style.transform = `translate3d(0, ${(hidden * lift * dir + (n > 1 ? 0 : drift)).toFixed(1)}px, 0)`;
        el.style.filter = v > 0.99 ? 'none' : `blur(${(hidden * 9).toFixed(1)}px)`;
      });
      if (n > 1) b.el.style.transform = `translate3d(0, ${drift.toFixed(1)}px, 0)`;
    }
  }
  function updateActive() {
    if (!page.sections.length) return;
    const mid = innerHeight / 2;
    let best = page.sections[0];
    for (const s of page.sections) { const r = s.getBoundingClientRect(); if (r.top <= mid && r.bottom >= mid) { best = s; break; } }
    if (best === page.active) return;
    page.active = best;
    showBg(best.dataset.bg, parseFloat(best.dataset.horizon));
    if (page.dock) page.dock.items.forEach((it) => it.a.classList.toggle('active', it.a.dataset.sec === best.id));
    if (page.mMenu) page.mMenu.querySelectorAll('a').forEach((a) => a.classList.toggle('active', a.dataset.sec === best.id));
  }

  // índice: el fondo pasa al del disco bajo el ratón; los discos aparecen al entrar en pantalla
  const homeBg = {layers: [...document.querySelectorAll('.bg')], front: 0, current: ''};
  function setHomeBg(url) {
    if (!url || url === homeBg.current) return;
    homeBg.current = url;
    const img = new Image();
    img.onload = () => {
      if (homeBg.current !== url) return;
      const next = homeBg.layers[1 - homeBg.front];
      next.style.backgroundImage = `url("${url}")`;
      next.classList.add('on');
      homeBg.layers[homeBg.front].classList.remove('on');
      homeBg.front = 1 - homeBg.front;
    };
    img.src = url;
  }
  function initHome() {
    setHomeBg(new URL(document.body.dataset.bg, ROOT).href);
    const discs = [...document.querySelectorAll('.disc')];
    discs.forEach((d) => {
      const u = new URL(d.dataset.bg, ROOT).href;
      d.addEventListener('mouseenter', () => setHomeBg(u));
      d.addEventListener('focusin', () => setHomeBg(u));
    });
    const touch = matchMedia('(hover: none)').matches;
    page.io = new IntersectionObserver((entries) => {
      for (const en of entries) {
        if (en.isIntersecting) en.target.classList.add('in');
        if (touch && en.isIntersecting && en.intersectionRatio > 0.6) setHomeBg(new URL(en.target.dataset.bg, ROOT).href);
      }
    }, {threshold: [0.15, 0.6]});
    discs.forEach((d) => page.io.observe(d));
  }

  // selector de álbumes de la cabecera (⇅)
  function initHeaderSwitch() {
    const sw = $('albSw'), menu = $('swMenu');
    if (!sw) return;
    sw.addEventListener('click', (e) => { e.stopPropagation(); const o = !menu.classList.contains('open'); menu.classList.toggle('open', o); sw.setAttribute('aria-expanded', String(o)); });
  }
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.hd-switch')) document.querySelectorAll('.sw-menu.open').forEach((m) => { m.classList.remove('open'); m.parentElement.querySelector('[aria-expanded]')?.setAttribute('aria-expanded', 'false'); });
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') document.querySelectorAll('.sw-menu.open, .share-pop.open').forEach((m) => m.classList.remove('open')); });

  function initPage() {
    SITE = window.SITE;
    page.t0 = performance.now();
    page.active = null;
    if (page.io) { page.io.disconnect(); page.io = null; }
    initDock();
    initMobileMenu();
    initFx();
    initHeaderSwitch();
    page.sections = [...document.querySelectorAll('main section[data-bg]')];
    if (SITE.type === 'home') initHome();
    else {
      [...new Set(page.sections.map((s) => s.dataset.bg))].forEach(getScene); // precarga de fondos
      showBg(SITE.first, parseFloat(page.sections[0].dataset.horizon) || 0.67);
    }
    playerOnPage();
    document.fonts.ready.then(measure);
    measure();
  }

  /* ======================= 3. Reproductor (persistente) ======================= */
  // Q = álbum en cola (el que suena); puede no ser el de la página. Su carpeta (base) es absoluta: al navegar no cambia.
  const audio = new Audio();
  audio.preload = 'none';
  const player = $('player'), pPlay = $('pPlay'), pBar = $('pBar'), pFill = $('pFill'), pKnob = $('pKnob'), pTip = $('pTip');
  const list = $('pList'), phrase = $('pPhrase'), toggleBtn = $('phToggle');
  let Q = null, FREE = [], idx = -1, userVol = 0.7, fadeRAF = 0, pendingSeek = 0, lastSave = 0, dragging = false;
  const store = {
    get: (n) => parseFloat(prefs.get(Q.slug + '-pos-' + n)) || 0,
    set: (n, v) => prefs.set(Q.slug + '-pos-' + n, String(v)),
  };
  const pageAlbum = () => (SITE.type === 'album' && SITE.album.tracks.some((t) => t.free)
    ? {...SITE.album, base: new URL('./', location.href).href} : null);
  const sameAlbum = () => Q && SITE.type === 'album' && Q.slug === SITE.album.slug;
  const started = () => idx >= 0 && (!audio.paused || audio.currentTime > 0.5);

  function setQueue(al) {
    if (Q && idx >= 0) store.set(FREE[idx].n, audio.currentTime);
    Q = al; FREE = al.tracks.filter((t) => t.free); idx = -1;
    $('pAlbT').textContent = al.title;
    const meta = (SITE.albums || []).find((x) => x.slug === al.slug);
    if (meta) $('pAlbCov').style.backgroundImage = `url(${new URL(meta.cover, ROOT).href})`;
    $('pAlbSw').dataset.tip = al.title;
    $('pAlbSw').title = 'Сменить альбом';
    $('pAlbList').querySelectorAll('a').forEach((a) => a.classList.toggle('cur', a.dataset.slug === al.slug));
    $('phAlbum').innerHTML = `${esc(al.title)} <span>${FREE.length} из ${al.tracks.length} доступно</span>`;
    list.innerHTML = al.tracks.map((tr) => `<li class="${tr.free ? 'free' : 'locked'}" data-n="${tr.n}">
      <span class="ln">${tr.n}</span><span class="lt">${esc(tr.t)}</span>
      ${tr.free ? `<span class="ld">${fmt(tr.d)}</span>${eqHTML(4)}` : `<a class="ph-rel" href="${al.base}#listen">Слушать альбом</a>`}</li>`).join('');
  }
  function fadeTo(target, secs, done) {
    cancelAnimationFrame(fadeRAF);
    const start = audio.volume, t0 = performance.now();
    const step = (now) => {
      const k = clamp((now - t0) / (secs * 1000), 0, 1);
      try { audio.volume = start + (target - start) * k; } catch { /* iOS */ }
      if (k < 1) fadeRAF = requestAnimationFrame(step); else if (done) done();
    };
    fadeRAF = requestAnimationFrame(step);
  }
  function setTrack(i) {
    if (idx >= 0) store.set(FREE[idx].n, audio.currentTime);
    idx = i;
    const tr = FREE[i];
    audio.src = `${window.AUDIO_BASE || Q.base + 'assets/audio/'}${tr.n}.m4a`;
    const resume = store.get(tr.n);
    pendingSeek = resume > 5 && resume < tr.d - 20 ? resume : 0;
    $('pNum').textContent = tr.n;
    $('pTitle').textContent = tr.t;
    $('pDur').textContent = fmt(tr.d);
    $('pCur').textContent = fmt(pendingSeek);
    const art = `${Q.base}assets/${tr.bg}.webp`;
    $('pCover').style.backgroundImage = `url(${art})`;
    setProgress(pendingSeek / tr.d);
    player.classList.remove('end', 'error');
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({title: tr.t, artist: Q.artist, album: Q.title, artwork: [{src: art, sizes: '1672x941', type: 'image/webp'}]});
    }
    refresh();
  }
  function play() {
    player.classList.add('show');
    player.classList.remove('end');
    try { audio.volume = 0; } catch { /* iOS */ }
    const p = audio.play();
    if (p) p.catch(() => setError());
    fadeTo(userVol, 1.4);
    panelVisibility();
  }
  function pause() { fadeTo(0, 0.6, () => audio.pause()); }
  function toggle() { if (!Q) return; if (idx < 0) { setTrack(0); play(); return; } audio.paused ? play() : pause(); }
  function playIndex(i) {
    if (i === idx) { if (audio.paused || !player.classList.contains('show')) play(); else pause(); return; }
    setTrack(i);
    play();
  }
  function next(auto) {
    if (idx < FREE.length - 1) playIndex(idx + 1);
    else if (auto === true && !loopOn) showEnd();
    else playIndex(0);
  }
  function prev() { if (audio.currentTime > 5 || idx <= 0) { audio.currentTime = 0; return; } playIndex(idx - 1); }
  function showEnd() { pause(); player.classList.add('end'); }
  function setError() { player.classList.add('error'); player.classList.remove('loading'); $('pState').textContent = 'ошибка загрузки'; }
  function setProgress(r) {
    const pct = clamp(r, 0, 1) * 100;
    pFill.style.width = pct + '%';
    pKnob.style.left = pct + '%';
    pBar.setAttribute('aria-valuenow', Math.round(pct));
  }

  // estado visible: panel, lista, botones de la página, menú lateral
  function sync() {
    const on = !audio.paused, n = idx >= 0 ? FREE[idx].n : null, mineAlbum = sameAlbum();
    player.classList.toggle('playing', on);
    pPlay.setAttribute('aria-label', on ? 'Пауза' : 'Играть');
    if (!player.classList.contains('error')) $('pState').textContent = '';
    page.btns.forEach((b) => {
      const mine = mineAlbum && b.dataset.n === n;
      b.classList.toggle('on', mine && on);
      b.querySelector('.lbl').textContent = mine ? (on ? 'играет' : 'продолжить') : 'слушать';
    });
    if (page.dock) page.dock.items.forEach((it) => it.a.classList.toggle('now', on && mineAlbum && it.tr.n === n));
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = on ? 'playing' : 'paused';
    refresh();
  }
  function refresh() {
    const n = idx >= 0 ? FREE[idx].n : null, on = !audio.paused, mineAlbum = sameAlbum();
    const tr = Q && Q.tracks.find((t) => t.n === n);
    phrase.textContent = tr ? tr.p : '';
    list.querySelectorAll('li').forEach((li) => { li.classList.toggle('current', li.dataset.n === n); li.classList.toggle('on', li.dataset.n === n && on); });
    // «сейчас играет» solo si lo que suena es de otro álbum que el de la página
    player.classList.toggle('other', !!Q && !mineAlbum && started());
    page.btns.forEach((b) => {
      const mine = mineAlbum && b.dataset.n === n;
      const st = mine && (audio.currentTime > 5 || store.get(b.dataset.n) > 5);
      b.querySelector('.lbl-h').textContent = mine && on ? 'пауза' : st ? 'продолжить' : 'слушать';
    });
  }

  // panel visible: en un álbum con pistas, siempre (escritorio); en el índice o un álbum sin audio, solo si algo suena
  const MINKEY = 'tv-v2-min';
  function panelVisibility() {
    const own = !!pageAlbum();
    const show = own || (Q && started());
    document.body.classList.toggle('has-panel', !!show);
    if (show && wide.matches) player.classList.add('show');
    if (!show) player.classList.remove('show');
    document.body.classList.toggle('ph-min', prefs.get(MINKEY) === '1'); // abierto o plegado: lo que elegiste, en todas las páginas
  }

  // al llegar a una página: si no suena nada, la cola pasa a su álbum (con la canción del enlace #tNN preparada)
  function playerOnPage() {
    const al = pageAlbum();
    if (al && (!Q || (!started() && Q.slug !== al.slug))) { setQueue(al); setTrack(0); }
    if (al && sameAlbum() && !started()) {
      const m = location.hash.match(/^#t(\d+)$/);
      const i = m ? FREE.findIndex((t) => t.n === m[1]) : -1;
      if (i >= 0 && i !== idx) setTrack(i);
    }
    decorateButtons();
    panelVisibility();
    sync();
  }

  audio.addEventListener('play', sync);
  audio.addEventListener('pause', sync);
  audio.addEventListener('loadstart', refresh);
  audio.addEventListener('waiting', () => { player.classList.add('loading'); $('pState').textContent = 'загрузка'; });
  audio.addEventListener('playing', () => { player.classList.remove('loading'); if (!player.classList.contains('error')) $('pState').textContent = ''; });
  audio.addEventListener('loadedmetadata', () => { if (pendingSeek) { audio.currentTime = pendingSeek; pendingSeek = 0; } });
  audio.addEventListener('timeupdate', () => {
    if (idx < 0 || dragging) return;
    setProgress(audio.currentTime / (audio.duration || FREE[idx].d));
    $('pCur').textContent = fmt(audio.currentTime);
    if (audio.currentTime - lastSave > 5 || audio.currentTime < lastSave) { lastSave = audio.currentTime; store.set(FREE[idx].n, audio.currentTime); }
  });
  audio.addEventListener('ended', () => { store.set(FREE[idx].n, 0); next(true); });
  audio.addEventListener('error', setError);
  pPlay.addEventListener('click', toggle);
  $('pNext').addEventListener('click', () => next());
  $('pPrev').addEventListener('click', prev);
  $('pClose').addEventListener('click', () => { pause(); player.classList.remove('show'); });
  list.addEventListener('click', (e) => { const li = e.target.closest('li.free'); if (li) playIndex(FREE.findIndex((t) => t.n === li.dataset.n)); });

  // botones play de los bloques: si son de otro álbum que la cola, la cola pasa a este álbum
  document.addEventListener('click', (e) => {
    const b = e.target.closest('.track .play[data-n]');
    if (!b) return;
    if (!sameAlbum()) setQueue(pageAlbum());
    playIndex(FREE.findIndex((t) => t.n === b.dataset.n));
  });

  // volumen: altavoz (silencio) · barra · cifra que se anima
  const pVol = $('pVol'), pVolVal = $('pVolVal'), pMute = $('pMute');
  function showVol(bump) {
    const pct = Math.round((audio.muted ? 0 : userVol) * 100);
    pVol.style.setProperty('--v', pct + '%');
    pVolVal.textContent = pct + '%';
    if (bump) { pVolVal.classList.remove('bump'); void pVolVal.offsetWidth; pVolVal.classList.add('bump'); }
    pMute.setAttribute('aria-pressed', String(audio.muted || userVol === 0));
    pMute.dataset.level = audio.muted || userVol === 0 ? '0' : userVol < 0.5 ? '1' : '2';
  }
  pVol.addEventListener('input', (e) => { userVol = parseFloat(e.target.value); audio.muted = false; try { audio.volume = userVol; } catch { /* iOS */ } showVol(true); });
  pMute.addEventListener('click', () => { audio.muted = !audio.muted; showVol(true); });
  audio.addEventListener('volumechange', () => showVol(false));
  showVol(false);

  // barra de progreso: clic, arrastre, teclado, tooltip
  const ratioAt = (x) => { const r = pBar.getBoundingClientRect(); return clamp((x - r.left) / r.width, 0, 1); };
  pBar.addEventListener('pointermove', (e) => {
    if (idx < 0) return;
    const r = ratioAt(e.clientX);
    pTip.style.left = r * 100 + '%';
    pTip.textContent = fmt(r * FREE[idx].d);
    if (dragging) { setProgress(r); $('pCur').textContent = fmt(r * FREE[idx].d); }
  });
  pBar.addEventListener('pointerdown', (e) => { if (idx < 0) return; dragging = true; pBar.classList.add('drag'); pBar.setPointerCapture(e.pointerId); setProgress(ratioAt(e.clientX)); });
  pBar.addEventListener('pointerup', (e) => { if (!dragging) return; dragging = false; pBar.classList.remove('drag'); audio.currentTime = ratioAt(e.clientX) * (audio.duration || FREE[idx].d); });
  pBar.addEventListener('keydown', (e) => {
    if (idx < 0) return;
    if (e.key === 'ArrowRight') { audio.currentTime += 10; e.preventDefault(); }
    if (e.key === 'ArrowLeft') { audio.currentTime -= 10; e.preventDefault(); }
  });
  document.addEventListener('keydown', (e) => {
    if (e.target.closest('input, textarea, [contenteditable]')) return;
    if (e.code === 'Space' && !e.target.closest('button, a') && Q) { e.preventDefault(); toggle(); }
    if (idx < 0 || e.target === pBar) return;
    if (e.key === 'ArrowRight' && e.shiftKey) audio.currentTime += 10;
    if (e.key === 'ArrowLeft' && e.shiftKey) audio.currentTime -= 10;
    if (e.key === 'm' || e.key === 'M') audio.muted = !audio.muted;
  });
  if ('mediaSession' in navigator) {
    const ms = navigator.mediaSession;
    ms.setActionHandler('play', play);
    ms.setActionHandler('pause', pause);
    ms.setActionHandler('previoustrack', prev);
    ms.setActionHandler('nexttrack', () => next());
    ms.setActionHandler('seekbackward', () => { audio.currentTime -= 10; });
    ms.setActionHandler('seekforward', () => { audio.currentTime += 10; });
    try { ms.setActionHandler('seekto', (d) => { audio.currentTime = d.seekTime; }); } catch { /* no soportado */ }
  }
  addEventListener('pagehide', () => { if (Q && idx >= 0) store.set(FREE[idx].n, audio.currentTime); });

  // repetir + temporizador
  let loopOn = prefs.get('espinoza-loop') === '1';
  const pLoop = $('pLoop'), pTimer = $('pTimer'), pTimerLbl = $('pTimerLbl');
  const showLoop = () => pLoop.setAttribute('aria-pressed', String(loopOn));
  pLoop.addEventListener('click', () => { loopOn = !loopOn; prefs.set('espinoza-loop', loopOn ? '1' : '0'); showLoop(); });
  showLoop();
  const STEPS = [10, 20, 30];
  let timerEnd = 0, timerStep = -1, timerTick = 0;
  function showTimer() {
    pTimer.setAttribute('aria-pressed', String(!!timerEnd));
    pTimerLbl.textContent = timerEnd ? fmt(Math.max(0, timerEnd - Date.now()) / 1000) : 'таймер';
  }
  function setTimer(step) {
    clearInterval(timerTick);
    timerStep = step;
    timerEnd = step >= 0 ? Date.now() + STEPS[step] * 60000 : 0;
    if (timerEnd) timerTick = setInterval(() => { if (Date.now() >= timerEnd) { setTimer(-1); if (!audio.paused) fadeTo(0, 8, () => audio.pause()); return; } showTimer(); }, 1000);
    showTimer();
  }
  pTimer.addEventListener('click', () => setTimer(timerStep + 1 < STEPS.length ? timerStep + 1 : -1));

  // plegar / desplegar el panel (se recuerda)
  let busy = false;
  function setMin(min) {
    if (busy || min === document.body.classList.contains('ph-min')) return;
    busy = true;
    player.classList.add('ph-fade');
    setTimeout(() => {
      document.body.classList.toggle('ph-min', min);
      prefs.set(MINKEY, min ? '1' : '0');
      toggleBtn.setAttribute('aria-expanded', String(!min));
      setTimeout(() => { player.classList.remove('ph-fade'); busy = false; dispatchEvent(new Event('resize')); }, 560);
    }, 200);
  }
  toggleBtn.addEventListener('click', (e) => { e.stopPropagation(); setMin(!document.body.classList.contains('ph-min')); });
  player.addEventListener('click', (e) => {
    if (document.body.classList.contains('ph-min') && !e.target.closest('button, input, a, .p-bar, nav')) setMin(false);
  });
  // rueda dentro del panel: solo desplaza la lista
  player.addEventListener('wheel', (e) => {
    if (!wide.matches) return;
    if (list.contains(e.target) && !document.body.classList.contains('ph-min')) {
      const edge = e.deltaY < 0 ? list.scrollTop <= 0 : list.scrollTop + list.clientHeight >= list.scrollHeight - 1;
      if (!edge) return;
    }
    e.preventDefault();
  }, {passive: false});

  // selector de álbumes dentro del panel (escritorio): un recuadro «альбом · título ⇅» que abre la lista de álbumes
  // la lista de álbumes del panel vive entre páginas: sus enlaces e imágenes, absolutos
  $('pAlbList').querySelectorAll('a').forEach((a) => { a.href = ROOT + a.dataset.slug + '/'; const im = a.querySelector('img'); im.src = im.src; });
  $('pAlbSw').addEventListener('click', (e) => { e.stopPropagation(); const m = $('pAlbList'), o = !m.classList.contains('open'); m.classList.toggle('open', o); $('pAlbSw').setAttribute('aria-expanded', String(o)); });

  // notas musicales al pasar el ratón por un play (solo si el clic va a hacer sonar)
  const GLYPHS = ['♪', '♫', '♩', '♬'];
  function spawn(box) {
    if (document.hidden) return;
    const s = document.createElement('span');
    s.className = 'note';
    s.textContent = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
    s.style.left = `${rnd(4, 92)}%`; s.style.bottom = `${rnd(40, 95)}%`; s.style.fontSize = `${rnd(13, 22)}px`;
    s.style.setProperty('--d', `${rnd(3.2, 4.6)}s`);
    ['--dx1', '--dx2'].forEach((v, i) => s.style.setProperty(v, `${rnd(-16 - i * 10, 16 + i * 10)}px`));
    ['--r0', '--r1', '--r2'].forEach((v) => s.style.setProperty(v, `${rnd(-14, 14)}deg`));
    s.addEventListener('animationend', () => s.remove());
    box.appendChild(s);
  }
  function emitter(box) { let t = 0; return {start() { if (t) return; spawn(box); t = setInterval(() => spawn(box), 380); }, stop() { clearInterval(t); t = 0; }}; }
  const notesIn = (el) => { const box = document.createElement('span'); box.className = 'notes'; box.setAttribute('aria-hidden', 'true'); el.appendChild(box); return emitter(box); };
  const pEm = notesIn(pPlay);
  const pUpdate = () => (pPlay.matches(':hover') && audio.paused ? pEm.start() : pEm.stop());
  pPlay.addEventListener('mouseenter', pUpdate);
  pPlay.addEventListener('mouseleave', pEm.stop);
  audio.addEventListener('play', () => { pUpdate(); page.btns.forEach((b) => b._upd()); });
  audio.addEventListener('pause', () => { pUpdate(); page.btns.forEach((b) => b._upd()); });

  // botones play de la página: texto de la acción al pasar el ratón, icono a la derecha y notas
  const ICO_H = '<span class="ico-h"><svg class="h-play" viewBox="0 0 10 10"><path d="M2 1v8l7-4z"/></svg>'
    + '<svg class="h-pause" viewBox="0 0 10 10"><path d="M2 1h2.2v8H2zM5.8 1H8v8H5.8z"/></svg></span>';
  function decorateButtons() {
    page.btns = [...document.querySelectorAll('.track .play[data-n]')];
    page.btns.forEach((b) => {
      if (b._upd) return;
      const lbl = b.querySelector('.lbl');
      const stack = document.createElement('span');
      stack.className = 'lbls';
      lbl.replaceWith(stack);
      stack.append(lbl);
      stack.insertAdjacentHTML('beforeend', '<span class="lbl-h" aria-hidden="true"></span>');
      b.insertAdjacentHTML('beforeend', ICO_H);
      const em = notesIn(b);
      b._upd = () => (b.matches(':hover') && !b.classList.contains('on') ? em.start() : em.stop());
      b.addEventListener('mouseenter', b._upd);
      b.addEventListener('mouseleave', em.stop);
    });
  }

  /* ======================= 4. Compartir ======================= */
  let toastT = 0;
  function toast(text) {
    let el = document.querySelector('.toast');
    if (!el) { el = document.createElement('div'); el.className = 'toast'; el.dataset.keep = ''; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(() => el.classList.remove('show'), 2200);
  }
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch { /* método antiguo */ }
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { /* */ }
    ta.remove();
    return ok;
  }
  async function share(url, title) {
    if (navigator.share && matchMedia('(hover: none)').matches) { try { await navigator.share({title, url}); } catch { /* cancelado */ } return; }
    toast((await copy(url)) ? 'Ссылка скопирована' : url);
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('.share-t');
    if (b) share(`${location.origin}${location.pathname}#${b.dataset.share}`, `${b.dataset.title} — ${document.title}`);
  });
  const shareBtn = $('pShare'), sharePop = $('sharePop');
  const setPop = (open) => { sharePop.classList.toggle('open', open); shareBtn.setAttribute('aria-expanded', String(open)); };
  shareBtn.addEventListener('click', (e) => { e.stopPropagation(); setPop(!sharePop.classList.contains('open')); });
  document.addEventListener('click', (e) => { if (!e.target.closest('.share-wrap')) setPop(false); });
  sharePop.querySelector('[data-share-album]').addEventListener('click', () => { setPop(false); if (Q) share(Q.base, `${Q.title} — ${Q.artist}`); });
  sharePop.querySelector('[data-share-song]').addEventListener('click', () => {
    setPop(false);
    if (!Q) return;
    const tr = idx >= 0 ? FREE[idx] : null;
    share(tr ? `${Q.base}#t${tr.n}` : Q.base, tr ? `${tr.t} — ${Q.title}` : Q.title);
  });

  /* ======================= 5. Navegación sin recarga ======================= */
  history.scrollRestoration = 'manual';
  const isPage = (u) => u.origin === location.origin && u.href.startsWith(ROOT) && /\/(index\.html)?$/.test(u.pathname);
  let navId = 0;
  async function go(href, push = true) {
    const url = new URL(href, location.href);
    const id = ++navId;
    document.body.classList.add('nav-out');
    let doc;
    try {
      const res = await fetch(url.pathname, {credentials: 'same-origin'});
      if (!res.ok) throw new Error(res.status);
      doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    } catch { location.href = url.href; return; }
    if (id !== navId) return;
    if (push) history.pushState(null, '', url.href); // antes de montar: las rutas relativas (assets/…) ya son las de la página nueva
    // cambiar todo menos lo marcado data-keep (fondo, velo, grano, reproductor, aviso)
    const sc = [...doc.querySelectorAll('script')].find((s) => s.textContent.includes('window.SITE'));
    const t = sc.textContent;
    window.SITE = JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1));
    document.title = doc.title;
    const keepMin = document.body.classList.contains('ph-min');
    document.body.className = doc.body.className;
    document.body.classList.toggle('ph-min', keepMin);
    document.body.dataset.bg = doc.body.dataset.bg || '';
    [...document.body.children].forEach((el) => { if (!('keep' in el.dataset) && el.tagName !== 'SCRIPT') el.remove(); });
    const anchor = player;
    [...doc.body.children].forEach((el) => { if (!('keep' in el.dataset) && el.tagName !== 'SCRIPT') document.body.insertBefore(document.adoptNode(el), anchor); });
    const target = url.hash && document.querySelector(url.hash);
    if (target) target.scrollIntoView({block: 'center'}); else scrollTo(0, 0);
    try { initPage(); } catch (err) { console.error(err); } // pase lo que pase, la página no se queda a medias
    requestAnimationFrame(() => document.body.classList.remove('nav-out'));
  }
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href]');
    if (!a || a.target === '_blank' || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    const u = new URL(a.getAttribute('href'), location.href);
    if (!isPage(u)) return;
    e.preventDefault();
    if (u.pathname === location.pathname) { // la misma página: nunca recargar (cortaría la música); solo ir al ancla o arriba
      document.querySelectorAll('.sw-menu.open').forEach((m) => m.classList.remove('open'));
      const t = u.hash && document.querySelector(u.hash);
      if (t) t.scrollIntoView({behavior: 'smooth', block: 'center'}); else scrollTo({top: 0, behavior: 'smooth'});
      return;
    }
    document.querySelectorAll('.sw-menu.open').forEach((m) => m.classList.remove('open'));
    document.body.classList.remove('m-open');
    go(u.href);
  });
  let lastPath = location.pathname;
  addEventListener('popstate', () => { if (location.pathname !== lastPath) go(location.href, false); });
  const _push = history.pushState.bind(history);
  history.pushState = (...a) => { _push(...a); lastPath = location.pathname; };
  addEventListener('popstate', () => { lastPath = location.pathname; });

  /* ======================= 6. Arranque ======================= */
  function loop(now) {
    requestAnimationFrame(loop);
    drawScene((now - page.t0) / 1000);
    fxFrame(now);
    dockFrame();
    updateActive();
  }
  initPage();
  requestAnimationFrame(loop);
})();
