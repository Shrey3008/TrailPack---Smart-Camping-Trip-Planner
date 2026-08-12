#!/usr/bin/env python3
"""Regenerate frontend/discover-photos.js — one real photograph per Discover
carousel destination, resolved from Wikimedia and written out as a static map.

Run offline whenever the destination lists in frontend/discover.js change:

    python3 tools/resolve-discover-photos.py

Nothing at runtime calls Wikimedia; the browser only loads the resulting image
URLs. Re-running is safe and idempotent apart from upstream edits to the
articles.

Why Wikimedia and not the NPS API: developer.nps.gov requires an API key, and
answers 403 without one. Wikimedia needs no key, covers the ten USFS/state
properties the NPS API would have missed entirely, and returns the license and
author for each file, which is what lets the cards render a correct credit.

Two rules the resolver follows:

  * The photo must depict the destination the card is captioned with. Where a
    feature sits inside a larger unit, the feature's own article wins — Hoh
    Rainforest rather than Olympic, Lake Powell rather than Glen Canyon — so
    the caption never has to be softened to match a parent-unit photo.
  * A lead image is not automatically a photograph. Five destinations needed a
    hand-picked file because the article's lead image was a map, a satellite
    raster, a building, or absent; see OVERRIDES.
"""
import json
import os
import re
import subprocess
import sys
import time
import urllib.parse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DISCOVER_JS = os.path.join(ROOT, 'frontend', 'discover.js')
OUT_JS = os.path.join(ROOT, 'frontend', 'discover-photos.js')
UA = 'TrailPack-photo-resolver/1.0 (https://github.com/ TrailPack)'
THUMB_W = 640          # a hint; MediaWiki answers with the nearest servable width
NPS_IMG_W = 640        # nps.gov resizes on ?width=; cards render ~270 CSS px
# Optional: `--review <path>` writes contact sheets next to that path for a
# visual check of what was resolved. Off unless asked for.
REVIEW_OUT = (sys.argv[sys.argv.index('--review') + 1]
              if '--review' in sys.argv[:-1] else '')

# Destinations that are NPS units in their own right, with the park code the
# NPS API knows them by. These prefer NPS: its photographs are federal works,
# so most carry no attribution condition, where Wikimedia's mostly do.
#
# Deliberately absent, and therefore left on Wikimedia:
#   * White Mountain / Pisgah National Forest, Mount Whitney, Mount Hood,
#     Pikes Peak, Mount Washington, Lake Tahoe, Niagara Falls, Multnomah Falls,
#     Lake of the Ozarks — USFS, state or municipal land, not NPS units.
#   * Hoh Rainforest and Lake Powell — inside Olympic and Glen Canyon. Asking
#     NPS for them means asking for the parent unit, and a parent-unit photo
#     under a feature's name is the mislabelling this whole change removes.
PARK_CODES = {
    'Yosemite National Park': 'yose',
    'Zion National Park': 'zion',
    'Acadia National Park': 'acad',
    'Glacier National Park': 'glac',
    'Yellowstone National Park': 'yell',
    'Grand Canyon National Park': 'grca',
    'Olympic National Park': 'olym',
    'Sequoia National Park': 'seki',
    'Redwood National Park': 'redw',
    'Great Smoky Mountains': 'grsm',
    'Shenandoah National Park': 'shen',
    'Muir Woods': 'muwo',
    'Congaree National Park': 'cong',
    'Rocky Mountain National Park': 'romo',
    'Grand Teton National Park': 'grte',
    'Mount Rainier National Park': 'mora',
    'North Cascades National Park': 'noca',
    'Crater Lake National Park': 'crla',
    'Voyageurs National Park': 'voya',
    'Apostle Islands': 'apis',
    'Death Valley National Park': 'deva',
    'Joshua Tree National Park': 'jotr',
    'Saguaro National Park': 'sagu',
    'Bryce Canyon National Park': 'brca',
    'Arches National Park': 'arch',
    'Big Bend National Park': 'bibe',
    'Canyonlands National Park': 'cany',
    'White Sands National Park': 'whsa',
}

# NPS serves each park's images in its own order, and the first usable one is
# often a mood, wildlife or activity shot rather than the landscape that makes
# the park recognisable. These name the image to use instead, by title. Matched
# on title rather than position so an upstream reorder cannot silently swap the
# photo; if the title stops matching, the resolver warns and falls back to the
# normal first-usable pick rather than failing.
NPS_IMAGE_PICK = {
    # was a hiker silhouetted at sunset, almost black at card size
    'Acadia National Park': 'Sand Beach and Beehive from the Great Head Trail',
    # was a distant elk herd in a frosty field
    'Olympic National Park': 'Tide Pools of the Olympic Coast',
    # was the Stehekin marina, boats and docks rather than the range
    'North Cascades National Park': 'Pelton Basin from Cascade Pass',
}

# NPS units kept on Wikimedia anyway: everything NPS offers for these is less
# representative than the Wikimedia photo it would replace. Saguaro's options
# are a near-black lightning storm and a snowed-over desert the API itself
# calls a "rare sight"; Sequoia's are a guardrailed viewpoint and a snow-caked
# trunk. The Wikimedia saguaro-at-sunset and giant sequoia are the images a
# reader would recognise, which is worth one attribution line each.
FORCE_WIKIMEDIA = {'Saguaro National Park', 'Sequoia National Park'}

# NPS image titles/captions that are not a scenic photograph of the place.
# Matched on word boundaries, never as substrings: NPS altText is prose that
# almost always opens "Photograph of ...", so a bare 'graph' rejected every
# image for Voyageurs and the Apostle Islands, and elsewhere quietly skipped
# each park's lead image in favour of whichever one happened to be described
# differently. 'sign' has the same problem inside "designated"/"designed".
# 'graph' is gone entirely — 'chart' and 'diagram' already cover what it meant.
NPS_REJECT = ('map', 'maps', 'logo', 'sign', 'signs', 'chart', 'diagram',
              'brochure', 'poster', 'portrait', 'headshot', 'illustration',
              'artwork')
NPS_REJECT_RE = re.compile(r'\b(%s)\b' % '|'.join(NPS_REJECT), re.I)

# Article titles for destinations whose card name is ambiguous or is not itself
# an article title.
TITLES = {
    'Great Smoky Mountains':  'Great Smoky Mountains',
    'Muir Woods':             'Muir Woods National Monument',
    'Redwood National Park':  'Redwood National and State Parks',
    'Glacier National Park':  'Glacier National Park (U.S.)',
    'Apostle Islands':        'Apostle Islands National Lakeshore',
}

# Destinations whose article lead image was not a usable photograph of the
# place. Each value is a Commons file, chosen by eye from that subject's own
# images.
OVERRIDES = {
    # Lead image was a Sentinel-2 satellite raster of the reservoir.
    'Lake Powell':        'Lake Powell, Near Page Arizona (3449612604).jpg',
    # Lead image was an 1895 map of Ashland County.
    'Apostle Islands':    'Sea kayaking along Apostle Islands National Lakeshore (7666824620).jpg',
    # Lead image was a satellite outline of the reservoir.
    'Lake of the Ozarks': 'Lake of the Ozarks, MO 01.JPG',
    # Lead image was the park's adobe visitor centre: inside the park, but not
    # the gypsum dunefield the name denotes.
    'White Sands National Park': 'White Sands National Park, New Mexico, USA8.jpg',
    # Article carries no lead image at all.
    'Glacier National Park': 'St Mary Lake.jpg',
}


def fetch(url, attempts=6):
    """GET JSON via curl, backing off when Wikimedia throttles.

    curl rather than urllib: urllib from some environments is answered 429 on
    the very first call while curl to the identical URL returns 200.

    Wikimedia starts returning 429s (with an empty body, which is why this has
    to check the status rather than just parsing) a few dozen requests in, so
    every call retries with an exponential backoff before giving up.
    """
    delay = 2.0
    last = ''
    for attempt in range(attempts):
        p = subprocess.run(
            ['curl', '-s', '-m', '30', '-w', '\n%{http_code}',
             '-H', 'User-Agent: ' + UA, url],
            capture_output=True, text=True)
        if p.returncode != 0:
            last = 'curl exit %d' % p.returncode
        else:
            body, _, status = p.stdout.rpartition('\n')
            if status.strip() == '200' and body.strip():
                try:
                    return json.loads(body)
                except json.JSONDecodeError:
                    last = 'unparseable body'
            else:
                last = 'HTTP %s' % (status.strip() or '?')
        if attempt < attempts - 1:
            time.sleep(delay)
            delay *= 2
    # Redact the key: NPS takes it as a query parameter, so an unredacted URL
    # in an error message would put the credential in the console and in logs.
    safe = re.sub(r'(api_key=)[^&]*', r'\1<redacted>', url)
    raise RuntimeError('%s after %d attempts: %s' % (last, attempts, safe[:110]))


def nps_key():
    """NPS API key from the environment or .env. Absent is not an error: every
    destination then resolves through Wikimedia, as it did before."""
    key = os.environ.get('NPS_API_KEY', '').strip()
    if key:
        return key
    path = os.path.join(ROOT, '.env')
    if os.path.exists(path):
        for line in open(path, encoding='utf-8'):
            line = line.strip()
            if line.startswith('NPS_API_KEY='):
                return line.split('=', 1)[1].strip().strip('"\'')
    return ''


def nps_photo(name, code, key):
    """First usable scenic image NPS holds for a park, or None.

    Returns None rather than raising on anything unexpected — a wrong park
    code, a unit with no images, an entry with no url — so the caller can fall
    back to Wikimedia instead of the card losing its photo.
    """
    q = urllib.parse.urlencode({'parkCode': code, 'fields': 'images',
                                'limit': '1', 'api_key': key})
    data = fetch('https://developer.nps.gov/api/v1/parks?' + q)
    items = data.get('data') or []
    if not items:
        return None
    park = items[0]
    # Guard against a code that resolves to a different unit than the card names.
    full = (park.get('fullName') or '').lower()
    stem = name.lower().replace(' national park', '').replace(' national', '').strip()
    if stem and stem.split()[0] not in full:
        print('       NPS parkCode %s is "%s", not %s — skipping'
              % (code, park.get('fullName'), name))
        return None

    images = park.get('images') or []
    want = NPS_IMAGE_PICK.get(name)
    if want:
        chosen = [i for i in images if (i.get('title') or '').strip() == want]
        if chosen:
            images = chosen
        else:
            print('       NPS_IMAGE_PICK %r no longer present for %s — '
                  'falling back to first usable' % (want, name))

    for img in images:
        url = (img.get('url') or '').strip()
        if not url.startswith('http'):
            continue
        blurb = ' '.join(filter(None, [img.get('title'), img.get('caption'),
                                       img.get('altText')]))
        if NPS_REJECT_RE.search(blurb):
            continue
        credit = strip_html(img.get('credit') or '')
        # NPS publishes federal works, which carry no attribution condition —
        # but the API also serves donated and contractor images whose credit
        # names someone other than NPS. Only the NPS-credited ones are treated
        # as credit-free; anything else keeps a visible credit.
        is_nps = (not credit) or re.search(r'\bNPS\b|National Park Service',
                                           credit, re.I) is not None
        return {
            # NPS publishes originals — the unresized set averaged 2.2 MB and
            # peaked at 8.2 MB, against ~230 KB for a Wikimedia thumbnail, which
            # would have been a 7x page-weight regression on the dashboard.
            # nps.gov resizes server-side on ?width=; verified as a real
            # resizer rather than a CDN variant, since ?foo=bar returns the
            # full-size original and the returned pixel dimensions track the
            # requested width.
            'src': '%s?width=%d' % (url.split('?')[0], NPS_IMG_W),
            'by': credit or 'National Park Service',
            # Not the raw credit string for the non-NPS case: `by` already
            # carries it, and the card renders "© {by} / {license}", which
            # would otherwise read "© Kristina Plaas / Kristina Plaas".
            'license': 'Public domain (NPS)' if is_nps else 'Courtesy photo (NPS)',
            'licenseUrl': 'https://www.nps.gov/aboutus/disclaimer.htm',
            'page': 'https://www.nps.gov/%s/' % code,
            'credit': not is_nps,
            'source': 'NPS',
        }
    return None


def destinations():
    """Parse the five DISCOVER_HOME_* lists out of discover.js."""
    src = open(DISCOVER_JS, encoding='utf-8').read()
    out = []
    for row in ('PARKS', 'FOREST', 'MOUNTAIN', 'LAKE', 'DESERT'):
        m = re.search(r'DISCOVER_HOME_%s = \[(.*?)\];' % row, src, re.S)
        if not m:
            raise SystemExit('could not find DISCOVER_HOME_%s in discover.js' % row)
        for name, region, terrain in re.findall(
                r"\{ name: '([^']+)',\s*region: '([^']+)',.*?terrain: '(\w+)'", m[1]):
            out.append({'name': name, 'region': region, 'terrain': terrain})
    return out


def strip_html(v):
    return re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', v or '')).strip()


def lead_image(title):
    q = urllib.parse.urlencode({
        'action': 'query', 'redirects': '1', 'titles': title,
        'prop': 'pageimages', 'piprop': 'name',
        'format': 'json', 'formatversion': '2',
    })
    pages = fetch('https://en.wikipedia.org/w/api.php?' + q).get(
        'query', {}).get('pages', [])
    return pages[0].get('pageimage') if pages else None


def file_info(filename):
    q = urllib.parse.urlencode({
        'action': 'query', 'titles': 'File:' + filename, 'prop': 'imageinfo',
        'iiprop': 'extmetadata|url', 'iiurlwidth': str(THUMB_W),
        'format': 'json', 'formatversion': '2',
    })
    for host in ('commons.wikimedia.org', 'en.wikipedia.org'):
        pages = fetch('https://%s/w/api.php?%s' % (host, q)).get(
            'query', {}).get('pages', [])
        if pages and 'imageinfo' in pages[0]:
            return pages[0]['imageinfo'][0]
    return None


def tidy_author(v):
    """extmetadata Artist is free-form wikitext; keep the first credited name."""
    v = strip_html(v)
    v = re.split(r'\s*derivative work:', v)[0]
    v = re.sub(r'\s*\(talk\s*·\s*contribs\)', '', v)
    v = re.sub(r'\s+at\s+(en\.)?wikipedia$', '', v, flags=re.I)
    # Stripping inline <a> tags leaves gaps before punctuation.
    v = re.sub(r'\s+([,;])', r'\1', v)
    return v.strip(' ,;') or 'Unknown author'


def js_string(s):
    return "'" + str(s).replace('\\', '\\\\').replace("'", "\\'") + "'"


def wikimedia_photo(name):
    """Wikimedia record for a destination, or None."""
    fname = OVERRIDES.get(name) or lead_image(TITLES.get(name, name))
    if not fname:
        return None
    info = file_info(fname)
    if not info or not info.get('thumburl'):
        return None
    md = info.get('extmetadata', {})
    license_ = strip_html(md.get('LicenseShortName', {}).get('value', ''))
    return {
        # Use the thumbnail URL exactly as returned. upload.wikimedia.org only
        # serves a fixed set of widths per file and 400s on anything else — for
        # one file here only 500 and 960 are valid — so rewriting the width to a
        # uniform number breaks the image. THUMB_W is a hint; MediaWiki answers
        # with the nearest width it will serve, which is why the widths in the
        # generated file are not all equal. Only utm_* analytics params go.
        'src': info['thumburl'].split('?')[0],
        'by': tidy_author(md.get('Artist', {}).get('value', '')),
        'license': license_ or 'Unknown licence',
        'licenseUrl': md.get('LicenseUrl', {}).get('value', ''),
        'page': info.get('descriptionurl', ''),
        # Public-domain files carry no attribution condition, so the card shows
        # no credit strip for them.
        'credit': not license_.lower().startswith('public domain'),
        'source': 'override' if name in OVERRIDES else 'Wikimedia',
        'file': fname,
    }


def write_review_sheet(records):
    """Contact sheet for eyeballing the resolutions.

    Metadata is not enough to tell whether an image depicts the place: on the
    Wikimedia pass five lead images were a satellite raster, an 1895 map, a
    satellite outline, a visitor centre and nothing at all, and every one of
    them looked fine in the metadata. Anything a new source returns gets looked
    at the same way. Pages are chunked so each fits a viewport without
    scrolling.
    """
    css = ('<meta charset="utf-8"><style>'
           'body{font:12px system-ui;background:#111;color:#eee;margin:8px}'
           '.g{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}'
           'figure{margin:0;background:#1c1c1c;border-radius:6px;overflow:hidden}'
           '.ph{aspect-ratio:4/3;background:#000}'
           'img{width:100%;height:100%;object-fit:cover;display:block}'
           'figcaption{padding:5px 7px;line-height:1.3}'
           '.s{color:#fa0;font-weight:700}.l{color:#7c7}</style>')
    base, ext = os.path.splitext(REVIEW_OUT)
    pages = []
    for i in range(0, len(records), 10):
        cells = ''.join(
            '<figure><div class="ph"><img src="%s" referrerpolicy="no-referrer">'
            '</div><figcaption><b>%s</b><br><span class="s">%s</span><br>'
            '<span class="l">%s</span></figcaption></figure>'
            % (r['src'], r['name'], r['source'], r['license'])
            for r in records[i:i + 10])
        path = '%s%d%s' % (base, i // 10, ext)
        open(path, 'w', encoding='utf-8').write(css + '<div class="g">' + cells + '</div>')
        pages.append(path)
    print('\nreview sheets: %s' % ' '.join(pages))


def main():
    dests = destinations()
    key = nps_key()
    print('%d destinations parsed from discover.js' % len(dests))
    print('NPS API key: %s\n' % ('present — %d units will prefer NPS'
                                 % len(PARK_CODES) if key else
                                 'ABSENT, every destination resolves via Wikimedia'))
    records, failures = [], []

    for d in dests:
        name = d['name']
        try:
            photo = None
            code = None if name in FORCE_WIKIMEDIA else PARK_CODES.get(name)
            if key and code:
                photo = nps_photo(name, code, key)
                if not photo:
                    print('       NPS had nothing usable for %s — using Wikimedia'
                          % name)
            if not photo:
                photo = wikimedia_photo(name)
            if not photo:
                failures.append((name, 'no photo from NPS or Wikimedia'))
                print('  FAIL %-32s no photo' % name[:32])
                continue

            photo['name'] = name
            photo['terrain'] = d['terrain']
            records.append(photo)
            print('  ok   %-32s %-22s %-9s %s'
                  % (name[:32], photo['license'][:22], photo['source'],
                     photo.get('file', photo['src'].rsplit('/', 1)[-1])[:34]))
            time.sleep(0.6)
        except Exception as exc:                       # noqa: BLE001
            failures.append((name, repr(exc)))
            print('  ERR  %-32s %s' % (name[:32], exc))

    if failures:
        print('\n%d destination(s) could not be resolved:' % len(failures))
        for n, why in failures:
            print('  - %s: %s' % (n, why))
        print('These render the terrain tint panel instead of a photo.')

    body = ',\n'.join(
        "  %s: {\n"
        "    src: %s,\n"
        "    by: %s, license: %s,\n"
        "    licenseUrl: %s,\n"
        "    page: %s,\n"
        "    credit: %s\n"
        "  }" % (js_string(r['name']), js_string(r['src']), js_string(r['by']),
                 js_string(r['license']), js_string(r['licenseUrl']),
                 js_string(r['page']), 'true' if r['credit'] else 'false')
        for r in records)

    needing = sum(1 for r in records if r['credit'])
    from_nps = sum(1 for r in records if r['source'] == 'NPS')
    header = (
        '/* =============================================================================\n'
        '   Discover destination photography — GENERATED FILE, DO NOT EDIT BY HAND.\n'
        '\n'
        '   Regenerate with:  python3 tools/resolve-discover-photos.py\n'
        '\n'
        '   One photograph per destination, each one actually of the place the card\n'
        '   names. This replaced DISCOVER_PHOTO_POOL for these cards, which dealt a\n'
        '   generic terrain stock photo per row index — that put the same image under\n'
        '   two different park names in eight cases.\n'
        '\n'
        '   %d of %d come from the NPS API (federal works, so no credit needed) and\n'
        '   %d from Wikimedia, which covers the USFS, state and municipal properties\n'
        '   NPS does not know about, plus the two features whose only NPS entry would\n'
        '   be their parent unit. Keys are the exact `name` from the DISCOVER_HOME_*\n'
        '   lists in discover.js; a destination with no entry here falls back to the\n'
        '   terrain tint panel rather than borrowing another place\'s photo.\n'
        '\n'
        '   `credit: true` means the licence requires attribution and the card renders\n'
        '   a credit strip. Public-domain files carry no such condition and set false.\n'
        '   %d of %d files here require attribution.\n'
        '   ============================================================================= */\n'
        % (from_nps, len(records), len(records) - from_nps, needing, len(records)))

    open(OUT_JS, 'w', encoding='utf-8').write(
        header + 'const DISCOVER_PLACE_PHOTOS = {\n' + body + '\n};\n')

    if REVIEW_OUT:
        write_review_sheet(records)

    print('\nwrote %s' % os.path.relpath(OUT_JS, ROOT))
    print('%d/%d destinations resolved — %d NPS, %d Wikimedia, %d need a credit'
          % (len(records), len(dests), from_nps, len(records) - from_nps, needing))
    return 1 if len(records) != len(dests) else 0


if __name__ == '__main__':
    sys.exit(main())
