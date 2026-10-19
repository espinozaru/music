"""
Links por canción en todas las plataformas → <álbum>/album.json (tracks[].links).

Lee en album.json:  "ids": {"spotify": "<album id>", "yandex": "<album id>", "deezer": "<album id>", "youtube": "<playlist url>"}
Cada pista de album.json se empareja por título en cada plataforma (sin mayúsculas ni signos; si el título
difiere, se pone "match" en la pista). Avisa de las que falten en alguna plataforma.

  python3 tools/links.py <álbum> [<álbum> …]
"""
import json, os, re, sys, unicodedata, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = {'User-Agent': 'Mozilla/5.0'}


def get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30).read().decode('utf-8', 'replace')


def norm(t):
    t = unicodedata.normalize('NFKD', t.lower())
    return re.sub(r'[^0-9a-zа-яё]', '', ''.join(c for c in t if not unicodedata.combining(c)))


def spotify(album_id):
    s = get(f'https://open.spotify.com/embed/album/{album_id}')
    d = json.loads(re.search(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', s).group(1))
    tl = d['props']['pageProps']['state']['data']['entity']['trackList']
    return [(t['title'], 'https://open.spotify.com/track/' + t['uri'].split(':')[-1]) for t in tl]


def yandex(album_id):
    s = get(f'https://music.yandex.com/album/{album_id}').replace('\\"', '"')
    seen, out = set(), []
    for tid, title in re.findall(r'"id":"(\d+)","isAvailable":true,"isRemoved":false,"title":"([^"]+)"', s):
        if tid not in seen:
            seen.add(tid)
            out.append((title, f'https://music.yandex.ru/album/{album_id}/track/{tid}'))
    return out


def deezer(album_id):
    d = json.loads(get(f'https://api.deezer.com/album/{album_id}/tracks?limit=100'))
    return [(t['title'], t['link']) for t in d.get('data', [])]


def main():
    for slug in sys.argv[1:]:
        p = os.path.join(ROOT, slug, 'album.json')
        a = json.load(open(p, encoding='utf-8'))
        ids = a.get('ids', {})
        sp = spotify(ids['spotify']) if ids.get('spotify') else []
        ya = yandex(ids['yandex']) if ids.get('yandex') else []
        dz = deezer(ids['deezer']) if ids.get('deezer') else []
        by = lambda lst: {norm(t): u for t, u in lst}
        Y, S, D = by(ya), by(sp), by(dz)
        for tr in a['tracks']:
            k = norm(tr.get('match', tr['t']))
            links = []
            if k in Y: links.append({'name': 'Яндекс Музыка', 'url': Y[k]})
            elif ids.get('yandex'): links.append({'name': 'Яндекс Музыка', 'url': f'https://music.yandex.ru/album/{ids["yandex"]}'})  # sin la pista en Yandex: el álbum
            if k in S: links.append({'name': 'Spotify', 'url': S[k]})
            if ids.get('youtube'): links.append({'name': 'YouTube Music', 'url': ids['youtube']})
            if k in D: links.append({'name': 'Deezer', 'url': D[k]})
            tr['links'] = links
            miss = [n for n, M in (('yandex', Y), ('spotify', S), ('deezer', D)) if ids.get(n) and k not in M]
            if miss: print('  falta', tr['t'], '→', ', '.join(miss))
        json.dump(a, open(p, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        print(slug, 'spotify', len(sp), 'yandex', len(ya), 'deezer', len(dz))


if __name__ == '__main__':
    main()
