// app.js — shared frontend runtime: API client, auth guard, tab bar, helpers.
// Vanilla (no build). Attaches a single global: window.DGG.
(function () {
  'use strict';

  var TOKEN_KEY = 'dgg_token';
  var GUEST_KEY = 'dgg_guest_uuid';
  var REFRESHED_KEY = 'dgg_token_refreshed';
  var YEAR = 31536000;

  // Sessions are mirrored into a long-lived cookie as well as localStorage.
  // The native apps run the site in a WebView whose localStorage can be evicted
  // under storage pressure; whichever store survives restores the other, so a
  // signed-in player stays signed in.
  function cookieGet(name) {
    var m = document.cookie.match('(^|; )' + name + '=([^;]*)');
    return m ? decodeURIComponent(m[2]) : null;
  }
  function cookieSet(name, value, maxAge) {
    var secure = location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = name + '=' + encodeURIComponent(value) +
      '; Max-Age=' + maxAge + '; Path=/; SameSite=Lax' + secure;
  }
  function cookieDel(name) { cookieSet(name, '', 0); }

  function store(key, value) {
    try { localStorage.setItem(key, value); } catch (e) { /* private mode / full */ }
    cookieSet(key, value, YEAR);
  }
  function read(key) {
    var v = null;
    try { v = localStorage.getItem(key); } catch (e) { /* unavailable */ }
    if (v) return v;
    v = cookieGet(key);
    // localStorage was wiped but the cookie survived — put it back.
    if (v) { try { localStorage.setItem(key, v); } catch (e) {} }
    return v;
  }
  function drop(key) {
    try { localStorage.removeItem(key); } catch (e) {}
    cookieDel(key);
  }

  var API = {
    base: '/api',
    token: function () { return read(TOKEN_KEY); },
    guestUuid: function () { return read(GUEST_KEY); },
    setToken: function (t) { if (t) store(TOKEN_KEY, t); },
    setGuest: function (u) { if (u) store(GUEST_KEY, u); },
    clear: function () { drop(TOKEN_KEY); drop(REFRESHED_KEY); },
    request: async function (method, path, body) {
      var headers = { 'Content-Type': 'application/json' };
      var t = this.token();
      if (t) headers.Authorization = 'Bearer ' + t;
      var g = this.guestUuid();
      if (g) headers['X-Guest-Uuid'] = g;
      var res = await fetch(this.base + path, {
        method: method,
        headers: headers,
        body: body ? JSON.stringify(body) : undefined,
      });
      var data = null;
      try { data = await res.json(); } catch (e) { /* no body */ }
      if (!res.ok) {
        var err = new Error((data && data.error) || res.statusText || 'Request failed');
        err.status = res.status;
        err.data = data;
        // Only a dead token ends the session. A plain 401 from one endpoint
        // (a guest hitting a members-only route, say) used to sign the player
        // out of the whole app.
        if (res.status === 401 && data && data.code === 'token_invalid') { API.clear(); }
        throw err;
      }
      return data;
    },
    get: function (p) { return this.request('GET', p); },
    post: function (p, b) { return this.request('POST', p, b); },
    put: function (p, b) { return this.request('PUT', p, b); },
    del: function (p) { return this.request('DELETE', p); },
  };

  // Keep the session rolling: swap the token for a fresh one at most once a
  // day, so anyone who opens the app periodically never reaches its expiry.
  // Fire-and-forget — a failure here must never interrupt the player.
  function refreshSession() {
    if (!API.token()) return;
    var last = Number(read(REFRESHED_KEY) || 0);
    if (Date.now() - last < 86400000) return;
    API.post('/auth/refresh')
      .then(function (r) { if (r && r.token) { API.setToken(r.token); store(REFRESHED_KEY, String(Date.now())); } })
      .catch(function () { /* offline or route unavailable — try again next open */ });
  }

  // Redirect to /login unless a session (token or guest) exists.
  function requireAuth() {
    if (!API.token() && !API.guestUuid()) { location.replace('/login'); return false; }
    refreshSession();
    return true;
  }

  function logout() { API.clear(); drop(GUEST_KEY); location.replace('/login'); }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;' }[c];
    });
  }

  // Bottom nav, left to right. Ranks lives in Profile → Training instead of
  // taking a tab slot, which keeps this to five and widens each target.
  var TABS = [
    { key: 'home', href: '/home', label: 'Home', glyph: '🏠' },
    { key: 'profile', href: '/profile', label: 'Profile', glyph: '👤' },
    { key: 'training', href: '/training', label: 'Train', glyph: '🎯' },
    { key: 'play', href: '/checkin', label: 'Play', glyph: '🥏' },
    { key: 'vault', href: '/vault', label: 'Vault', glyph: '💎' },
  ];

  // Render the bottom tab bar into <nav id="tabbar">, marking `active`.
  function tabbar(active) {
    var el = document.getElementById('tabbar');
    if (!el) return;
    el.className = 'tabbar';
    el.innerHTML = TABS.map(function (t) {
      var cur = t.key === active ? ' aria-current="page"' : '';
      return '<a class="tab" href="' + t.href + '"' + cur + '>' +
        '<span class="tab__glyph" aria-hidden="true">' + t.glyph + '</span>' +
        '<span class="tab__label">' + t.label + '</span></a>';
    }).join('');
  }

  window.DGG = { API: API, requireAuth: requireAuth, logout: logout, esc: esc, tabbar: tabbar };
})();
