/* ============================================================
   OHODNICKI LAB — SITE SCRIPT
   One file, loaded by every page. Five small jobs:

   1. NAV        solidifies the menu bar once you scroll
   2. MENU       opens/closes the phone menu
   3. REVEAL     fades sections in as they scroll into view
   4. COUNTERS   counts the homepage numbers up
   5. TABS       switches Latest News / Featured Videos\n   5b. NEWSROOM  filters the feed by tag, and "Show all"
   6. SLIDESHOWS the landing-page hero and the "In the Lab" gallery

   Everything is optional: if a page does not contain a piece,
   that piece is skipped. You should not need to edit this file.
   ============================================================ */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- 1. NAV: solid background after scrolling ---------- */
  var nav = document.querySelector('.nav');
  if (nav) {
    var onScroll = function () {
      nav.classList.toggle('is-scrolled', window.scrollY > 40);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  /* ---------- 2. MENU: phone menu open state ---------- */
  var check = document.querySelector('.nav__check');
  if (check && nav) {
    check.addEventListener('change', function () {
      nav.classList.toggle('is-open', check.checked);
    });
    // Close the menu after tapping a link
    nav.querySelectorAll('.nav__list a').forEach(function (a) {
      a.addEventListener('click', function () {
        check.checked = false;
        nav.classList.remove('is-open');
      });
    });
  }

  /* ---------- 3. REVEAL: fade in on scroll ---------- */
  var revealables = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window) || reduced) {
    revealables.forEach(function (el) { el.classList.add('is-in'); });
  } else {
    var revealer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          revealer.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.08 });
    revealables.forEach(function (el) { revealer.observe(el); });
  }

  /* ---------- 4. COUNTERS: count up to data-count ---------- */
  function countUp(el) {
    var target = parseFloat(el.getAttribute('data-count'));
    var prefix = el.getAttribute('data-prefix') || '';
    var suffix = el.getAttribute('data-suffix') || '';
    if (isNaN(target)) return;
    if (reduced) { el.textContent = prefix + target.toLocaleString() + suffix; return; }

    var start = null, dur = 1400;
    function step(now) {
      if (start === null) start = now;
      var t = Math.min((now - start) / dur, 1);
      var eased = 1 - Math.pow(1 - t, 3);
      el.textContent = prefix + Math.round(target * eased).toLocaleString() + suffix;
      if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  var counters = document.querySelectorAll('[data-count]');
  if (counters.length) {
    if (!('IntersectionObserver' in window)) {
      counters.forEach(countUp);
    } else {
      var counterWatcher = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            countUp(entry.target);
            counterWatcher.unobserve(entry.target);
          }
        });
      }, { threshold: 0.5 });
      counters.forEach(function (el) { counterWatcher.observe(el); });
    }
  }

  /* ---------- 5. TABS + SHOW ALL ---------- */
  document.querySelectorAll('[data-tabs]').forEach(function (group) {
    var tabs = group.querySelectorAll('.tab');
    var panels = group.querySelectorAll('.panel');

    function select(i) {
      tabs.forEach(function (t, k) {
        t.setAttribute('aria-selected', k === i ? 'true' : 'false');
        t.setAttribute('tabindex', k === i ? '0' : '-1');
      });
      panels.forEach(function (p, k) { p.hidden = k !== i; });
    }

    tabs.forEach(function (tab, i) {
      tab.addEventListener('click', function () { select(i); });
      // Left/right arrow keys move between tabs
      tab.addEventListener('keydown', function (e) {
        var next = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : null;
        if (next === null) return;
        e.preventDefault();
        next = (next + tabs.length) % tabs.length;
        select(next);
        tabs[next].focus();
      });
    });
    select(0);
  });

  /* ---------- 5b. NEWSROOM: tag filter + show all ----------
     One list of cards, each carrying data-tags. The buttons narrow the list;
     eight items show until the reader asks for the rest. */
  document.querySelectorAll('[data-filter]').forEach(function (bar) {
    var list = document.getElementById(bar.getAttribute('data-filter'));
    if (!list) return;

    var cards = Array.prototype.slice.call(list.querySelectorAll('.card'));
    var chips = bar.querySelectorAll('.chip');
    var more = document.querySelector('[data-show-all="' + bar.getAttribute('data-filter') + '"]');
    var STEP = 8;
    var tag = 'all', expanded = false;

    function draw() {
      var shown = 0;
      cards.forEach(function (card) {
        var tags = (card.getAttribute('data-tags') || '').split(' ');
        var match = tag === 'all' || tags.indexOf(tag) > -1;
        card.classList.toggle('is-filtered', !match);
        if (match) {
          shown++;
          card.classList.toggle('is-hidden', !expanded && shown > STEP);
        }
      });
      if (more) {
        var hiddenCount = shown - STEP;
        more.parentNode.hidden = expanded || hiddenCount <= 0;
        more.textContent = 'Show all ' + shown;
      }
    }

    chips.forEach(function (chip) {
      chip.addEventListener('click', function () {
        chips.forEach(function (c) { c.classList.remove('is-on'); });
        chip.classList.add('is-on');
        tag = chip.getAttribute('data-tag');
        expanded = false;                 // a new filter starts collapsed again
        draw();
      });
    });
    if (more) more.addEventListener('click', function () { expanded = true; draw(); });

    draw();
  });

  /* ---------- 6. SLIDESHOWS ----------
     One function drives both the landing-page hero and the "In the Lab"
     gallery. Photographs cross-fade in place and captions swap to match;
     nothing is ever hidden with display:none, which is what caused the
     old gallery to flicker. Everything rotates on its own, and each has
     a pause button. */
  function carousel(opt) {
    var imgs = document.querySelectorAll(opt.img);
    if (!imgs.length) return;

    var caps = document.querySelectorAll(opt.cap);
    var dots = document.querySelectorAll(opt.dot);
    var num = opt.num ? document.querySelector(opt.num) : null;
    var btn = document.querySelector(opt.pause);
    var i = 0, timer = null;

    function show(n) {
      i = (n + imgs.length) % imgs.length;
      imgs.forEach(function (el, k) { el.classList.toggle('is-active', k === i); });
      caps.forEach(function (el, k) { el.classList.toggle('is-active', k === i); });
      dots.forEach(function (el, k) {
        el.classList.toggle('is-active', k === i);
        el.setAttribute('aria-current', k === i ? 'true' : 'false');
      });
      if (num) num.textContent = ('0' + (i + 1)).slice(-2);
    }

    function play() {
      if (timer) return;
      timer = setInterval(function () { show(i + 1); }, opt.hold);
      if (btn) { btn.setAttribute('aria-label', 'Pause the slideshow'); btn.textContent = '\u275A\u275A'; }
    }
    function pause() {
      clearInterval(timer);
      timer = null;
      if (btn) { btn.setAttribute('aria-label', 'Play the slideshow'); btn.textContent = '\u25B6'; }
    }

    dots.forEach(function (dot, k) {
      dot.addEventListener('click', function () { show(k); pause(); play(); });
    });
    if (btn) {
      btn.addEventListener('click', function () { if (timer) { pause(); } else { play(); } });
    }
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { pause(); } else { play(); }
    });

    show(0);
    play();
  }

  // HOW FAST EACH ONE RUNS: "hold" is how long a photograph stays on
  // screen, in milliseconds (1000 = one second). Lower is faster.
  carousel({
    img: '.hero__img', cap: '.hero__desc', dot: '.hero__dot',
    num: '[data-hero-num]', pause: '[data-hero-pause]', hold: 3500
  });

  carousel({
    img: '.gal__img', cap: '.gal__cap', dot: '.gal__dot',
    num: null, pause: '[data-gal-pause]', hold: 4500
  });

})();