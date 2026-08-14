/* Theme toggle. Cycles auto -> light -> dark -> auto.
   The initial value is applied inline in <head> to avoid a flash. */
(function () {
  'use strict';

  var root = document.documentElement;
  var button = document.querySelector('.theme-toggle');
  if (!button) return;

  var ORDER = ['auto', 'light', 'dark'];

  function read() {
    try {
      var stored = localStorage.getItem('theme');
      return ORDER.indexOf(stored) > -1 ? stored : 'auto';
    } catch (e) {
      return 'auto';
    }
  }

  function apply(mode) {
    root.dataset.theme = mode;
    try {
      if (mode === 'auto') localStorage.removeItem('theme');
      else localStorage.setItem('theme', mode);
    } catch (e) {}
    button.setAttribute('title', 'Theme: ' + mode + ' (click to change)');
    button.setAttribute('aria-label', 'Theme: ' + mode + '. Click to change.');
  }

  apply(read());

  button.addEventListener('click', function () {
    var next = ORDER[(ORDER.indexOf(read()) + 1) % ORDER.length];
    apply(next);
  });
})();
