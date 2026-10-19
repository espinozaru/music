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


def head(title, desc, first_bg, base, font='Unbounded-Variable.woff2'):
    return f'''<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{e(title)}</title>
<meta name="description" content="{e(desc)}">
<link rel="preload" href="{base}shared/fonts/NotoSans-Variable.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="{base}shared/fonts/{font}" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="{e(first_bg)}" as="image">
<link rel="stylesheet" href="{base}shared/style.css">
<link rel="stylesheet" href="{base}shared/panel.css">
<link rel="stylesheet" href="{base}shared/home.css">
'''


def menus(label):
    return f'''<!-- Menú vertical fijo: rayas + números; se marca lo que está en pantalla y lo que suena -->
<nav class="side" id="side" aria-label="{label}"></nav>
<div class="side-tip" id="sideTip" aria-hidden="true"></div>
<!-- Móvil: la lista a pantalla completa, con el botón abajo (donde está el pulgar) -->
<nav class="m-menu" id="mMenu" aria-label="{label}"></nav>
<button class="m-btn" id="mBtn" aria-label="{label}" aria-expanded="false"><span></span><span></span></button>
'''


def hero(h, bg_attr, note=''):
    words = h['words']
    note_html = f'    <p class="hero-note fx" data-split="words" data-delay="2.3">{e(note)}</p>\n' if note else ''
    if len(words) == 1:  # una sola palabra (Ella, 2804): solo la grande, centrada
        return f'''  <!-- Portada: una palabra grande que entra por la derecha -->
  <section class="hero" id="top" data-bg="{e(bg_attr)}" data-horizon="{h.get('horizon', 0.67)}">
    <h1 class="stair one" aria-label="{e(h.get('label', words[0]))}">
      <span class="w w2 fx" data-fx="hero-r" data-delay="0.4"><span class="silver">{e(words[0])}</span></span>
    </h1>
    <p class="sub fx" data-split="words" data-delay="1.6">{e(h['sub'])}</p>
{note_html}    <div class="scroll-hint fx" data-delay="2.8"><span></span>{e(h.get('hint', 'листай медленно'))}</div>
  </section>
'''
    w1, w2 = words
    return f'''  <!-- Portada: título en escalera (la 1.ª palabra entra por la izquierda, la 2.ª por la derecha) -->
  <section class="hero" id="top" data-bg="{e(bg_attr)}" data-horizon="{h.get('horizon', 0.67)}">
    <h1 class="stair" aria-label="{e(h.get('label', w1 + ' ' + w2))}">
      <span class="w w1 fx" data-fx="hero-l" data-delay="0.3"><span class="silver">{e(w1)}</span></span>
      <span class="w w2 fx" data-fx="hero-r" data-delay="1.1"><span class="silver">{e(w2)}</span></span>
    </h1>
    <p class="sub fx" data-split="words" data-delay="2.0">{e(h['sub'])}</p>
{note_html}    <div class="scroll-hint fx" data-delay="3.2"><span></span>{e(h.get('hint', 'листай медленно'))}</div>
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
<aside class="player phone" id="player" role="region" aria-label="Плеер" data-keep>
  <button class="ph-toggle" id="phToggle" aria-label="Свернуть плеер" aria-expanded="true"><svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg></button>
  <!-- solo informa: el álbum de lo que suena (para cambiar de álbum está el ⇅ de la cabecera) -->
  <div class="ph-albumbar">
    <div class="ph-albsel" id="pAlbBox">
      <span class="pa-cover" id="pAlbCov"></span>
      <span class="pa-txt"><span class="pa-k"><span class="k-al">альбом</span><span class="k-now">сейчас играет</span></span><span class="pa-t" id="pAlbT"></span></span>
    </div>
  </div>
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
  <!-- volumen: altavoz (clic = silencio) · barra · cifra que se anima al moverla -->
  <div class="ph-vol">
    <button class="ph-mute" id="pMute" aria-label="Без звука" aria-pressed="false"><svg viewBox="0 0 24 24"><path class="spk" d="M4 9h4l5-4v14l-5-4H4z"/><path class="w1" d="M16 9.5a3.5 3.5 0 0 1 0 5"/><path class="w2" d="M18.5 7a7 7 0 0 1 0 10"/><path class="x" d="M16 9.5l5 5M21 9.5l-5 5"/></svg></button>
    <input class="p-vol" id="pVol" type="range" min="0" max="1" step="0.01" value="0.7" aria-label="Громкость">
    <span class="ph-vol-val" id="pVolVal" aria-hidden="true">70%</span>
  </div>
  <!-- como en una app: repetir la lista y temporizador de apagado (10 · 20 · 30 мин) -->
  <div class="ph-tools">
    <button class="ph-tool" id="pLoop" aria-pressed="false" title="Повтор: после последнего трека — снова первый"><svg viewBox="0 0 24 24"><path d="M17 2l3 3-3 3M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3M20 13v2a4 4 0 0 1-4 4H4"/></svg><span>повтор</span></button>
    <button class="ph-tool" id="pTimer" aria-pressed="false" title="Таймер сна"><svg viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg><span id="pTimerLbl">таймер</span></button>
    <div class="share-wrap">
      <button class="ph-tool" id="pShare" aria-haspopup="true" aria-expanded="false" title="Поделиться"><svg viewBox="0 0 24 24"><path d="M12 15V3M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg><span>поделиться</span></button>
      <div class="share-pop" id="sharePop" role="menu">
        <button data-share-album>Ссылка на альбом</button>
        <button data-share-song>Ссылка на эту песню</button>
      </div>
    </div>
  </div>
  <a class="p-cta" href="#listen">Полный альбом →</a>
  <button class="p-close" id="pClose" aria-label="Закрыть плеер" hidden>×</button>
  <p class="ph-album" id="phAlbum"></p>
  <ol class="ph-list" id="pList"></ol>
</aside>
'''


def player_html(albums, base):
    items = ''.join(f'      <a href="{base}{al["slug"]}/" data-slug="{al["slug"]}"><img src="{base}{e(al["cover"])}" alt="" width="40" height="40"><span>{e(al["title"])}<small>{e(al.get("kind", "альбом"))}</small></span></a>\n'
                    for al in albums if al.get('page'))
    return PLAYER


SHELL_TOP = '''<!-- fijo (data-keep): no cambia al navegar entre páginas -->
<canvas id="scene" data-keep></canvas>
<div class="bg" data-keep></div><div class="bg" data-keep></div>
<div class="veil" data-keep></div>
<div class="grain" data-keep></div>
'''


def site_albums(albums):
    return [{'slug': al['slug'], 'title': al['title'], 'kind': al.get('kind', 'альбом'), 'cover': al['cover']} for al in albums if al.get('page')]


def switch_menu(slug, albums, base='../'):
    out = []
    for al in albums:
        if not al.get('page'):
            continue
        cur = ' class="cur" aria-current="page"' if al['slug'] == slug else ''
        out.append(f'        <a href="{base}{al["slug"]}/"{cur}><img src="{base}{e(al["cover"])}" alt="" width="40" height="40"><span>{e(al["title"])}<small>{e(al.get("kind", "альбом"))}</small></span></a>\n')
    if slug:  # en un álbum: volver al índice
        out.append('        <a href="../" class="all"><span>← Все альбомы</span></a>\n')
    return ''.join(out)


def brand(slug, albums, base):
    """Cabecera de álbum: ← atrás · logo · ⇅ selector de álbumes"""
    back = '<a class="hd-btn hd-back" href="../" aria-label="Все альбомы"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg></a>'
    logo = f'<img src="{base}shared/logo-white.png" alt="Espinoza" class="logo">'
    if slug:
        logo = f'<a href="../" class="logo-link" aria-label="Все альбомы">{logo}</a>'
    return f'''  <div class="brand">
    {back}
    {logo}
    <div class="hd-switch">
      <button class="hd-btn" id="albSw" aria-label="Другие альбомы" aria-haspopup="true" aria-expanded="false"><svg viewBox="0 0 24 24"><path d="M8 9l4-4 4 4M8 15l4 4 4-4"/></svg></button>
      <nav class="sw-menu" id="swMenu" aria-label="Альбомы">
{switch_menu(slug, albums, base)}      </nav>
    </div>
  </div>
'''


def album_page(slug, a, albums):
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
        elif t.get('links'):
            btn = ''  # sin audio aquí: los links de la canción (abajo) hacen de botón
        elif released:
            btn = f'<a class="play ext fx" data-delay="1.0" href="#listen">{ICO_PLAY}<span class="lbl">полностью — на платформах</span></a>'
        else:
            btn = '<span class="play locked fx" data-delay="1.0" aria-disabled="true">скоро — в полном альбоме</span>'
        secs.append(f'''  <section class="track{" light" if t.get("light") else ""}" id="t{t["n"]}" data-bg="{e(t["bg"])}" data-horizon="{t.get("h", 0.67)}">
    <div class="num fx">{t["n"]} / {total}</div>
    <h2 class="fx" data-fx="title" data-delay="0.1"><span class="silver">{e(t["t"])}</span></h2>
    <p class="phrase fx" data-split="words" data-delay="0.45">{e(t["p"])}</p>
    <div class="meta fx" data-delay="0.8">{fmt(t["d"])} · {e(meta)} · <button class="share-t" data-share="t{t["n"]}" data-title="{e(t["t"])}"><svg viewBox="0 0 24 24"><path d="M12 15V3M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg>поделиться</button></div>
    {btn}
    {f'<a class="vid fx" data-delay="1.2" href="{e(t["video"])}" target="_blank" rel="noopener">{ICO_PLAY}клип на YouTube</a>' if t.get("video") else ''}
    {f'<div class="tlinks fx" data-delay="1.1"><span class="tl-label">{"слушать на" if not t["free"] else "эта песня на"}</span>' + ''.join(f'<a href="{e(l["url"])}" target="_blank" rel="noopener">{e(l["name"])}</a>' for l in t["links"]) + '</div>' if t.get("links") else ''}
  </section>
''')
    L = a['listen']
    soon = f'    <p class="soon fx">{L["soon"]}</p>\n' if L.get('soon') else ''
    disclaimer = f'    <p class="disclaimer fx">{L["disclaimer"]}</p>\n' if L.get('disclaimer') else ''
    site = {
        'type': 'album', 'albums': site_albums(albums),
        'still': a.get('motion') != 'parallax',  # fondo fijo salvo que el álbum pida parallax (zen)
        'first': a['hero']['bg'],
        'items': [{'n': t['n'], 't': t['t'], 'tag': 'доступно' if t['free'] else ''} for t in tracks],
        'album': {'slug': slug, 'title': a['title'], 'artist': a['artist'],
                  'tracks': [{k: t[k] for k in ('n', 't', 'p', 'bg', 'd', 'free')} for t in tracks]},
    }
    out = head(f'{a["title"]} — {a["artist"]}', a['description'], f'assets/{a["hero"]["bg"]}.webp', '../',
               'CormorantGaramond-Upright-Variable.woff2' if a.get('font') == 'serif' else 'Unbounded-Variable.woff2')
    out += f'''</head>
<body class="v2{" unb" if a.get("font") != "serif" else ""}{"" if free_n else " noplay"}">
{SHELL_TOP}
<header class="top">
  <!-- atrás · logo · selector para saltar a otro álbum -->
{brand(slug, albums, '../')}  <div class="top-right">
    <a class="top-cta" href="#listen">{SVG_PLAY}Слушать альбом</a>
  </div>
</header>

{menus(a.get('menuLabel', 'Треки'))}
<main>
{hero(a['hero'], a['hero']['bg'], ' '.join(a['manifest']['lines'] + [a['manifest']['big']]) if a.get('manifest') else '')}
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

{player_html(albums, '../')}
<script>window.SITE = {json.dumps(site, ensure_ascii=False)};</script>
<script src="../shared/app.js" data-keep></script>
</body>
</html>
'''
    return out


def home_page(s):
    """Índice: presentación de discos (funda + vinilo), fondo que cambia con el disco. Sin menú lateral."""
    cards = []
    for al in s['albums']:
        href = f'{al["slug"]}/' if al.get('page') else next((p['url'] for p in al.get('platforms', []) if p.get('url')), '#')
        ext = '' if al.get('page') else ' target="_blank" rel="noopener"'
        go = 'открыть альбом' if al.get('page') else 'слушать на платформах'
        kind = e(al.get('kind', 'альбом')) + (f' · {al["year"]}' if al.get('year') else '') + f' · {e(al["meta"])}'
        cards.append(f'''  <li class="disc" data-bg="{e(al["bg"])}.webp">
    <a href="{e(href)}"{ext}>
      <div class="sleeve-box">
        <div class="vinyl-slide"><div class="vinyl"><span class="label" style="background-image:url({e(al["cover"])})"></span></div></div>
        <div class="sleeve" style="background-image:url({e(al["cover"])})" role="img" aria-label="{e(al["title"])}"></div>
      </div>
      <div class="info">
        <div class="kind">{kind}</div>
        <h2><span class="silver">{e(al["title"])}</span></h2>
        <p class="p">{e(al["p"])}</p>
        <span class="go">{go} →</span>
      </div>
    </a>
  </li>
''')
    foot = ''
    for f in s.get('footer', []):
        ext = '' if f['url'].startswith('tel:') else ' target="_blank" rel="noopener"'
        extra = ''
        if f.get('extra'):
            x = f['extra']
            extra = f'<a href="{e(x["url"])}">{e(x["text"])}</a>'
        foot += f'      <div class="foot-col"><span class="foot-label">{e(f["label"])}</span><a href="{e(f["url"])}"{ext}>{e(f["text"])}</a>{extra}</div>\n'
    h = s['hero']
    out = head(s['title'], s['description'], h['bg'] + '.webp', '')
    out += f'''</head>
<body class="home unb v2" data-bg="{e(h['bg'])}.webp">
{SHELL_TOP}
<header class="top home-top">
  <img src="shared/logo-white.png" alt="Espinoza" class="logo">
</header>

<main>
  <div class="intro">
    <h1 class="eyebrow">{e(s['intro']['eyebrow'])}</h1>
    <p>{e(s['intro']['text'])}</p>
  </div>

  <!-- Discos: funda + vinilo; al pasar el ratón el vinilo sale y el fondo pasa al paisaje del álbum -->
  <ul class="discs">
{''.join(cards)}  </ul>

  <footer class="disco-foot">
    <div class="foot-cols">
{foot}    </div>
    <p class="credits">{s['outro']['credits']}</p>
  </footer>
</main>

{player_html(s['albums'], '')}
<script>window.SITE = {json.dumps({'type': 'home', 'albums': site_albums(s['albums'])}, ensure_ascii=False)};</script>
<script src="shared/app.js" data-keep></script>
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
            open(os.path.join(ROOT, al['slug'], 'index.html'), 'w', encoding='utf-8').write(album_page(al['slug'], a, s['albums']))
            print('álbum', al['slug'])
    open(os.path.join(ROOT, 'index.html'), 'w', encoding='utf-8').write(home_page(s))
    print('índice')


if __name__ == '__main__':
    main()
