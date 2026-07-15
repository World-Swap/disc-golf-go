// app.js — shared frontend runtime: API client, auth guard, tab bar, helpers.
// Vanilla (no build). Attaches a single global: window.DGG.
(function () {
  'use strict';

  var TOKEN_KEY = 'dgg_token';
  var GUEST_KEY = 'dgg_guest_uuid';

  var API = {
    base: '/api',
    token: function () { return localStorage.getItem(TOKEN_KEY); },
    guestUuid: function () { return localStorage.getItem(GUEST_KEY); },
    setToken: function (t) { if (t) localStorage.setItem(TOKEN_KEY, t); },
    setGuest: function (u) { if (u) localStorage.setItem(GUEST_KEY, u); },
    clear: function () { localStorage.removeItem(TOKEN_KEY); },
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
        if (res.status === 401) { API.clear(); }
        throw err;
      }
      return data;
    },
    get: function (p) { return this.request('GET', p); },
    post: function (p, b) { return this.request('POST', p, b); },
    put: function (p, b) { return this.request('PUT', p, b); },
    del: function (p) { return this.request('DELETE', p); },
  };

  // Redirect to /login unless a session (token or guest) exists.
  function requireAuth() {
    if (!API.token() && !API.guestUuid()) { location.replace('/login'); return false; }
    return true;
  }

  function logout() { API.clear(); localStorage.removeItem(GUEST_KEY); location.replace('/login'); }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;' }[c];
    });
  }

  var TABS = [
    { key: 'home', href: '/home', label: 'Home', glyph: '◆' },
    { key: 'training', href: '/training', label: 'Train', glyph: '▤' },
    { key: 'play', href: '/checkin', label: 'Play', glyph: '◎' },
    { key: 'ranks', href: '/ranks', label: 'Ranks', glyph: '▲' },
    { key: 'vault', href: '/vault', label: 'Vault', glyph: '◈' },
    { key: 'profile', href: '/profile', label: 'You', glyph: '●' },
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
