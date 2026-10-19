# Espinoza — música

Web de los álbumes de Espinoza: un índice y una página por álbum con la misma plantilla
(paisaje vivo WebGL con profundidad, textos que aparecen al hacer scroll, player lateral con 3 pistas para escuchar).

- `site.json` → índice (`index.html`)
- `<álbum>/album.json` → página del álbum (`<álbum>/index.html`)
- `shared/` → plantilla común (estilos, motor, player)
- `tools/build.py` → genera las páginas: `python3 tools/build.py`
- `tools/prep_bg.py` → prepara un fondo (webp 16:9 + mapa de profundidad)

© 2026 Espinoza. Música, textos e imágenes: todos los derechos reservados.
