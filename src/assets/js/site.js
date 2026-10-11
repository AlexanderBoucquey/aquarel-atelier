// Progressive enhancements only; the site works without JavaScript.
(function () {
  var today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Brussels', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

  // Announcements disappear after their end date, even when the site was not rebuilt.
  document.querySelectorAll('[data-until]').forEach(function (el) {
    if (el.dataset.until < today) el.remove();
  });

  // The strip can be closed; the browser remembers that per event.
  var strip = document.querySelector('[data-event-strip]');
  if (strip) {
    var button = strip.querySelector('[data-dismiss]');
    button.hidden = false;
    button.addEventListener('click', function () {
      strip.remove();
      try {
        localStorage.setItem('event-dismissed-' + strip.dataset.key, '1');
      } catch (e) {}
    });
  }

  // Gallery filter by technique.
  var filters = document.querySelector('[data-filters]');
  var tiles = document.querySelector('[data-tiles]');
  if (filters && tiles) {
    filters.hidden = false;
    filters.addEventListener('click', function (event) {
      var chosen = event.target.closest('button[data-filter]');
      if (!chosen) return;
      filters.querySelectorAll('button').forEach(function (b) {
        b.setAttribute('aria-pressed', String(b === chosen));
      });
      tiles.querySelectorAll('.tile').forEach(function (tile) {
        tile.hidden = chosen.dataset.filter !== '' && tile.dataset.technique !== chosen.dataset.filter;
      });
    });
  }
})();
