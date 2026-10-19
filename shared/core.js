/*
 * Motor común de las páginas (índice y álbumes). Los datos llegan en window.SITE (lo escribe tools/build.py):
 *   SITE.items  → entradas del menú lateral / móvil: [{n, t, tag}] (pistas en un álbum, álbumes en el índice)
 *   SITE.first  → id del primer fondo (hero)
 * · Fondo: lienzo WebGL fijo con el paisaje vivo (parallax 2.5D por mapa de profundidad + agua); cada sección funde su fondo.
 * · Textos: visibles según su POSICIÓN en pantalla (no por tiempo); entran y se disuelven al pasar.
 * · Menú vertical: rayas + números con lupa tipo Dock y el nombre al lado en cristal.
 */
const SITE = window.SITE;
const ITEMS = SITE.items;
const T0 = performance.now();

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const easeIO = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const fmt = (s) => { s = Math.max(0, Math.floor(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const $ = (id) => document.getElementById(id);

/* ======================= 1. Utilidades de marcado ======================= */
const eqHTML = (n = 5) => `<span class="eq">${'<i></i>'.repeat(n)}</span>`;

/* ======================= 2. Menú vertical: rayas + números, lupa tipo Dock ======================= */
const side = $('side'), tip = $('sideTip');
side.innerHTML = ITEMS.map((it) =>
  `<a href="#t${it.n}" data-sec="t${it.n}" aria-label="${it.n}. ${it.t}"><span class="sn">${it.n}</span>${eqHTML(3)}</a>`).join('');
const dock = {y: null, items: [...side.querySelectorAll('a')].map((a, i) => ({a, s: 1, tr: ITEMS[i]})), shown: null};
side.addEventListener('pointermove', (e) => { dock.y = e.clientY; });
side.addEventListener('pointerleave', () => { dock.y = null; });
side.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-sec]');
  if (!a) return;
  e.preventDefault();
  $(a.dataset.sec).scrollIntoView({behavior: 'smooth', block: 'start'});
});
function dockFrame() {
  let closest = null, best = 1e9;
  for (const it of dock.items) {
    const r = it.a.getBoundingClientRect();
    it.cy = r.top + r.height / 2;
    it.right = r.right;
    const d = dock.y === null ? 1e9 : Math.abs(dock.y - it.cy);
    const target = dock.y === null ? 1 : 1 + 0.55 * Math.exp(-(d * d) / (2 * 30 * 30)); // lupa gaussiana: crece el del cursor y un poco sus vecinos
    it.s += (target - it.s) * 0.16; // easing
    it.a.style.setProperty('--s', it.s.toFixed(3));
    if (d < best) { best = d; closest = it; }
  }
  if (dock.y !== null && closest) {
    if (dock.shown !== closest) {
      dock.shown = closest;
      tip.innerHTML = `${closest.tr.t}${closest.tr.tag ? `<em>${closest.tr.tag}</em>` : ''}`;
    }
    tip.style.left = closest.right + 14 + 'px'; // justo al lado del número
    tip.style.top = closest.cy + 'px';
    tip.classList.add('show');
  } else {
    tip.classList.remove('show');
    dock.shown = null;
  }
}

/* ---------- móvil: la lista a pantalla completa ---------- */
const mMenu = $('mMenu');
mMenu.innerHTML = ITEMS.map((it, i) => `<a href="#t${it.n}" data-sec="t${it.n}" style="transition-delay:${(0.04 * i).toFixed(2)}s">
  <span class="mn">${it.n}</span><span class="mt">${it.t}</span>${it.tag ? `<span class="mf">${it.tag}</span>` : ''}</a>`).join('');
const setMenu = (open) => { document.body.classList.toggle('m-open', open); $('mBtn').setAttribute('aria-expanded', open); };
$('mBtn').addEventListener('click', () => setMenu(!document.body.classList.contains('m-open')));
mMenu.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-sec]');
  if (!a) return;
  e.preventDefault();
  setMenu(false);
  $(a.dataset.sec).scrollIntoView({behavior: 'smooth', block: 'start'});
});

/* ======================= 3. Fondo WebGL: dos portadas que se funden ======================= */
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
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(sh));
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
// id «song1» → assets/song1.webp (+ assets/depth/song1.webp); id con ruta «zen/assets/song1» → esa carpeta (índice)
const bgPath = (id) => (id.includes('/') ? id : 'assets/' + id);
const depthPath = (id) => { const p = bgPath(id), k = p.lastIndexOf('/'); return `${p.slice(0, k)}/depth/${p.slice(k + 1)}`; };
const getScene = (id) => (cache[id] ??= Promise.all([loadImg(`${bgPath(id)}.webp`), loadImg(`${depthPath(id)}.webp`)])
  .then(([img, dep]) => ({img: texFrom(img), dep: texFrom(dep), aspect: img.width / img.height})));

let A = null, B = null, horA = 0.67, horB = 0.67, mixB = 0, mixTarget = 0, currentBg = SITE.first;
const bindTex = (unit, tex, name) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(U(name), unit); };

async function showBg(id, horizon) {
  if (id === currentBg) return;
  currentBg = id;
  const s = await getScene(id);
  if (currentBg !== id) return;
  if (B && mixB > 0.5) { A = B; horA = horB; } // lo que se ve pasa a ser A; la nueva portada entra como B
  B = s; horB = horizon; mixB = 0; mixTarget = 1;
}

let mouseX = 0, camX = 0;
addEventListener('pointermove', (e) => { mouseX = e.clientX / innerWidth - 0.5; });
function resize() { const dpr = Math.min(devicePixelRatio, 2); canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr; }
addEventListener('resize', resize);
resize();

function drawScene(time) {
  if (!A) return;
  const scroll = scrollY / Math.max(1, document.body.scrollHeight - innerHeight);
  const target = (scroll - 0.5) * 0.05 + mouseX * 0.02 + Math.sin(time * 0.05) * 0.006;
  camX += (target - camX) * 0.03;
  mixB += (mixTarget - mixB) * 0.025;
  const ca = canvas.width / canvas.height, zoom = 1.08;
  const sw = ca > A.aspect ? 1 : ca / A.aspect, sh = ca > A.aspect ? A.aspect / ca : 1;
  const w = sw / zoom, h = sh / zoom;
  const heroOut = clamp(scrollY / innerHeight, 0, 1); // al salir de la portada la cámara «entra» un poco en el paisaje
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.uniform4f(U('rect'), (1 - w) / 2, (1 - h) / 2, w, h);
  gl.uniform1f(U('zoomK'), 1 + easeIO(heroOut) * 0.06);
  gl.uniform2f(U('cam'), camX, 0);
  gl.uniform1f(U('time'), time);
  gl.uniform1f(U('horA'), horA);
  gl.uniform1f(U('horB'), horB);
  gl.uniform1f(U('mixB'), B ? mixB : 0);
  bindTex(0, A.img, 'imgA'); bindTex(1, A.dep, 'depA');
  bindTex(2, (B || A).img, 'imgB'); bindTex(3, (B || A).dep, 'depB');
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}
[...new Set([...document.querySelectorAll('section[data-bg]')].map((s) => s.dataset.bg))].forEach(getScene); // precarga de fondos (~85 KB cada uno)

/* ======================= 4. Efectos de texto: ligados a la POSICIÓN, no al tiempo ======================= */
// Cada texto es visible cuando está cerca del centro de la pantalla y se desvanece al alejarse (por arriba o por abajo).
// No hay animaciones con retraso: con scroll rápido o lento, lo que está en el centro siempre se ve. Un suavizado corto
// (≈0,2 s) da la sensación de calma. Las frases en cursiva entran palabra a palabra según suben.
// La posición se mide en el documento (offsetTop), no en pantalla: las transformaciones no engañan a la medición.
const blocks = [...document.querySelectorAll('.fx')].map((el) => {
  if (el.dataset.split === 'words') {
    el.innerHTML = el.textContent.trim().split(/\s+/).map((w) => `<span class="wd">${w}</span>`).join(' ');
  }
  const parts = el.dataset.split === 'words' ? [...el.querySelectorAll('.wd')] : [el];
  return {el, parts, kind: el.dataset.fx || 'rise', intro: parseFloat(el.dataset.delay || 0), cur: parts.map(() => 0), cy: 0};
});
const docTop = (el) => { let y = 0; for (let n = el; n; n = n.offsetParent) y += n.offsetTop; return y; };
function measure() { for (const b of blocks) b.cy = docTop(b.el) + b.el.offsetHeight / 2; }
addEventListener('resize', measure);
measure();

const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const vis = (p) => smooth(0.56, 0.3, Math.abs(p)); // 1 en la franja central, 0 lejos
let lastNow = performance.now();

function fxFrame(now) {
  const vh = innerHeight;
  const dt = Math.min(0.1, (now - lastNow) / 1000);
  lastNow = now;
  const k = 1 - Math.exp(-dt / 0.2); // suavizado corto
  const since = (now - T0) / 1000;
  for (const b of blocks) {
    const pos = (b.cy - scrollY - vh / 2) / vh; // 0 = centro de pantalla
    const far = Math.abs(pos) > 1.4;
    if (far && b.cur.every((c) => c < 0.001)) continue;
    const drift = -pos * 24; // todo flota un poco más lento que el scroll
    if (b.kind === 'hero-l' || b.kind === 'hero-r') {
      // portada: al cargar entra desde su lado (como en los videos); al bajar sube, crece y se disuelve
      const intro = easeIO(clamp((since - b.intro) / 1.8, 0, 1));
      const target = smooth(-0.5, -0.14, pos); // 1 mientras la portada está en pantalla
      b.cur[0] += (target - b.cur[0]) * k;
      const out = 1 - b.cur[0];
      const sideDir = b.kind === 'hero-l' ? -1 : 1;
      const el = b.el;
      el.style.opacity = (intro * b.cur[0]).toFixed(3);
      el.style.transform = `translate3d(${((1 - intro) * 130 * sideDir).toFixed(1)}px, ${(-out * 80 + drift).toFixed(1)}px, 0) scale(${(1 + out * 0.1).toFixed(3)})`;
      el.style.letterSpacing = `${(0.06 + (1 - intro) * 0.2).toFixed(3)}em`;
      const blur = Math.max(1 - intro, out) * 12;
      el.style.filter = blur < 0.05 ? 'none' : `blur(${blur.toFixed(1)}px)`;
      continue;
    }
    const gate = since > b.intro || pos > 0.6 ? 1 : 0; // solo al cargar la página: pequeña espera en la portada
    const n = b.parts.length;
    b.parts.forEach((el, i) => {
      const p = pos + (n > 1 ? (i - (n - 1) / 2) * 0.012 : 0); // palabras: escalonadas un poco según suben
      const target = vis(p) * gate;
      b.cur[i] += (target - b.cur[i]) * k;
      const v = b.cur[i], hidden = 1 - v;
      const dir = p >= 0 ? 1 : -1; // entra por abajo, sale por arriba (y al revés al volver)
      const lift = b.kind === 'title' ? 46 : 30;
      el.style.opacity = v.toFixed(3);
      el.style.transform = `translate3d(0, ${(hidden * lift * dir + (n > 1 ? 0 : drift)).toFixed(1)}px, 0)`;
      el.style.filter = v > 0.99 ? 'none' : `blur(${(hidden * 9).toFixed(1)}px)`;
    });
    if (n > 1) b.el.style.transform = `translate3d(0, ${drift.toFixed(1)}px, 0)`;
  }
}

/* ======================= 5. Sección activa: fondo + menú ======================= */
const sections = [...document.querySelectorAll('section[data-bg]')];
let activeSec = null;
function updateActive() {
  const mid = innerHeight / 2;
  let best = sections[0];
  for (const s of sections) { const r = s.getBoundingClientRect(); if (r.top <= mid && r.bottom >= mid) { best = s; break; } }
  if (best === activeSec) return;
  activeSec = best;
  showBg(best.dataset.bg, parseFloat(best.dataset.horizon));
  dock.items.forEach((it) => it.a.classList.toggle('active', it.a.dataset.sec === best.id));
  mMenu.querySelectorAll('a').forEach((a) => a.classList.toggle('active', a.dataset.sec === best.id));
}

/* ======================= 6. Bucle principal ======================= */
function loop(now) {
  requestAnimationFrame(loop);
  drawScene((now - T0) / 1000);
  fxFrame(now);
  dockFrame();
  updateActive();
}
horA = parseFloat(document.querySelector('section[data-bg]').dataset.horizon) || 0.67;
Promise.all([getScene(SITE.first), document.fonts.ready]).then(([s]) => { A = s; measure(); requestAnimationFrame(loop); });

