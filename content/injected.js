// injected.js — Runs in MAIN world (declared with "world": "MAIN" in manifest)
// Receives sessionId from content.js via postMessage, then proxies localStorage

window.addEventListener('message', function onInit(e) {
  if (e.data?.type !== 'ML_INIT' || !e.data.sessionId) return;
  window.removeEventListener('message', onInit);

  const PREFIX = '__ml_' + e.data.sessionId + '_';
  const _orig = window.localStorage;

  function wrapKey(k) { return PREFIX + k; }
  function unwrapKey(k) { return k.startsWith(PREFIX) ? k.slice(PREFIX.length) : null; }

  function getAllOurKeys() {
    const keys = [];
    for (let i = 0; i < _orig.length; i++) {
      const k = _orig.key(i);
      if (k && k.startsWith(PREFIX)) keys.push(k);
    }
    return keys;
  }

  const proxy = {
    getItem(key) {
      return _orig.getItem(wrapKey(key));
    },
    setItem(key, val) {
      return _orig.setItem(wrapKey(key), val);
    },
    removeItem(key) {
      return _orig.removeItem(wrapKey(key));
    },
    clear() {
      getAllOurKeys().forEach(k => _orig.removeItem(k));
    },
    key(i) {
      const ours = getAllOurKeys().map(k => unwrapKey(k));
      return ours[i] ?? null;
    },
    get length() {
      return getAllOurKeys().length;
    },
  };

  try {
    Object.defineProperty(window, 'localStorage', {
      get() { return proxy; },
      set() {},
      configurable: true,
    });
  } catch {}
});
