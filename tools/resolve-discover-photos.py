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
    raise RuntimeError('%s after %d attempts: %s' % (last, attempts, url[:90]))


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


def main():
    dests = destinations()
    print('%d destinations parsed from discover.js\n' % len(dests))
    records, failures = [], []

    for d in dests:
        name = d['name']
        try:
            fname = OVERRIDES.get(name)
            source = 'override' if fname else 'lead image'
            if not fname:
                fname = lead_image(TITLES.get(name, name))
            if not fname:
                failures.append((name, 'no lead image and no override'))
                print('  FAIL %-32s no lead image' % name[:32])
                continue

            info = file_info(fname)
            if not info or not info.get('thumburl'):
                failures.append((name, 'no imageinfo for %s' % fname))
                print('  FAIL %-32s no imageinfo' % name[:32])
                continue

            md = info.get('extmetadata', {})
            license_ = strip_html(md.get('LicenseShortName', {}).get('value', ''))
            # Use the thumbnail URL exactly as returned. upload.wikimedia.org
            # only serves a fixed set of widths per file and 400s on anything
            # else — for one file here only 500 and 960 are valid — so
            # rewriting the width to a uniform number breaks the image. THUMB_W
            # is a hint; MediaWiki answers with the nearest width it will serve,
            # which is why the widths in the generated file are not all equal.
            # Only the utm_* analytics params are dropped.
            src = info['thumburl'].split('?')[0]

            records.append({
                'name': name,
                'terrain': d['terrain'],
                'src': src,
                'by': tidy_author(md.get('Artist', {}).get('value', '')),
                'license': license_ or 'Unknown licence',
                'licenseUrl': md.get('LicenseUrl', {}).get('value', ''),
                'page': info.get('descriptionurl', ''),
                # Public-domain files carry no attribution condition, so the
                # card shows no credit strip for them.
                'credit': not license_.lower().startswith('public domain'),
            })
            print('  ok   %-32s %-14s %-8s %s'
                  % (name[:32], license_[:14], source, fname[:40]))
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
        '   Resolved from Wikimedia (the NPS API needs a key). Keys are the exact\n'
        '   `name` from the DISCOVER_HOME_* lists in discover.js; a destination with\n'
        '   no entry here falls back to the terrain tint panel rather than borrowing\n'
        '   another place\'s photo.\n'
        '\n'
        '   `credit: true` means the licence requires attribution and the card renders\n'
        '   a credit strip. Public-domain files carry no such condition and set false.\n'
        '   %d of %d files here require attribution.\n'
        '   ============================================================================= */\n'
        % (needing, len(records)))

    open(OUT_JS, 'w', encoding='utf-8').write(
        header + 'const DISCOVER_PLACE_PHOTOS = {\n' + body + '\n};\n')

    print('\nwrote %s' % os.path.relpath(OUT_JS, ROOT))
    print('%d/%d destinations resolved, %d need a visible credit'
          % (len(records), len(dests), needing))
    return 1 if len(records) != len(dests) else 0


if __name__ == '__main__':
    sys.exit(main())
