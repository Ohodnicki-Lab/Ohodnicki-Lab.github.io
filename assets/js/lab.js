/* ============================================================
   OHODNICKI LAB — SITE SCRIPT
   One file, loaded by every page. Five small jobs:

   1. NAV        solidifies the menu bar once you scroll
   2. MENU       opens/closes the phone menu
   3. REVEAL     fades sections in as they scroll into view
   4. COUNTERS   counts the homepage numbers up
   5. TABS       switches News / Videos / Press, and "Show all"
   6. SLIDESHOW  the group photos

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

  // "Show all" buttons reveal the rest of a long list
  document.querySelectorAll('[data-show-all]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var list = document.getElementById(btn.getAttribute('data-show-all'));
      if (!list) return;
      list.querySelectorAll('.is-hidden').forEach(function (el) { el.classList.remove('is-hidden'); });
      btn.parentNode.removeChild(btn);
    });
  });

  /* ---------- 6. SLIDESHOW ---------- */
  var slides = document.querySelectorAll('.slide');
  if (slides.length) {
    var dots = document.querySelectorAll('.dot');
    var i = 0;

    function show(n) {
      i = (n + slides.length) % slides.length;
      slides.forEach(function (s, k) { s.classList.toggle('is-active', k === i); });
      dots.forEach(function (d, k) {
        d.classList.toggle('is-active', k === i);
        d.setAttribute('aria-current', k === i ? 'true' : 'false');
      });
    }

    var prev = document.querySelector('.slider__prev');
    var next = document.querySelector('.slider__next');
    if (prev) prev.addEventListener('click', function () { show(i - 1); });
    if (next) next.addEventListener('click', function () { show(i + 1); });
    dots.forEach(function (d, k) { d.addEventListener('click', function () { show(k); }); });
    show(0);
  }
})();