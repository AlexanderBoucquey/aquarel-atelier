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

  // Gallery filters by subject and technique, combinable. The choice lives in the address (?onderwerp=portret), so
  // links from the home page and the back button land on the same selection.
  var filters = document.querySelector('[data-filters]');
  var tiles = document.querySelector('[data-tiles]');
  if (filters && tiles) {
    var TILE_KEY = { onderwerp: 'subject', techniek: 'technique' };
    var chosen = {};
    var noMatch = document.querySelector('[data-no-match]');
    var params = new URLSearchParams(location.search);

    var press = function (group, button) {
      group.querySelectorAll('button').forEach(function (b) {
        b.setAttribute('aria-pressed', String(b === button));
      });
      chosen[group.dataset.group] = button.dataset.filter;
    };
    var apply = function () {
      var shown = 0;
      tiles.querySelectorAll('.tile').forEach(function (tile) {
        var match = Object.keys(chosen).every(function (name) {
          return chosen[name] === '' || tile.dataset[TILE_KEY[name]] === chosen[name];
        });
        tile.hidden = !match;
        if (match) shown++;
      });
      if (noMatch) noMatch.hidden = shown > 0;
    };

    filters.querySelectorAll('[data-group]').forEach(function (group) {
      var wanted = params.get(group.dataset.group) || '';
      var button = Array.prototype.find.call(group.querySelectorAll('button[data-filter]'), function (b) {
        return b.dataset.filter === wanted;
      });
      press(group, button || group.querySelector('button[data-filter=""]'));
    });
    filters.hidden = false;
    apply();

    filters.addEventListener('click', function (event) {
      var button = event.target.closest('button[data-filter]');
      if (!button) return;
      press(button.closest('[data-group]'), button);
      apply();
      var url = new URL(location.href);
      Object.keys(chosen).forEach(function (name) {
        if (chosen[name]) url.searchParams.set(name, chosen[name]);
        else url.searchParams.delete(name);
      });
      history.replaceState(null, '', url);
    });
  }
})();
