/*
 * Compartir: link del álbum o de una canción (página + #tNN). En el teléfono abre el menú nativo de compartir;
 * en el ordenador copia el link y avisa con un aviso breve. Un link a una canción abre la página en esa canción
 * y, si se puede escuchar aquí, la deja preparada en el player.
 */
(() => {
  const base = location.origin + location.pathname;
  const albumTitle = document.title;

  let toastT = 0;
  function toast(text) {
    let el = document.querySelector('.toast');
    if (!el) { el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(() => el.classList.remove('show'), 2200);
  }

  async function copy(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch { /* sin permiso: método antiguo */ }
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { /* */ }
    ta.remove();
    return ok;
  }

  async function share(url, title) {
    if (navigator.share && matchMedia('(hover: none)').matches) {
      try { await navigator.share({title, url}); return; } catch { /* cancelado: no hacer nada */ return; }
    }
    toast((await copy(url)) ? 'Ссылка скопирована' : url);
  }

  // en cada canción: «поделиться» junto a la duración
  document.addEventListener('click', (e) => {
    const b = e.target.closest('.share-t');
    if (!b) return;
    share(`${base}#${b.dataset.share}`, `${b.dataset.title} — ${albumTitle}`);
  });

  // en el player: menú con «álbum» o «esta canción»
  const btn = document.getElementById('pShare'), pop = document.getElementById('sharePop');
  if (btn && pop) {
    const set = (open) => { pop.classList.toggle('open', open); btn.setAttribute('aria-expanded', String(open)); };
    btn.addEventListener('click', (e) => { e.stopPropagation(); set(!pop.classList.contains('open')); });
    document.addEventListener('click', (e) => { if (!e.target.closest('.share-wrap')) set(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') set(false); });
    pop.querySelector('[data-share-album]').addEventListener('click', () => { set(false); share(base, albumTitle); });
    pop.querySelector('[data-share-song]').addEventListener('click', () => {
      set(false);
      const tr = typeof idx === 'number' && idx >= 0 ? FREE[idx] : null;
      share(tr ? `${base}#t${tr.n}` : base, tr ? `${tr.t} — ${albumTitle}` : albumTitle);
    });
  }

  // abrir con #tNN: si esa canción suena aquí, queda preparada en el player (sin sonar: nunca autoplay)
  const m = location.hash.match(/^#t(\d+)$/);
  if (m && typeof FREE !== 'undefined') {
    const i = FREE.findIndex((t) => t.n === m[1]);
    if (i >= 0 && i !== idx) setTrack(i);
  }
})();
