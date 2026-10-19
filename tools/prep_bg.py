"""
Prepara un fondo para la web: recorte 16:9 → <out>/<id>.webp (1672×941) + mapa de profundidad <out>/depth/<id>.webp (836×470).
Profundidad: Depth Anything V2 Small (transformers, local). Cerca = claro, lejos = oscuro (lo que espera el shader).

  python3 tools/prep_bg.py <carpeta_assets_del_album> <id> <imagen> [<id> <imagen> …]
  opcional --y 0.4  (0 = recorta arriba, 0.5 = centro, 1 = abajo) antes de cada par para imágenes no 16:9
"""
import sys, os
from PIL import Image

W, H = 1672, 941


def crop169(im, y=0.5):
    w, h = im.size
    if w / h > W / H:  # demasiado ancha: recorta lados
        nw = round(h * W / H)
        x0 = (w - nw) // 2
        im = im.crop((x0, 0, x0 + nw, h))
    else:  # demasiado alta: recorta arriba/abajo según y
        nh = round(w * H / W)
        y0 = round((h - nh) * y)
        im = im.crop((0, y0, w, y0 + nh))
    return im.resize((W, H), Image.LANCZOS)


def main():
    out = sys.argv[1]
    args = sys.argv[2:]
    os.makedirs(os.path.join(out, 'depth'), exist_ok=True)
    from transformers import pipeline
    depth = pipeline('depth-estimation', model='depth-anything/Depth-Anything-V2-Small-hf')
    y = 0.5
    i = 0
    while i < len(args):
        if args[i] == '--y':
            y = float(args[i + 1]); i += 2; continue
        ident, src = args[i], args[i + 1]; i += 2
        im = crop169(Image.open(src).convert('RGB'), y)
        im.save(os.path.join(out, ident + '.webp'), 'WEBP', quality=82, method=6)
        d = depth(im)['depth'].convert('L').resize((W // 2, H // 2), Image.LANCZOS)
        d.save(os.path.join(out, 'depth', ident + '.webp'), 'WEBP', quality=90)
        print('ok', ident, os.path.getsize(os.path.join(out, ident + '.webp')) // 1024, 'KB')
        y = 0.5


if __name__ == '__main__':
    main()
