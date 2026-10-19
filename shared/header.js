/* Selector de álbumes de la cabecera (⇅): abre/cierra el desplegable; se cierra al hacer clic fuera o con Escape. */
(() => {
  const sw = document.getElementById('albSw'), menu = document.getElementById('swMenu');
  if (!sw) return;
  const set = (open) => { menu.classList.toggle('open', open); sw.setAttribute('aria-expanded', String(open)); };
  sw.addEventListener('click', (e) => { e.stopPropagation(); set(!menu.classList.contains('open')); });
  document.addEventListener('click', (e) => { if (!e.target.closest('.hd-switch')) set(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') set(false); });
})();
