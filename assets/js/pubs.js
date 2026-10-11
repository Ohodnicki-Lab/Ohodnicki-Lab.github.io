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

  var state = { all: [], topic: 'all', type: 'all', sort: 'year', q: '', limit: 25 };

  var els = {
    status: root.querySelector('[data-pub-status]'),
    search: root.querySelector('[data-pub-search]'),
    topic: root.querySelector('[data-pub-topic]'),
    type: root.querySelector('[data-pub-type]'),
    sort: root.querySelector('[data-pub-sort]'),
    count: root.querySelector('[data-pub-count]'),
    list: root.querySelector('[data-pub-list]'),
    more: root.querySelector('[data-pub-more]'),
    meta: root.querySelector('[data-pub-meta]')
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

  function draw() {
    var hits = sorted(state.all.filter(matches));
    var shown = hits.slice(0, state.limit);

    els.list.innerHTML = shown.map(row).join('') ||
      '<li class="pubitem pubitem--empty">Nothing matches that. Try fewer words, ' +
      'or clear the filters.</li>';

    els.count.textContent = hits.length === state.all.length
      ? hits.length + ' publications'
      : hits.length + ' of ' + state.all.length + ' publications';

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
        draw();
      }, 150);
    });
    [['topic', 'topic'], ['type', 'type'], ['sort', 'sort']].forEach(function (pair) {
      els[pair[0]].addEventListener('change', function () {
        state[pair[1]] = els[pair[0]].value;
        state.limit = 25;
        draw();
      });
    });
    if (els.more) {
      els.more.addEventListener('click', function () { state.limit += 25; draw(); });
    }
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
