#!/usr/bin/env python3
"""Fetch the lab's publication list from OpenAlex and write it to
assets/data/publications.json.

Run by .github/workflows/publications.yml once a month. Nothing on the website
talks to OpenAlex directly: the browser only ever reads the JSON this writes,
so the API key stays private and visitors cost nothing.

    OPENALEX_API_KEY   free key from https://openalex.org/settings/api
    OPENALEX_MAILTO    contact address, good manners for any API

Why two requests to start with: OpenAlex is explicit that you must resolve an
identifier to an entity ID rather than filtering on names, which are ambiguous.
So ORCID -> author ID -> that author's works.
"""
import json, os, sys, time, urllib.parse, urllib.request
from datetime import date, timezone, datetime

ORCID = 'https://orcid.org/0000-0003-2115-0692'          # Paul R. Ohodnicki, Jr.
API = 'https://api.openalex.org'
OUT = 'assets/data/publications.json'

KEY = os.environ.get('OPENALEX_API_KEY', '').strip()
MAILTO = os.environ.get('OPENALEX_MAILTO', '').strip()

# Which of the research topics a paper belongs to, by keyword in its title.
# Keys are the research/<slug>.html pages, so the explorer can link straight
# to them. A paper can match several.
TOPIC_KEYWORDS = {
 'ferrites-nanocomposites': ['ferrite', 'mn-zn', 'ni-zn', 'nizn', 'mnzn', 'spinel',
                             'nanocomposite'],
 'amorphous-nanocrystalline': ['amorphous', 'nanocrystalline', 'manc', 'metglas',
                               'soft magnetic alloy', 'co-rich', 'finemet'],
 'permanent-magnets': ['permanent magnet', 'hexaferrite', 'hard magnet'],
 'processing': ['anneal', 'annealing', 'laser processing', 'rapid thermal',
                'additive manufactur', 'sinter', 'binder jet', 'melt spin',
                'thermal processing', 'field processing'],
 'magnetic-characterization': ['permeability', 'core loss', 'coercivity',
                               'saturation magnetization', 'curie', 'anisotropy',
                               'magnetometry', 'magnetic properties', 'hysteresis',
                               'first order reversal'],
 'power-components': ['transformer', 'inductor', 'motor', 'power electronic',
                      'power conversion', 'converter', 'electric machine',
                      'power dense', 'grid', 'electrification'],
 'magnetics-computation': ['density functional', 'first principles', 'micromagnetic',
                           'finite element', 'multi-objective', 'thermodynamic',
                           'calphad'],
 'optical-thin-films': ['thin film', 'plasmonic', 'coating', 'nanoparticle',
                        'au/sio2', 'noble metal'],
 'single-crystal-fibers': ['single crystal', 'sapphire', 'yttrium iron garnet', 'yig',
                           'crystal growth', 'pedestal growth', 'lhpg', 'garnet'],
 'quantum-sensing': ['nitrogen-vacancy', 'nv center', 'nv centre',
                     'optically detected magnetic resonance', 'odmr', 'quantum sens',
                     'magneto-optic'],
 'interrogators': ['interrogat', 'instrumentation', 'photodetector',
                   'transimpedance'],
 'energy-asset-monitoring': ['battery', 'dissolved gas', 'state of charge',
                             'state-of-charge', 'energy storage', 'li-ion',
                             'lithium'],
 'infrastructure-monitoring': ['pipeline', 'corrosion', 'bridge', 'nuclear',
                               'dry cask', 'distributed acoustic', 'dark fiber',
                               'structural health', 'non-destructive', 'guided wave',
                               'molten salt', 'infrastructure'],
 'photonics-computation': ['deep learning', 'neural network', 'machine learning',
                           'digital twin', 'sim-to-real', 'artificial intelligence',
                           'physics-informed', 'data analytics'],
}


def get(path, **params):
    if KEY:
        params['api_key'] = KEY
    if MAILTO:
        params['mailto'] = MAILTO
    url = f'{API}/{path}?' + urllib.parse.urlencode(params)
    for attempt in range(5):
        try:
            with urllib.request.urlopen(url, timeout=60) as r:
                return json.loads(r.read().decode())
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503) and attempt < 4:
                time.sleep(2 ** attempt)
                continue
            raise
    raise SystemExit('OpenAlex: too many retries')


def author_id():
    """ORCID -> OpenAlex author ID, as the docs require."""
    data = get('authors', filter=f'orcid:{ORCID}', per_page=5)
    results = data.get('results') or []
    if not results:
        raise SystemExit(f'No OpenAlex author found for {ORCID}')
    if len(results) > 1:
        print(f'note: {len(results)} author records share that ORCID; '
              f'using the one with the most works', file=sys.stderr)
        results.sort(key=lambda a: a.get('works_count', 0), reverse=True)
    a = results[0]
    print(f"author: {a['display_name']}  {a['id']}  "
          f"{a.get('works_count')} works, {a.get('cited_by_count')} citations")
    return a['id'].rsplit('/', 1)[-1], a


def topics_for(title):
    low = (title or '').lower()
    return [slug for slug, words in TOPIC_KEYWORDS.items()
            if any(w in low for w in words)]


def tidy(work):
    src = (work.get('primary_location') or {}).get('source') or {}
    authors = [(a.get('author') or {}).get('display_name')
               for a in (work.get('authorships') or [])]
    title = work.get('title') or work.get('display_name') or ''
    return {
        'id': (work.get('id') or '').rsplit('/', 1)[-1],
        'title': title.strip(),
        'authors': [a for a in authors if a],
        'venue': (src.get('display_name') or '').strip(),
        'year': work.get('publication_year'),
        'type': work.get('type') or '',
        'doi': work.get('doi') or '',
        'url': (work.get('doi')
                or ((work.get('best_oa_location') or {}).get('landing_page_url'))
                or work.get('id') or ''),
        'oa': bool((work.get('open_access') or {}).get('is_oa')),
        'oa_url': (work.get('open_access') or {}).get('oa_url') or '',
        'cited_by': work.get('cited_by_count') or 0,
        'topics': topics_for(title),
    }


def main():
    if not KEY:
        print('warning: no OPENALEX_API_KEY set; the daily budget without one is '
              'small and this may fail', file=sys.stderr)
    aid, author = author_id()

    works, page = [], 1
    while True:
        data = get('works', filter=f'authorships.author.id:{aid}',
                   per_page=100, page=page, sort='publication_year:desc',
                   select='id,title,display_name,publication_year,type,doi,'
                          'cited_by_count,authorships,primary_location,'
                          'open_access,best_oa_location')
        batch = data.get('results') or []
        works += batch
        total = (data.get('meta') or {}).get('count', 0)
        print(f'  page {page}: {len(batch)} works ({len(works)}/{total})')
        if len(batch) < 100 or len(works) >= total:
            break
        page += 1
        if page > 30:                      # 3,000 works is far beyond plausible
            break

    items = [tidy(w) for w in works]
    items = [i for i in items if i['title']]
    items.sort(key=lambda i: (-(i['year'] or 0), -i['cited_by']))

    payload = {
        'generated': datetime.now(timezone.utc).strftime('%Y-%m-%d'),
        'source': 'OpenAlex',
        'author': {'name': author.get('display_name'), 'orcid': ORCID,
                   'openalex': author.get('id'),
                   'works_count': author.get('works_count'),
                   'cited_by_count': author.get('cited_by_count')},
        'count': len(items),
        'items': items,
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(payload, f, ensure_ascii=False, indent=1)
    print(f'wrote {OUT}: {len(items)} publications')


if __name__ == '__main__':
    main()
