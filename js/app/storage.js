/*
 * Vəziyyətin yadda saxlanması (localStorage). Əlçatan deyilsə (məs. məxfi
 * rejim), oyun yaddaşsız davam edir.
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    (root.Poker = root.Poker || {}).Storage = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const KEY = 'sixdi.holdem.v1';

  function browserBackend() {
    try {
      const ls = globalThis.localStorage;
      const probe = KEY + '.probe';
      ls.setItem(probe, '1');
      ls.removeItem(probe);
      return ls;
    } catch (e) {
      return null;
    }
  }

  function memoryBackend() {
    const map = new Map();
    return {
      getItem: function (k) { return map.has(k) ? map.get(k) : null; },
      setItem: function (k, v) { map.set(k, String(v)); },
      removeItem: function (k) { map.delete(k); }
    };
  }

  function createStorage(backend, key) {
    const store = backend === undefined ? browserBackend() : backend;
    const storageKey = key || KEY;
    return {
      available: !!store,
      load: function () {
        if (!store) return null;
        try {
          const raw = store.getItem(storageKey);
          return raw ? JSON.parse(raw) : null;
        } catch (e) {
          return null;
        }
      },
      save: function (data) {
        if (!store) return false;
        try {
          store.setItem(storageKey, JSON.stringify(data));
          return true;
        } catch (e) {
          return false;
        }
      },
      clear: function () {
        if (!store) return;
        try {
          store.removeItem(storageKey);
        } catch (e) {
          /* yox say */
        }
      }
    };
  }

  return { KEY, createStorage, memoryBackend };
});
