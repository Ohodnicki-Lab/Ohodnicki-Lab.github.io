/* ============================================================
   PUBLICATION EXPLORER

   Reads assets/data/publications.json, which the monthly GitHub
   Action writes from OpenAlex, and renders a searchable list.

   Nothing here talks to OpenAlex: the data is already on the site,
   so this works offline and costs nothing per visitor.

   You should not need to edit this file. To change what is shown,
   edit tools/fetch_publications.py and re-run the Action.
   ============================================================ */
(function () {
  'use strict';

  var root = document.getElementById('pub-explorer');
  if (!root) return;

  var TOPIC_NAMES = {
    'ferrites-nanocomposites': 'Ferrites & Nanocomposites',
    'amorphous-nanocrystalline': 'Amorphous & Nanocrystalline Alloys',
    'permanent-magnets': 'Permanent Magnets',
    'processing': 'Processing',
    'magnetic-characterization': 'Magnetic Characterization',
    'power-components': 'Transformers, Inductors & Motors',
    'magnetics-computation': 'Modelling (Magnetics)',
    'optical-thin-films': 'Optical Thin Films',
    'single-crystal-fibers': 'Single Crystal Fibers',
    'quantum-sensing': 'Quantum Sensing',
    'interrogators': 'Interrogators',
    'energy-asset-monitoring': 'Energy Asset Monitoring',
    'infrastructure-monitoring': 'Infrastructure Monitoring',
    'photonics-computation': 'AI & Data Analytics'
  };

  var state = { all: [], topic: 'all', type: 'all', sort: 'year', q: '', limit: 25,
                view: 'list', laid: null };

  var els = {
    status: root.querySelector('[data-pub-status]'),
    search: root.querySelector('[data-pub-search]'),
    topic: root.querySelector('[data-pub-topic]'),
    type: root.querySelector('[data-pub-type]'),
    sort: root.querySelector('[data-pub-sort]'),
    // these two sit in the label column, which is a sibling of #pub-explorer,
    // so they have to be looked up on the document rather than inside root
    count: document.querySelector('[data-pub-count]'),
    list: root.querySelector('[data-pub-list]'),
    more: root.querySelector('[data-pub-more]'),
    meta: document.querySelector('[data-pub-meta]'),
    views: root.querySelectorAll('[data-pub-view]'),
    listWrap: root.querySelector('[data-pub-listwrap]'),
    map: root.querySelector('[data-pub-map]'),
    tip: root.querySelector('[data-pub-tip]')
  };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Shorten a long author list the way a reference would
  function authorLine(authors) {
    if (!authors || !authors.length) return '';
    var names = authors.slice(0, 6).map(esc);
    if (authors.length > 6) names.push('and ' + (authors.length - 6) + ' others');
    return names.join(', ');
  }

  function matches(p) {
    if (state.topic !== 'all' && (p.topics || []).indexOf(state.topic) < 0) return false;
    if (state.type !== 'all' && p.type !== state.type) return false;
    if (state.q) {
      var hay = (p.title + ' ' + (p.authors || []).join(' ') + ' ' +
                 p.venue + ' ' + (p.year || '')).toLowerCase();
      // every word typed must appear somewhere
      var words = state.q.toLowerCase().split(/\s+/).filter(Boolean);
      for (var i = 0; i < words.length; i++) {
        if (hay.indexOf(words[i]) < 0) return false;
      }
    }
    return true;
  }

  function sorted(list) {
    var copy = list.slice();
    if (state.sort === 'cited') {
      copy.sort(function (a, b) { return (b.cited_by - a.cited_by) || (b.year - a.year); });
    } else if (state.sort === 'title') {
      copy.sort(function (a, b) { return a.title.localeCompare(b.title); });
    } else {
      copy.sort(function (a, b) { return (b.year - a.year) || (b.cited_by - a.cited_by); });
    }
    return copy;
  }

  function row(p) {
    var link = p.url || '';
    var title = link
      ? '<a href="' + esc(link) + '" target="_blank" rel="noopener">' + esc(p.title) + '</a>'
      : esc(p.title);
    var bits = [];
    if (p.venue) bits.push('<span class="pubitem__venue">' + esc(p.venue) + '</span>');
    if (p.year) bits.push('<span>' + p.year + '</span>');
    if (p.cited_by) bits.push('<span>' + p.cited_by + ' citation' + (p.cited_by === 1 ? '' : 's') + '</span>');
    if (p.oa && p.oa_url) {
      bits.push('<a href="' + esc(p.oa_url) + '" target="_blank" rel="noopener">Open access</a>');
    }
    var tags = (p.topics || []).map(function (t) {
      return '<a class="tag tag--topic" href="research/' + t + '.html">' +
             esc(TOPIC_NAMES[t] || t) + '</a>';
    }).join(' ');

    return '<li class="pubitem">' +
             '<p class="pubitem__title">' + title + '</p>' +
             '<p class="pubitem__authors">' + authorLine(p.authors) + '</p>' +
             '<p class="pubitem__meta">' + bits.join('<span aria-hidden="true"> · </span>') + '</p>' +
             (tags ? '<p class="pubitem__tags">' + tags + '</p>' : '') +
           '</li>';
  }


  /* ---------- the bubble map ----------
     One cluster per research topic. Colour runs from deep navy (oldest) to
     gold (newest); circle area grows with citations. Positions are computed
     here rather than stored, so the layout follows whatever data arrives. */

  var RAMP = ['#002766', '#0A4BC2', '#6FA0F0', '#FFD277', '#FFB81C'];

  function mix(a, b, t) {
    function n(h, i) { return parseInt(h.substr(1 + i * 2, 2), 16); }
    var r = Math.round(n(a, 0) + (n(b, 0) - n(a, 0)) * t),
        g = Math.round(n(a, 1) + (n(b, 1) - n(a, 1)) * t),
        bl = Math.round(n(a, 2) + (n(b, 2) - n(a, 2)) * t);
    return 'rgb(' + r + ',' + g + ',' + bl + ')';
  }

  function yearColour(year, lo, hi) {
    if (!year || hi === lo) return RAMP[1];
    var t = (year - lo) / (hi - lo);
    var seg = Math.min(Math.floor(t * (RAMP.length - 1)), RAMP.length - 2);
    return mix(RAMP[seg], RAMP[seg + 1], t * (RAMP.length - 1) - seg);
  }

  function radius(cited) {
    return 4 + Math.sqrt(cited || 0) * 1.25;     // area, not diameter
  }

  function layout(items) {
    var W = 1600, H = 1000, GOLD = Math.PI * (3 - Math.sqrt(5));

    // group by the topic that is rarest overall, so a paper lands in the
    // cluster it is most distinctive for
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

    var keys = Object.keys(groups).sort(function (a, b) {
      return groups[b].length - groups[a].length;
    });

    // cluster centres on a golden-angle spiral, biggest nearest the middle
    var nodes = [], labels = [];
    keys.forEach(function (key, i) {
      var r = 0.085 * Math.sqrt(i) * Math.min(W, H) * 1.5;
      var a = i * GOLD;
      var cx = W / 2 + Math.cos(a) * r * 1.5;
      var cy = H / 2 + Math.sin(a) * r;
      labels.push({ key: key, x: cx, y: cy, n: groups[key].length });

      groups[key].forEach(function (p, j) {
        var rr = 11 * Math.sqrt(j + 0.6);
        var aa = j * GOLD;
        nodes.push({ p: p, x: cx + Math.cos(aa) * rr, y: cy + Math.sin(aa) * rr,
                     r: radius(p.cited_by), key: key });
      });
    });

    // a few relaxation passes so circles stop sitting on top of each other
    for (var pass = 0; pass < 60; pass++) {
      for (var i = 0; i < nodes.length; i++) {
        for (var k = i + 1; k < nodes.length; k++) {
          var A = nodes[i], B = nodes[k];
          var dx = B.x - A.x, dy = B.y - A.y;
          var need = A.r + B.r + 1.5;
          var d2 = dx * dx + dy * dy;
          if (d2 > need * need || d2 === 0) continue;
          var d = Math.sqrt(d2), push = (need - d) / d * 0.5;
          A.x -= dx * push; A.y -= dy * push;
          B.x += dx * push; B.y += dy * push;
        }
      }
    }

    var xs = nodes.map(function (n) { return n.x; }),
        ys = nodes.map(function (n) { return n.y; });
    var pad = 40;
    var box = {
      x: Math.min.apply(null, xs) - pad, y: Math.min.apply(null, ys) - pad,
      w: Math.max.apply(null, xs) - Math.min.apply(null, xs) + pad * 2,
      h: Math.max.apply(null, ys) - Math.min.apply(null, ys) + pad * 2
    };
    return { nodes: nodes, labels: labels, box: box };
  }

  function drawMap() {
    if (!els.map) return;
    if (!state.laid) state.laid = layout(state.all);
    var L = state.laid;

    var years = state.all.map(function (p) { return p.year; })
                         .filter(Boolean);
    var lo = Math.min.apply(null, years), hi = Math.max.apply(null, years);

    var hits = {};
    state.all.filter(matches).forEach(function (p) { hits[p.id] = 1; });
    var hitCount = Object.keys(hits).length;

    var circles = L.nodes.map(function (n) {
      var on = hits[n.p.id];
      return '<a class="bub' + (on ? '' : ' is-dim') + '"' +
             (n.p.url ? ' href="' + esc(n.p.url) + '" target="_blank" rel="noopener"' : '') +
             ' data-i="' + esc(n.p.id) + '" tabindex="0"' +
             ' aria-label="' + esc(n.p.title) + '">' +
             '<circle cx="' + n.x.toFixed(1) + '" cy="' + n.y.toFixed(1) + '" r="' + n.r.toFixed(1) +
             '" fill="' + yearColour(n.p.year, lo, hi) + '"></circle></a>';
    }).join('');

    var text = L.labels.filter(function (l) { return l.n >= 4; }).map(function (l) {
      return '<text class="bublabel" x="' + l.x.toFixed(1) + '" y="' + l.y.toFixed(1) + '">' +
             esc(TOPIC_NAMES[l.key] || 'Other') + '</text>';
    }).join('');

    var stops = RAMP.map(function (c, i) {
      return '<stop offset="' + (i / (RAMP.length - 1) * 100) + '%" stop-color="' + c + '"></stop>';
    }).join('');

    els.map.innerHTML =
      '<div class="pubmap__legend">' +
        '<div class="pubmap__key"><span>Year</span>' +
          '<svg width="150" height="10" aria-hidden="true"><defs><linearGradient id="yr">' +
          stops + '</linearGradient></defs><rect width="150" height="10" rx="5" fill="url(#yr)"/></svg>' +
          '<span class="pubmap__ends">' + lo + '<i></i>' + hi + '</span>' +
        '</div>' +
        '<div class="pubmap__key"><span>Citations</span>' +
          '<svg width="110" height="34" aria-hidden="true">' +
          '<circle cx="10" cy="22" r="' + radius(0).toFixed(1) + '"></circle>' +
          '<circle cx="42" cy="22" r="' + radius(50).toFixed(1) + '"></circle>' +
          '<circle cx="86" cy="22" r="' + radius(200).toFixed(1) + '"></circle></svg>' +
          '<span class="pubmap__ends">0<i></i>200+</span>' +
        '</div>' +
      '</div>' +
      '<svg class="pubmap__svg" viewBox="' + [L.box.x, L.box.y, L.box.w, L.box.h].join(' ') +
      '" role="img" aria-label="Publications grouped by research area, ' + hitCount +
      ' of ' + state.all.length + ' shown">' + circles + text + '</svg>';

    wireTips();
  }

  function wireTips() {
    var by = {};
    state.all.forEach(function (p) { by[p.id] = p; });

    function show(e) {
      var p = by[this.getAttribute('data-i')];
      if (!p || !els.tip) return;
      var bits = [p.venue, p.year, p.cited_by ? p.cited_by + ' citations' : ''].filter(Boolean);
      els.tip.innerHTML = '<strong>' + esc(p.title) + '</strong>' +
                          '<span>' + esc(authorLine(p.authors).replace(/<[^>]*>/g, '')) + '</span>' +
                          '<span>' + esc(bits.join(' · ')) + '</span>';
      els.tip.hidden = false;
    }
    function hide() { if (els.tip) els.tip.hidden = true; }

    els.map.querySelectorAll('.bub').forEach(function (b) {
      b.addEventListener('mouseenter', show);
      b.addEventListener('focus', show);
      b.addEventListener('mouseleave', hide);
      b.addEventListener('blur', hide);
    });
  }

  function setView(v) {
    state.view = v;
    els.views.forEach(function (b) {
      var on = b.getAttribute('data-pub-view') === v;
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.classList.toggle('is-on', on);
    });
    if (els.listWrap) els.listWrap.hidden = v !== 'list';
    if (els.map) els.map.hidden = v !== 'map';
    if (v === 'map') drawMap(); else draw();
  }

  function draw() {
    var hits = sorted(state.all.filter(matches));
    var shown = hits.slice(0, state.limit);

    els.list.innerHTML = shown.map(row).join('') ||
      '<li class="pubitem pubitem--empty">Nothing matches that. Try fewer words, ' +
      'or clear the filters.</li>';

    if (els.count) {
      els.count.textContent = hits.length === state.all.length
        ? hits.length + ' publications'
        : hits.length + ' of ' + state.all.length + ' publications';
    }

    if (els.more) {
      var left = hits.length - shown.length;
      els.more.hidden = left <= 0;
      els.more.textContent = 'Show 25 more (' + left + ' remaining)';
    }
  }

  function fillFilters() {
    var topics = {}, types = {};
    state.all.forEach(function (p) {
      (p.topics || []).forEach(function (t) { topics[t] = (topics[t] || 0) + 1; });
      if (p.type) types[p.type] = (types[p.type] || 0) + 1;
    });

    Object.keys(topics).sort(function (a, b) { return topics[b] - topics[a]; })
      .forEach(function (t) {
        var o = document.createElement('option');
        o.value = t;
        o.textContent = (TOPIC_NAMES[t] || t) + ' (' + topics[t] + ')';
        els.topic.appendChild(o);
      });

    Object.keys(types).sort(function (a, b) { return types[b] - types[a]; })
      .forEach(function (t) {
        var o = document.createElement('option');
        o.value = t;
        o.textContent = t.replace(/-/g, ' ') + ' (' + types[t] + ')';
        els.type.appendChild(o);
      });
  }

  function wire() {
    var t;
    els.search.addEventListener('input', function () {
      clearTimeout(t);
      t = setTimeout(function () {
        state.q = els.search.value.trim();
        state.limit = 25;
        if (state.view === 'map') drawMap(); else draw();
      }, 150);
    });
    [['topic', 'topic'], ['type', 'type'], ['sort', 'sort']].forEach(function (pair) {
      els[pair[0]].addEventListener('change', function () {
        state[pair[1]] = els[pair[0]].value;
        state.limit = 25;
        if (state.view === 'map') drawMap(); else draw();
      });
    });
    if (els.more) {
      els.more.addEventListener('click', function () { state.limit += 25; draw(); });
    }
    els.views.forEach(function (b) {
      b.addEventListener('click', function () { setView(b.getAttribute('data-pub-view')); });
    });
  }

  fetch('assets/data/publications.json', { cache: 'no-cache' })
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(function (data) {
      state.all = (data.items || []).filter(function (p) { return p.title; });
      if (!state.all.length) throw new Error('empty list');
      root.classList.add('is-ready');
      els.status.hidden = true;
      if (els.meta && data.generated) {
        els.meta.textContent = 'Source: ' + (data.source || 'OpenAlex') +
          ', updated ' + data.generated + '.';
      }
      fillFilters();
      wire();
      draw();
    })
    .catch(function (err) {
      // No data file yet, or the fetch failed: leave the Scholar link visible
      els.status.innerHTML = 'The full list could not be loaded. ' +
        '<a href="https://scholar.google.com/citations?user=ArzyBs8AAAAJ&amp;hl=en" ' +
        'target="_blank" rel="noopener">Browse publications on Google Scholar</a> instead.';
      console.warn('publications.json not available:', err);
    });
})();