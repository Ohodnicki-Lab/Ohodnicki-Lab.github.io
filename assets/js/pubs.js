/* ============================================================
   PUBLICATION EXPLORER

   Reads assets/data/publications.json, written each month from
   OpenAlex by .github/workflows/publications.yml. Nothing here
   talks to OpenAlex, so the page works offline and costs nothing
   per visitor.

   Two views:
     List  searchable, sortable, paged
     Map   one bubble per paper, clustered by research area,
           colour by year, area by citation count

   To change what is collected or how papers are tagged, edit
   tools/fetch_publications.py and re-run the Action.
   ============================================================ */
(function () {
  'use strict';

  var root = document.getElementById('pub-explorer');
  if (!root) return;

  /* Research areas, in the order they appear across the map. Clusters are
     placed in this sequence within their branch, so related areas end up as
     neighbouring clusters: the materials first, then how they are made and
     measured, then where they are used, then the modelling behind it. */
  /* slug, label, band, and whether a research page exists for it. Areas with
     no page still filter and cluster; their chips just are not links. */
  var TOPICS = [
    ['ferrites-nanocomposites',   'Ferrites & Nanocomposites',          'magnetics', 1],
    ['amorphous-nanocrystalline', 'Amorphous & Nanocrystalline Alloys', 'magnetics', 1],
    ['permanent-magnets',         'Permanent Magnets',                  'magnetics', 1],
    ['processing',                'Processing',                         'magnetics', 1],
    ['magnetic-characterization', 'Magnetic Characterization',          'magnetics', 1],
    ['power-components',          'Transformers, Inductors & Motors',   'magnetics', 1],
    ['magnetics-computation',     'Modelling (Magnetics)',              'magnetics', 1],
    ['optical-thin-films',        'Optical Thin Films',                 'photonics', 1],
    ['single-crystal-fibers',     'Single Crystal Fibers',              'photonics', 1],
    ['quantum-sensing',           'Quantum Sensing',                    'photonics', 1],
    ['interrogators',             'Interrogators',                      'photonics', 1],
    ['energy-asset-monitoring',   'Energy Asset Monitoring',            'photonics', 1],
    ['infrastructure-monitoring', 'Infrastructure Monitoring',          'photonics', 1],
    ['chemical-sensing',          'Chemical & Gas Sensing',             'photonics', 0],
    ['temperature-sensing',       'Temperature Sensing',                'photonics', 0],
    ['acoustic-sensing',          'Acoustic & Ultrasonic Sensing',      'photonics', 0],
    ['photonics-computation',     'AI & Data Analytics',                'photonics', 1],
    ['other',                     '',                                   'other',     0]
  ];
  var NAME = {}, BRANCH = {}, ORDER = {}, HAS_PAGE = {};
  TOPICS.forEach(function (t, i) {
    NAME[t[0]] = t[1]; BRANCH[t[0]] = t[2]; ORDER[t[0]] = i; HAS_PAGE[t[0]] = !!t[3];
  });
  // Bands run magnetics, then the unmatched papers, then photonics. They are
  // not captioned: the cluster labels already say what everything is.
  var BANDS = ['magnetics', 'other', 'photonics'];

  var RAMP = ['#002766', '#0A4BC2', '#6FA0F0', '#FFD277', '#FFB81C'];

  var state = { all: [], byId: {}, topic: 'all', type: 'all', sort: 'year',
                q: '', limit: 25, view: 'list', laid: null, lo: 0, hi: 0,
                vb: null, home: null };

  var els = {
    status:   root.querySelector('[data-pub-status]'),
    search:   root.querySelector('[data-pub-search]'),
    topic:    root.querySelector('[data-pub-topic]'),
    type:     root.querySelector('[data-pub-type]'),
    sort:     root.querySelector('[data-pub-sort]'),
    sortWrap: root.querySelector('[data-pub-sortwrap]'),
    views:    root.querySelectorAll('[data-pub-view]'),
    counts:   document.querySelectorAll('[data-pub-count]'),
    meta:     document.querySelector('[data-pub-meta]'),
    listWrap: root.querySelector('[data-pub-listwrap]'),
    list:     root.querySelector('[data-pub-list]'),
    more:     root.querySelector('[data-pub-more]'),
    map:      root.querySelector('[data-pub-map]'),
    panel:    root.querySelector('[data-pub-panel]')
  };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function authorLine(authors, max) {
    if (!authors || !authors.length) return '';
    max = max || 6;
    var names = authors.slice(0, max);
    if (authors.length > max) names.push('and ' + (authors.length - max) + ' others');
    return names.join(', ');
  }

  function citation(p) {
    var s = authorLine(p.authors, 12) + '. "' + p.title + '."';
    if (p.venue) s += ' ' + p.venue + ',';
    if (p.year) s += ' ' + p.year + '.';
    if (p.doi) s += ' ' + p.doi;
    return s;
  }

  /* ---------- filtering ---------- */
  function matches(p) {
    if (state.topic !== 'all' && (p.topics || []).indexOf(state.topic) < 0) return false;
    if (state.type !== 'all' && p.type !== state.type) return false;
    if (state.q) {
      var hay = (p.title + ' ' + (p.authors || []).join(' ') + ' ' + p.venue + ' ' +
                 (p.year || '') + ' ' +
                 (p.topics || []).map(function (t) { return NAME[t] || t; }).join(' ')).toLowerCase();
      var words = state.q.toLowerCase().split(/\s+/).filter(Boolean);
      for (var i = 0; i < words.length; i++) if (hay.indexOf(words[i]) < 0) return false;
    }
    return true;
  }

  function sorted(list) {
    var c = list.slice();
    if (state.sort === 'cited') c.sort(function (a, b) { return (b.cited_by - a.cited_by) || (b.year - a.year); });
    else if (state.sort === 'title') c.sort(function (a, b) { return a.title.localeCompare(b.title); });
    else c.sort(function (a, b) { return (b.year - a.year) || (b.cited_by - a.cited_by); });
    return c;
  }

  function setCount(n) {
    var text = n === state.all.length
      ? n + ' publications'
      : n + ' of ' + state.all.length + ' publications';
    els.counts.forEach(function (el) { el.textContent = text; });
  }

  /* ---------- list view ---------- */
  function row(p) {
    var title = p.url
      ? '<a href="' + esc(p.url) + '" target="_blank" rel="noopener">' + esc(p.title) + '</a>'
      : esc(p.title);
    var bits = [];
    if (p.venue) bits.push('<span class="pubitem__venue">' + esc(p.venue) + '</span>');
    if (p.year) bits.push('<span>' + p.year + '</span>');
    if (p.cited_by) bits.push('<span>' + p.cited_by + ' citation' + (p.cited_by === 1 ? '' : 's') + '</span>');
    if (p.oa && p.oa_url) bits.push('<a href="' + esc(p.oa_url) + '" target="_blank" rel="noopener">Open access</a>');
    var tags = (p.topics || []).map(function (t) {
      var label = esc(NAME[t] || t);
      return HAS_PAGE[t]
        ? '<a class="tag tag--topic" href="research/' + t + '.html">' + label + '</a>'
        : '<span class="tag tag--topic">' + label + '</span>';
    }).join(' ');
    return '<li class="pubitem">' +
      '<p class="pubitem__title">' + title + '</p>' +
      '<p class="pubitem__authors">' + esc(authorLine(p.authors)) + '</p>' +
      '<p class="pubitem__meta">' + bits.join('<span aria-hidden="true"> &middot; </span>') + '</p>' +
      (tags ? '<p class="pubitem__tags">' + tags + '</p>' : '') + '</li>';
  }

  function drawList() {
    var hits = sorted(state.all.filter(matches));
    var shown = hits.slice(0, state.limit);
    els.list.innerHTML = shown.map(row).join('') ||
      '<li class="pubitem pubitem--empty">Nothing matches that. Try fewer words, or clear the filters.</li>';
    setCount(hits.length);
    if (els.more) {
      var left = hits.length - shown.length;
      els.more.hidden = left <= 0;
      els.more.textContent = 'Show 25 more (' + left + ' remaining)';
    }
  }

  /* ---------- map view ---------- */
  function mix(a, b, t) {
    function n(h, i) { return parseInt(h.substr(1 + i * 2, 2), 16); }
    return 'rgb(' + [0, 1, 2].map(function (i) {
      return Math.round(n(a, i) + (n(b, i) - n(a, i)) * t);
    }).join(',') + ')';
  }

  function yearColour(y) {
    if (!y || state.hi === state.lo) return RAMP[1];
    var t = (y - state.lo) / (state.hi - state.lo);
    var seg = Math.min(Math.floor(t * (RAMP.length - 1)), RAMP.length - 2);
    return mix(RAMP[seg], RAMP[seg + 1], t * (RAMP.length - 1) - seg);
  }

  function radius(c) { return 4 + Math.sqrt(c || 0) * 1.2; }

  function layout(items) {
    // A paper sits in the rarest area it is tagged with, so distinctive work
    // is not swallowed by the big clusters.
    var freq = {};
    items.forEach(function (p) {
      (p.topics || []).forEach(function (t) { freq[t] = (freq[t] || 0) + 1; });
    });
    var groups = {};
    items.forEach(function (p) {
      var ts = (p.topics || []).slice().sort(function (a, b) { return freq[a] - freq[b]; });
      var key = ts[0] || 'other';
      (groups[key] = groups[key] || []).push(p);
    });

    // Clusters are laid out one branch at a time, in TOPICS order, so related
    // areas sit next to each other and the two branches occupy separate bands.
    var sides = { magnetics: [], photonics: [], other: [] };
    Object.keys(groups).forEach(function (k) { sides[BRANCH[k] || 'other'].push(k); });
    Object.keys(sides).forEach(function (b) {
      sides[b].sort(function (x, y) { return ORDER[x] - ORDER[y]; });
    });

    var nodes = [], labels = [];
    var GOLD = Math.PI * (3 - Math.sqrt(5));

    function placeSide(keys, cy) {
      if (!keys.length) return;
      var sizes = keys.map(function (k) {
        var area = groups[k].reduce(function (s, p) {
          var r = radius(p.cited_by); return s + r * r * Math.PI;
        }, 0);
        return Math.sqrt(area / Math.PI) * 1.15 + 12;
      });
      var total = sizes.reduce(function (a, b) { return a + b; }, 0);
      var pos = -total / 2;
      keys.forEach(function (k, i) {
        var gx = (pos + sizes[i] / 2) * 2.1;          // widen: the map is landscape
        var gy = cy + (i % 2 ? 38 : -38);             // stagger so labels clear
        pos += sizes[i];
        labels.push({ key: k, x: gx, y: gy, n: groups[k].length });
        groups[k].forEach(function (p, j) {
          var rr = 6.6 * Math.sqrt(j + 0.6), aa = j * GOLD;
          nodes.push({ p: p, x: gx + Math.cos(aa) * rr, y: gy + Math.sin(aa) * rr,
                       r: radius(p.cited_by), key: k });
        });
      });
    }

    placeSide(sides.magnetics, 0);
    placeSide(sides.other, 290);
    placeSide(sides.photonics, 550);

    for (var pass = 0; pass < 70; pass++) {
      for (var i = 0; i < nodes.length; i++) {
        for (var k = i + 1; k < nodes.length; k++) {
          var A = nodes[i], B = nodes[k];
          var dx = B.x - A.x, dy = B.y - A.y, need = A.r + B.r + 0.7;
          var d2 = dx * dx + dy * dy;
          if (d2 > need * need || d2 === 0) continue;
          var d = Math.sqrt(d2), push = (need - d) / d * 0.5;
          A.x -= dx * push; A.y -= dy * push;
          B.x += dx * push; B.y += dy * push;
        }
      }
    }

    var xs = [], ys = [];
    nodes.forEach(function (n) {
      xs.push(n.x - n.r, n.x + n.r);
      ys.push(n.y - n.r, n.y + n.r);
    });
    var pad = 50;
    return {
      nodes: nodes, labels: labels,
      box: { x: Math.min.apply(null, xs) - pad, y: Math.min.apply(null, ys) - pad,
             w: Math.max.apply(null, xs) - Math.min.apply(null, xs) + pad * 2,
             h: Math.max.apply(null, ys) - Math.min.apply(null, ys) + pad * 2 }
    };
  }

  function legend() {
    var stops = RAMP.map(function (c, i) {
      return '<stop offset="' + (i / (RAMP.length - 1) * 100) + '%" stop-color="' + c + '"/>';
    }).join('');
    return '<div class="pubmap__legend">' +
      '<div class="pubmap__key"><span>Year</span>' +
        '<svg width="130" height="10" aria-hidden="true"><defs><linearGradient id="yr">' + stops +
        '</linearGradient></defs><rect width="130" height="10" rx="5" fill="url(#yr)"/></svg>' +
        '<span class="pubmap__ends">' + state.lo + '<i></i>' + state.hi + '</span></div>' +
      '<div class="pubmap__key"><span>Citations</span>' +
        '<svg width="104" height="32" aria-hidden="true">' +
        '<circle cx="9" cy="20" r="' + radius(0).toFixed(1) + '"/>' +
        '<circle cx="40" cy="20" r="' + radius(50).toFixed(1) + '"/>' +
        '<circle cx="82" cy="20" r="' + radius(200).toFixed(1) + '"/></svg>' +
        '<span class="pubmap__ends">0<i></i>200+</span></div>' +
      '</div>';
  }


  /* ---------- panning and zooming ----------
     The map is one SVG, so moving around it means editing the viewBox rather
     than scrolling a container: drag to pan, wheel or pinch to zoom, and the
     buttons for anyone not using a mouse. */
  var MIN_SPAN = 120;            // closest zoom, in map units

  function applyVB() {
    var svg = els.map.querySelector('svg');
    if (!svg || !state.vb) return;
    var v = state.vb;
    svg.setAttribute('viewBox', [v.x, v.y, v.w, v.h].join(' '));
  }

  function zoomBy(factor, ax, ay) {
    var v = state.vb, home = state.home;
    if (!v) return;
    var w = v.w * factor, h = v.h * factor;
    // do not zoom in past MIN_SPAN, nor further out than the whole map
    if (w < MIN_SPAN || w > home.w * 3) return;
    // keep the point under the cursor where it is
    v.x = ax - (ax - v.x) * factor;
    v.y = ay - (ay - v.y) * factor;
    v.w = w; v.h = h;
    applyVB();
  }

  function svgPoint(svg, clientX, clientY) {
    var r = svg.getBoundingClientRect(), v = state.vb;
    // the SVG is letterboxed by preserveAspectRatio, so work out the real scale
    var scale = Math.max(v.w / r.width, v.h / r.height);
    var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    return { x: v.x + v.w / 2 + (clientX - cx) * scale,
             y: v.y + v.h / 2 + (clientY - cy) * scale };
  }

  function wireZoom() {
    var svg = els.map.querySelector('svg');
    if (!svg) return;
    var points = {}, dragging = false, moved = 0, last = null, pinch = null;

    svg.addEventListener('wheel', function (e) {
      e.preventDefault();
      var p = svgPoint(svg, e.clientX, e.clientY);
      zoomBy(e.deltaY > 0 ? 1.15 : 1 / 1.15, p.x, p.y);
    }, { passive: false });

    svg.addEventListener('pointerdown', function (e) {
      points[e.pointerId] = { x: e.clientX, y: e.clientY };
      var ids = Object.keys(points);
      if (ids.length === 1) {
        dragging = true; moved = 0;
        last = svgPoint(svg, e.clientX, e.clientY);
        svg.classList.add('is-dragging');
      } else if (ids.length === 2) {
        dragging = false;
        pinch = spread(ids);
      }
    });

    function spread(ids) {
      var a = points[ids[0]], b = points[ids[1]];
      return { d: Math.hypot(a.x - b.x, a.y - b.y),
               mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
    }

    svg.addEventListener('pointermove', function (e) {
      if (!points[e.pointerId]) return;
      points[e.pointerId] = { x: e.clientX, y: e.clientY };
      var ids = Object.keys(points);

      if (ids.length === 2 && pinch) {
        var now = spread(ids);
        if (now.d > 0 && pinch.d > 0) {
          var p = svgPoint(svg, now.mx, now.my);
          zoomBy(pinch.d / now.d, p.x, p.y);
        }
        pinch = now;
        return;
      }
      if (!dragging) return;
      var here = svgPoint(svg, e.clientX, e.clientY);
      state.vb.x -= here.x - last.x;
      state.vb.y -= here.y - last.y;
      moved += Math.abs(here.x - last.x) + Math.abs(here.y - last.y);
      applyVB();
      last = svgPoint(svg, e.clientX, e.clientY);
    });

    function release(e) {
      delete points[e.pointerId];
      if (Object.keys(points).length < 2) pinch = null;
      if (!Object.keys(points).length) {
        dragging = false;
        svg.classList.remove('is-dragging');
      }
    }
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);

    // One delegated click: a bubble opens its card, a drag does not. Binding
    // per circle and blocking in the capture phase fought with the drag.
    svg.addEventListener('click', function (e) {
      var wasDrag = moved > 6;
      moved = 0;
      if (wasDrag) return;
      var hit = e.target;
      if (hit && hit.classList && hit.classList.contains('bub')) {
        select(hit.getAttribute('data-i'), hit);
      }
    });

    els.map.querySelectorAll('[data-zoom]').forEach(function (b) {
      b.addEventListener('click', function () {
        var how = b.getAttribute('data-zoom'), v = state.vb;
        if (how === 'reset') {
          state.vb = { x: state.home.x, y: state.home.y, w: state.home.w, h: state.home.h };
          applyVB();
        } else {
          zoomBy(how === 'in' ? 1 / 1.3 : 1.3, v.x + v.w / 2, v.y + v.h / 2);
        }
      });
    });
  }

  function drawMap() {
    if (!els.map) return;
    if (!state.laid) state.laid = layout(state.all);
    var L = state.laid, hits = {}, n = 0;
    state.all.filter(matches).forEach(function (p) { hits[p.id] = 1; n++; });
    setCount(n);

    var circles = L.nodes.map(function (nd) {
      return '<circle class="bub' + (hits[nd.p.id] ? '' : ' is-dim') + '" tabindex="0" role="button"' +
             ' data-i="' + esc(nd.p.id) + '" aria-label="' + esc(nd.p.title) + '"' +
             ' cx="' + nd.x.toFixed(1) + '" cy="' + nd.y.toFixed(1) + '" r="' + nd.r.toFixed(1) +
             '" fill="' + yearColour(nd.p.year) + '"></circle>';
    }).join('');

    var labels = L.labels.filter(function (l) {
      return l.n >= 3 && NAME[l.key];
    }).map(function (l) {
      return '<text class="bublabel" x="' + l.x.toFixed(1) + '" y="' + l.y.toFixed(1) + '">' +
             esc(NAME[l.key]) + '</text>';
    }).join('');

    if (!state.home) {
      state.home = { x: L.box.x, y: L.box.y, w: L.box.w, h: L.box.h };
    }
    if (!state.vb) {
      state.vb = { x: L.box.x, y: L.box.y, w: L.box.w, h: L.box.h };
    }
    var v = state.vb;

    els.map.innerHTML =
      '<svg class="pubmap__svg" viewBox="' + [v.x, v.y, v.w, v.h].join(' ') +
      '" preserveAspectRatio="xMidYMid meet" role="img"' +
      ' aria-label="Publications grouped by research area. Drag to move, scroll to zoom.">' +
      circles + labels + '</svg>' + legend() +
      '<div class="pubmap__zoom">' +
        '<button type="button" data-zoom="in" aria-label="Zoom in">+</button>' +
        '<button type="button" data-zoom="out" aria-label="Zoom out">&minus;</button>' +
        '<button type="button" data-zoom="reset" aria-label="Fit the whole map">Fit</button>' +
      '</div>' +
      '<p class="pubmap__hint">Drag to move &middot; scroll or pinch to zoom &middot; click a circle for details</p>';

    els.map.querySelectorAll('.bub').forEach(function (b) {
      b.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          select(b.getAttribute('data-i'), b);
        }
      });
    });

    wireZoom();
  }

  /* ---------- the selected publication ---------- */
  var picked = null;

  function select(id, node) {
    var p = state.byId[id];
    if (!p || !els.panel) return;
    if (picked) picked.classList.remove('is-picked');
    if (node) { node.classList.add('is-picked'); picked = node; }

    var meta = [p.year, p.cited_by ? p.cited_by + ' citations' : '',
                (p.topics || []).length
                  ? 'Area: ' + (p.topics || []).map(function (t) { return NAME[t] || t; }).join(', ')
                  : ''].filter(Boolean).join(' \u00b7 ');

    var actions = '';
    if (p.url) actions += '<a class="btn btn--outline" href="' + esc(p.url) +
                          '" target="_blank" rel="noopener">Read paper</a>';
    if (p.oa && p.oa_url) actions += '<a class="btn btn--outline" href="' + esc(p.oa_url) +
                          '" target="_blank" rel="noopener">Open access copy</a>';
    actions += '<button class="btn btn--outline" type="button" data-copy="link">Copy link</button>' +
               '<button class="btn btn--outline" type="button" data-copy="cite">Copy citation</button>';

    els.panel.innerHTML =
      '<div class="pubpanel__head"><p class="eyebrow">Selected publication</p>' +
      '<button class="pubpanel__close" type="button" data-pub-close aria-label="Close">&times;</button></div>' +
      '<h3 class="pubpanel__title">' + esc(p.title) + '</h3>' +
      '<p class="pubpanel__meta">' + esc(meta) + '</p>' +
      '<p class="pubpanel__authors">' + esc(authorLine(p.authors, 14)) +
      (p.venue ? '. <em>' + esc(p.venue) + '</em>' : '') + '</p>' +
      '<div class="pubpanel__actions">' + actions + '</div>' +
      '<p class="pubpanel__note" data-copy-note hidden>Copied.</p>';
    els.panel.hidden = false;

    els.panel.querySelector('[data-pub-close]').addEventListener('click', closePanel);
    els.panel.querySelectorAll('[data-copy]').forEach(function (b) {
      b.addEventListener('click', function () {
        copy(b.getAttribute('data-copy') === 'cite' ? citation(p) : (p.url || p.doi || ''));
      });
    });
  }

  function copy(text) {
    var note = els.panel.querySelector('[data-copy-note]');
    function done() {
      if (!note) return;
      note.hidden = false;
      setTimeout(function () { note.hidden = true; }, 1800);
    }
    function fallback() {
      var t = document.createElement('textarea');
      t.value = text; t.setAttribute('readonly', '');
      t.style.position = 'absolute'; t.style.left = '-9999px';
      document.body.appendChild(t); t.select();
      try { document.execCommand('copy'); done(); } catch (e) { /* nothing to do */ }
      document.body.removeChild(t);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, fallback);
    } else {
      fallback();
    }
  }

  function closePanel() {
    if (els.panel) els.panel.hidden = true;
    if (picked) { picked.classList.remove('is-picked'); picked = null; }
  }

  /* ---------- views ---------- */
  function setView(v) {
    state.view = v;
    els.views.forEach(function (b) {
      var on = b.getAttribute('data-pub-view') === v;
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.classList.toggle('is-on', on);
    });
    if (els.listWrap) els.listWrap.hidden = v !== 'list';
    if (els.map) els.map.hidden = v !== 'map';
    if (els.sortWrap) els.sortWrap.hidden = v === 'map';
    document.body.classList.toggle('is-mapmode', v === 'map');
    closePanel();
    if (v === 'map') drawMap(); else drawList();
    if (history.replaceState) {
      history.replaceState(null, '', v === 'map' ? '?view=map' : location.pathname);
    }
  }

  function redraw() { if (state.view === 'map') drawMap(); else drawList(); }

  function fillFilters() {
    var topics = {}, types = {};
    state.all.forEach(function (p) {
      (p.topics || []).forEach(function (t) { topics[t] = (topics[t] || 0) + 1; });
      if (p.type) types[p.type] = (types[p.type] || 0) + 1;
    });
    TOPICS.forEach(function (t) {
      if (!topics[t[0]]) return;
      var o = document.createElement('option');
      o.value = t[0];
      o.textContent = t[1] + ' (' + topics[t[0]] + ')';
      els.topic.appendChild(o);
    });
    Object.keys(types).sort(function (a, b) { return types[b] - types[a]; }).forEach(function (t) {
      var o = document.createElement('option');
      o.value = t;
      o.textContent = t.replace(/-/g, ' ') + ' (' + types[t] + ')';
      els.type.appendChild(o);
    });
  }

  function wire() {
    var timer;
    els.search.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(function () {
        state.q = els.search.value.trim();
        state.limit = 25;
        redraw();
      }, 150);
    });
    [['topic', 'topic'], ['type', 'type'], ['sort', 'sort']].forEach(function (pair) {
      if (!els[pair[0]]) return;
      els[pair[0]].addEventListener('change', function () {
        state[pair[1]] = els[pair[0]].value;
        state.limit = 25;
        redraw();
      });
    });
    if (els.more) els.more.addEventListener('click', function () { state.limit += 25; drawList(); });
    els.views.forEach(function (b) {
      b.addEventListener('click', function () { setView(b.getAttribute('data-pub-view')); });
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closePanel(); });
  }

  fetch('assets/data/publications.json', { cache: 'no-cache' })
    .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function (data) {
      state.all = (data.items || []).filter(function (p) { return p.title; });
      if (!state.all.length) throw new Error('empty list');
      state.all.forEach(function (p) { state.byId[p.id] = p; });
      var years = state.all.map(function (p) { return p.year; }).filter(Boolean);
      state.lo = Math.min.apply(null, years);
      state.hi = Math.max.apply(null, years);

      els.status.hidden = true;
      root.classList.add('is-ready');
      if (els.meta && data.generated) {
        els.meta.textContent = 'Source: ' + (data.source || 'OpenAlex') +
                               ', updated ' + data.generated + '.';
      }
      fillFilters();
      wire();
      setView(/view=map/.test(location.search) ? 'map' : 'list');
    })
    .catch(function (err) {
      els.status.innerHTML = 'The full list could not be loaded. ' +
        '<a href="https://scholar.google.com/citations?user=ArzyBs8AAAAJ&amp;hl=en" ' +
        'target="_blank" rel="noopener">Browse publications on Google Scholar</a> instead.';
      console.warn('publications.json not available:', err);
    });
})();