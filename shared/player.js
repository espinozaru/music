/*
 * Reproductor de las páginas de álbum (solo las pistas accesibles). Datos: window.SITE.album (tools/build.py).
 */
const ALBUM = SITE.album;
const TRACKS = ALBUM.tracks;
const FREE = TRACKS.filter((t) => t.free);
// En producción se puede servir el audio desde un CDN: window.AUDIO_BASE
const AUDIO_BASE = window.AUDIO_BASE || 'assets/audio/';

/* ======================= 7. Reproductor (buenas prácticas) ======================= */
// · Nunca autoplay: solo empieza con un gesto. · preload="none": 0 bytes de audio hasta dar play; luego streaming por rangos.
// · Fundido de entrada/salida. · Reanuda donde lo dejaste (localStorage). · Media Session (pantalla de bloqueo, auriculares).
// · Teclado: espacio, Shift+← →, M. · Barra arrastrable y accesible (role=slider). · Estados de carga y de error.
// · Al terminar la última pista gratis: invitación al álbum completo. · Si lo cierras, vuelve al pulsar play en cualquier sitio.
const audio = new Audio();
audio.preload = 'none';
const player = $('player'), pPlay = $('pPlay'), pBar = $('pBar'), pFill = $('pFill'), pKnob = $('pKnob'), pTip = $('pTip');
let idx = -1, userVol = 0.7, fadeRAF = 0, pendingSeek = 0, lastSave = 0, dragging = false;

const store = {
  get: (n) => { try { return parseFloat(localStorage.getItem(ALBUM.slug + '-pos-' + n)) || 0; } catch { return 0; } },
  set: (n, v) => { try { localStorage.setItem(ALBUM.slug + '-pos-' + n, String(v)); } catch { /* modo privado */ } },
};

function fadeTo(target, secs, done) {
  cancelAnimationFrame(fadeRAF);
  const start = audio.volume, t0 = performance.now();
  const step = (now) => {
    const k = clamp((now - t0) / (secs * 1000), 0, 1);
    try { audio.volume = start + (target - start) * k; } catch { /* iOS: volumen de solo lectura */ }
    if (k < 1) fadeRAF = requestAnimationFrame(step); else if (done) done();
  };
  fadeRAF = requestAnimationFrame(step);
}

function setTrack(i) {
  if (idx >= 0) store.set(FREE[idx].n, audio.currentTime);
  idx = i;
  const tr = FREE[i];
  audio.src = AUDIO_BASE + tr.n + '.m4a';
  const resume = store.get(tr.n);
  pendingSeek = resume > 5 && resume < tr.d - 20 ? resume : 0;
  $('pNum').textContent = tr.n;
  $('pTitle').textContent = tr.t;
  $('pDur').textContent = fmt(tr.d);
  $('pCur').textContent = fmt(pendingSeek);
  $('pCover').style.backgroundImage = `url(assets/${tr.bg}.webp)`;
  setProgress(pendingSeek / tr.d);
  player.classList.remove('end', 'error');
  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: tr.t, artist: ALBUM.artist, album: ALBUM.title,
      artwork: [{src: `assets/${tr.bg}.webp`, sizes: '1672x941', type: 'image/webp'}],
    });
  }
}
function play() {
  player.classList.add('show'); // si se cerró con ×, vuelve
  player.classList.remove('end');
  try { audio.volume = 0; } catch { /* iOS */ }
  const p = audio.play();
  if (p) p.catch(() => setError());
  fadeTo(userVol, 1.4);
}
function pause() { fadeTo(0, 0.6, () => audio.pause()); }
function toggle() { if (idx < 0) { setTrack(0); play(); return; } audio.paused ? play() : pause(); }
function playIndex(i) {
  if (i === idx) { if (audio.paused || !player.classList.contains('show')) play(); else pause(); return; }
  setTrack(i);
  play();
}
// el botón «siguiente» nunca pausa: tras la última gratis vuelve a la primera; solo al terminar sola invita al álbum
function next(auto) { if (idx < FREE.length - 1) playIndex(idx + 1); else if (auto === true) showEnd(); else playIndex(0); }
function prev() { if (audio.currentTime > 5 || idx <= 0) { audio.currentTime = 0; return; } playIndex(idx - 1); }
function showEnd() { pause(); player.classList.add('end'); }
function setError() { player.classList.add('error'); player.classList.remove('loading'); $('pState').textContent = 'ошибка загрузки'; }
function setProgress(r) {
  const pct = clamp(r, 0, 1) * 100;
  pFill.style.width = pct + '%';
  pKnob.style.left = pct + '%';
  pBar.setAttribute('aria-valuenow', Math.round(pct));
}

function sync() {
  const on = !audio.paused;
  const n = idx >= 0 ? FREE[idx].n : null;
  player.classList.toggle('playing', on);
  pPlay.setAttribute('aria-label', on ? 'Пауза' : 'Играть');
  if (!player.classList.contains('error')) $('pState').textContent = ''; // el icono ya dice el estado; «пауза» junto al play confundía
  document.querySelectorAll('.track .play[data-n]').forEach((b) => {
    const mine = b.dataset.n === n;
    b.classList.toggle('on', mine && on);
    b.querySelector('.lbl').textContent = mine ? (on ? 'играет' : 'продолжить') : 'слушать';
  });
  dock.items.forEach((it) => it.a.classList.toggle('now', on && it.tr.n === n));
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = on ? 'playing' : 'paused';
}

audio.addEventListener('play', sync);
audio.addEventListener('pause', sync);
audio.addEventListener('waiting', () => { player.classList.add('loading'); $('pState').textContent = 'загрузка'; });
audio.addEventListener('playing', () => { player.classList.remove('loading'); if (!player.classList.contains('error')) $('pState').textContent = ''; });
audio.addEventListener('loadedmetadata', () => { if (pendingSeek) { audio.currentTime = pendingSeek; pendingSeek = 0; } });
audio.addEventListener('timeupdate', () => {
  if (idx < 0 || dragging) return;
  const d = audio.duration || FREE[idx].d;
  setProgress(audio.currentTime / d);
  $('pCur').textContent = fmt(audio.currentTime);
  if (audio.currentTime - lastSave > 5 || audio.currentTime < lastSave) { lastSave = audio.currentTime; store.set(FREE[idx].n, audio.currentTime); }
});
audio.addEventListener('ended', () => { store.set(FREE[idx].n, 0); next(true); });
audio.addEventListener('error', setError);

pPlay.addEventListener('click', toggle);
$('pNext').addEventListener('click', () => next());
$('pPrev').addEventListener('click', prev);
$('pVol').addEventListener('input', (e) => { userVol = parseFloat(e.target.value); try { audio.volume = userVol; } catch { /* iOS */ } });
$('pClose').addEventListener('click', () => { pause(); player.classList.remove('show'); });

document.addEventListener('click', (e) => {
  const b = e.target.closest('.track .play[data-n]');
  if (!b) return;
  playIndex(FREE.findIndex((t) => t.n === b.dataset.n));
});

// barra de progreso: clic, arrastre (ratón y dedo), teclado y tooltip con el tiempo
const ratioAt = (x) => { const r = pBar.getBoundingClientRect(); return clamp((x - r.left) / r.width, 0, 1); };
pBar.addEventListener('pointermove', (e) => {
  if (idx < 0) return;
  const r = ratioAt(e.clientX);
  pTip.style.left = r * 100 + '%';
  pTip.textContent = fmt(r * FREE[idx].d);
  if (dragging) { setProgress(r); $('pCur').textContent = fmt(r * FREE[idx].d); }
});
pBar.addEventListener('pointerdown', (e) => {
  if (idx < 0) return;
  dragging = true;
  pBar.classList.add('drag');
  pBar.setPointerCapture(e.pointerId);
  setProgress(ratioAt(e.clientX));
});
pBar.addEventListener('pointerup', (e) => {
  if (!dragging) return;
  dragging = false;
  pBar.classList.remove('drag');
  audio.currentTime = ratioAt(e.clientX) * (audio.duration || FREE[idx].d);
});
pBar.addEventListener('keydown', (e) => {
  if (idx < 0) return;
  if (e.key === 'ArrowRight') { audio.currentTime += 10; e.preventDefault(); }
  if (e.key === 'ArrowLeft') { audio.currentTime -= 10; e.preventDefault(); }
});
document.addEventListener('keydown', (e) => {
  if (e.target.closest('input, textarea, [contenteditable]')) return;
  if (e.code === 'Space' && !e.target.closest('button, a')) { e.preventDefault(); toggle(); }
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
addEventListener('pagehide', () => { if (idx >= 0) store.set(FREE[idx].n, audio.currentTime); });
