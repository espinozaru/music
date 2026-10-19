"""
Genera la web estática desde los datos:
  · <álbum>/album.json  → <álbum>/index.html   (página del álbum con la plantilla fija: paisaje vivo, pistas, player)
  · site.json           → index.html            (índice: un bloque por álbum)

  python3 tools/build.py
"""
import json, os, html

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
e = html.escape


def fmt(s):
    s = int(s or 0)
    return f'{s // 60}:{s % 60:02d}'


def head(title, desc, first_bg, base):
    return f'''<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{e(title)}</title>
<meta name="description" content="{e(desc)}">
<link rel="preload" href="{base}shared/fonts/NotoSans-Variable.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="{base}shared/fonts/CormorantGaramond-Upright-Variable.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="{e(first_bg)}" as="image">
<link rel="stylesheet" href="{base}shared/style.css">
'''


def menus(label):
    return f'''<!-- Menú vertical fijo: rayas + números; se marca lo que está en pantalla y lo que suena -->
<nav class="side" id="side" aria-label="{label}"></nav>
<div class="side-tip" id="sideTip" aria-hidden="true"></div>
<!-- Móvil: la lista a pantalla completa, con el botón abajo (donde está el pulgar) -->
<nav class="m-menu" id="mMenu" aria-label="{label}"></nav>
<button class="m-btn" id="mBtn" aria-label="{label}" aria-expanded="false"><span></span><span></span></button>
'''


def hero(h, bg_attr):
    w1, w2 = h['words']
    return f'''  <!-- Portada: título en escalera (la 1.ª palabra entra por la izquierda, la 2.ª por la derecha) -->
  <section class="hero" id="top" data-bg="{e(bg_attr)}" data-horizon="{h.get('horizon', 0.67)}">
    <h1 class="stair" aria-label="{e(h.get('label', w1 + ' ' + w2))}">
      <span class="w w1 fx" data-fx="hero-l" data-delay="0.3"><span class="silver">{e(w1)}</span></span>
      <span class="w w2 fx" data-fx="hero-r" data-delay="1.1"><span class="silver">{e(w2)}</span></span>
    </h1>
    <p class="sub fx" data-split="words" data-delay="2.0">{e(h['sub'])}</p>
    <div class="scroll-hint fx" data-delay="2.8"><span></span>{e(h.get('hint', 'листай медленно'))}</div>
  </section>
'''


def manifest(m, bg_attr):
    lines = ''.join(f'    <p class="line{" tight" if i else ""} fx" data-split="words">{e(l)}</p>\n' for i, l in enumerate(m['lines']))
    return f'''  <!-- Manifiesto: frases palabra a palabra y una línea grande en plata -->
  <section class="manifest" data-bg="{e(bg_attr)}" data-horizon="{m.get('horizon', 0.67)}">
{lines}    <p class="line big fx" data-fx="title"><span class="silver">{e(m['big'])}</span></p>
  </section>
'''


def platforms(pl):
    out = []
    for p in pl:
        if p.get('url'):
            out.append(f'<a href="{e(p["url"])}" target="_blank" rel="noopener">{e(p["name"])}</a>')
        else:
            out.append(f'<span>{e(p["name"])}</span>')
    return ''.join(out)


SVG_PLAY = '<svg viewBox="0 0 10 10"><path d="M2 1v8l7-4z"/></svg>'
ICO_PLAY = '<svg class="ico" viewBox="0 0 10 10"><path d="M2 1v8l7-4z"/></svg>'
EQ = '<span class="eq"><i></i><i></i><i></i><i></i><i></i></span>'

PLAYER = '''<!-- Player: barra lateral derecha plegable (en móvil, cápsula abajo) -->
<aside class="player phone" id="player" role="region" aria-label="Плеер">
  <button class="ph-toggle" id="phToggle" aria-label="Свернуть плеер" aria-expanded="true"><svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg></button>
  <div class="ph-art">
    <div class="p-cover" id="pCover"><span class="p-ring"></span></div>
  </div>
  <div class="p-info">
    <div class="p-top">
      <span class="p-num" id="pNum">01</span>
      <span class="p-title" id="pTitle"></span>
      <span class="eq"><i></i><i></i><i></i><i></i><i></i></span>
    </div>
    <p class="ph-phrase" id="pPhrase"></p>
    <div class="p-bar" id="pBar" role="slider" tabindex="0" aria-label="Перемотка" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
      <span class="p-fill" id="pFill"></span><span class="p-knob" id="pKnob"></span><span class="p-tip" id="pTip">0:00</span>
    </div>
    <div class="p-time"><span id="pCur">0:00</span><span class="p-state" id="pState"></span><span id="pDur">0:00</span></div>
  </div>
  <div class="p-ctrl">
    <button id="pPrev" aria-label="Предыдущая"><svg viewBox="0 0 24 24"><path d="M7 5v14M18 6l-8 6 8 6z"/></svg></button>
    <button id="pPlay" class="p-play" aria-label="Играть">
      <svg class="i-play" viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5z"/></svg>
      <svg class="i-pause" viewBox="0 0 24 24"><path d="M6.5 5h3.5v14H6.5zM14 5h3.5v14H14z"/></svg>
    </button>
    <button id="pNext" aria-label="Следующая"><svg viewBox="0 0 24 24"><path d="M17 5v14M6 6l8 6-8 6z"/></svg></button>
  </div>
  <input class="p-vol" id="pVol" type="range" min="0" max="1" step="0.01" value="0.7" aria-label="Громкость">
  <a class="p-cta" href="#listen">Полный альбом →</a>
  <button class="p-close" id="pClose" aria-label="Закрыть плеер" hidden>×</button>
  <p class="ph-album">{title} <span>{free} из {total} доступно</span></p>
  <ol class="ph-list" id="pList"></ol>
</aside>
'''


def album_page(slug, a):
    tracks = a['tracks']
    free_n = a.get('free', 3)
    for i, t in enumerate(tracks):
        t['free'] = i < free_n
    total = len(tracks)
    released = a.get('released', False)
    meta = a.get('metaLabel', 'музыка')
    secs = []
    for t in tracks:
        if t['free']:
            btn = f'<button class="play fx" data-delay="1.0" data-n="{t["n"]}">{ICO_PLAY}{EQ}<span class="lbl">слушать</span></button>'
        elif released:
            btn = f'<a class="play ext fx" data-delay="1.0" href="#listen">{ICO_PLAY}<span class="lbl">полностью — на платформах</span></a>'
        else:
            btn = '<span class="play locked fx" data-delay="1.0" aria-disabled="true">скоро — в полном альбоме</span>'
        secs.append(f'''  <section class="track{" light" if t.get("light") else ""}" id="t{t["n"]}" data-bg="{e(t["bg"])}" data-horizon="{t.get("h", 0.67)}">
    <div class="num fx">{t["n"]} / {total}</div>
    <h2 class="fx" data-fx="title" data-delay="0.1"><span class="silver">{e(t["t"])}</span></h2>
    <p class="phrase fx" data-split="words" data-delay="0.45">{e(t["p"])}</p>
    <div class="meta fx" data-delay="0.8">{fmt(t["d"])} · {e(meta)}</div>
    {btn}
    {f'<a class="vid fx" data-delay="1.2" href="{e(t["video"])}" target="_blank" rel="noopener">{ICO_PLAY}клип на YouTube</a>' if t.get("video") else ''}
  </section>
''')
    L = a['listen']
    soon = f'    <p class="soon fx">{L["soon"]}</p>\n' if L.get('soon') else ''
    disclaimer = f'    <p class="disclaimer fx">{L["disclaimer"]}</p>\n' if L.get('disclaimer') else ''
    site = {
        'first': a['hero']['bg'],
        'items': [{'n': t['n'], 't': t['t'], 'tag': 'доступно' if t['free'] else ''} for t in tracks],
        'album': {'slug': slug, 'title': a['title'], 'artist': a['artist'],
                  'tracks': [{k: t[k] for k in ('n', 't', 'p', 'bg', 'd', 'free')} for t in tracks]},
    }
    out = head(f'{a["title"]} — {a["artist"]}', a['description'], f'assets/{a["hero"]["bg"]}.webp', '../')
    out += f'''<link rel="stylesheet" href="../shared/panel.css">
</head>
<body class="v2">
<canvas id="scene"></canvas>
<div class="veil"></div>
<div class="grain"></div>

<header class="top">
  <a href="../" class="logo-link" aria-label="Все альбомы"><img src="../shared/logo-white.png" alt="Espinoza" class="logo"></a>
  <div class="top-right">
    <a class="top-cta" href="#listen">{SVG_PLAY}Слушать альбом</a>
  </div>
</header>

{menus(a.get('menuLabel', 'Треки'))}
<main>
{hero(a['hero'], a['hero']['bg'])}
{manifest(a['manifest'], a['manifest']['bg'])}
  <!-- Pistas: cada una cambia el paisaje de fondo -->
{''.join(secs)}
  <!-- Escuchar -->
  <section class="listen" id="listen" data-bg="{e(L['bg'])}" data-horizon="{L.get('horizon', 0.67)}">
    <h2 class="fx" data-fx="title"><span class="silver">Слушать альбом</span></h2>
{soon}    <div class="platforms fx">{platforms(L['platforms'])}</div>
    <p class="credits fx">{L['credits']}</p>
{disclaimer}    <p class="back fx"><a href="../">← Все альбомы</a></p>
  </section>
</main>

<a class="made" href="https://espinoza.ru" target="_blank" rel="noopener">Проект от <span>espinoza.ru</span></a>

{PLAYER.format(title=e(a['title']), free=free_n, total=total)}
<script>window.SITE = {json.dumps(site, ensure_ascii=False)};</script>
<script src="../shared/core.js"></script>
<script src="../shared/player.js"></script>
<script src="../shared/panel.js"></script>
</body>
</html>
'''
    return out


def home_page(s):
    albums = s['albums']
    secs = []
    for i, al in enumerate(albums):
        n = f'{i + 1:02d}'
        links = []
        if al.get('page'):
            links.append(f'<a class="play open fx" data-delay="1.0" href="{al["slug"]}/">{ICO_PLAY}<span class="lbl">открыть альбом</span></a>')
        pl = [p for p in al.get('platforms', []) if p.get('url')]
        pl_html = ''.join(f'<a href="{e(p["url"])}" target="_blank" rel="noopener">{e(p["name"])}</a>' for p in pl)
        secs.append(f'''  <section class="track album{" light" if al.get("light") else ""}" id="t{n}" data-bg="{e(al["bg"])}" data-horizon="{al.get("h", 0.67)}">
    <img class="a-cover fx" src="{e(al["cover"])}" alt="{e(al["title"])}" loading="lazy" width="160" height="160">
    <div class="num fx">{e(al.get("kind", "альбом"))}{f" · {al['year']}" if al.get("year") else ""}</div>
    <h2 class="fx" data-fx="title" data-delay="0.1"><span class="silver">{e(al["title"])}</span></h2>
    <p class="phrase fx" data-split="words" data-delay="0.45">{e(al["p"])}</p>
    <div class="meta fx" data-delay="0.8">{e(al["meta"])}</div>
    {''.join(links)}
    {f'<div class="platforms small fx" data-delay="1.1">{pl_html}</div>' if pl_html else ''}
  </section>
''')
    site = {'first': s['hero']['bg'], 'items': [{'n': f'{i + 1:02d}', 't': al['title'], 'tag': ''} for i, al in enumerate(albums)]}
    out = head(s['title'], s['description'], s['hero']['bg'] + '.webp', '')
    out += f'''</head>
<body class="home">
<canvas id="scene"></canvas>
<div class="veil"></div>
<div class="grain"></div>

<header class="top">
  <img src="shared/logo-white.png" alt="Espinoza" class="logo">
</header>

{menus('Альбомы')}
<main>
{hero(s['hero'], s['hero']['bg'])}
  <!-- Álbumes: cada uno con su paisaje -->
{''.join(secs)}
  <section class="listen" id="listen" data-bg="{e(s['outro']['bg'])}" data-horizon="{s['outro'].get('horizon', 0.67)}">
    <h2 class="fx" data-fx="title"><span class="silver">{e(s['outro']['title'])}</span></h2>
    <p class="soon fx">{s['outro']['text']}</p>
    <p class="credits fx">{s['outro']['credits']}</p>
  </section>
</main>

<a class="made" href="https://espinoza.ru" target="_blank" rel="noopener">Проект от <span>espinoza.ru</span></a>

<script>window.SITE = {json.dumps(site, ensure_ascii=False)};</script>
<script src="shared/core.js"></script>
</body>
</html>
'''
    return out


def main():
    s = json.load(open(os.path.join(ROOT, 'site.json'), encoding='utf-8'))
    for al in s['albums']:
        p = os.path.join(ROOT, al['slug'], 'album.json')
        if al.get('page') and os.path.exists(p):
            a = json.load(open(p, encoding='utf-8'))
            open(os.path.join(ROOT, al['slug'], 'index.html'), 'w', encoding='utf-8').write(album_page(al['slug'], a))
            print('álbum', al['slug'])
    open(os.path.join(ROOT, 'index.html'), 'w', encoding='utf-8').write(home_page(s))
    print('índice')


if __name__ == '__main__':
    main()
