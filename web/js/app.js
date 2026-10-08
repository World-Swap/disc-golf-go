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

  // Pages that must never be redirected away from: they are where a signed-out
  // player belongs, so bouncing them to /login would loop.
  var PUBLIC_PAGES = ['/', '/login', '/register', '/forgot-password', '/reset-password'];
  function onPublicPage() {
    return PUBLIC_PAGES.indexOf(location.pathname.replace(/\/$/, '') || '/') !== -1;
  }
  // A dead token leaves the player staring at an error they cannot act on.
  // Send them to the sign-in screen instead — once the token is cleared this
  // cannot bounce back, because the guard below no longer sees a session.
  function toLogin() { if (!onPublicPage()) location.replace('/login'); }

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
        if (res.status === 401 && data && data.code === 'token_invalid') { API.clear(); toLogin(); }
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

  // A player is signed in exactly when a token survives — guests are issued one
  // too. The landing and auth pages use this to send a returning player (one
  // who force-closed the app and reopened it) straight into the app, instead of
  // showing a "Log in" screen they don't need.
  function signedIn() { return !!API.token(); }

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
    { key: 'vault', href: '/vault', label: 'Vault', glyph: '🎬' },
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

  // The Players Lounge card said "Players Lounge" and nothing else, in every
  // place it appeared -- a label rather than a reason to press it. Any page
  // showing the card gives its sub the id `loungeSub` and calls this, which
  // names the most recent upload instead, so the card says what is waiting
  // and changes daily. It fails silently: the written fallback is already
  // true, so a network hiccup costs nothing.
  function loungeSub() {
    var el = document.getElementById('loungeSub');
    if (!el) return;
    API.get('/videos/newest?limit=1').then(function (d) {
      var v = (d.videos || [])[0];
      if (!v) return;
      var day = Math.floor((Date.now() - Date.parse(v.published_at)) / 86400000);
      var ago = day <= 0 ? 'today' : day === 1 ? 'yesterday' : day + ' days ago';
      // textContent, so the title needs no escaping.
      el.textContent = v.channel_name + ' \u00b7 ' + ago + ' \u00b7 ' + v.title;
    }).catch(function () {});
  }

  // ── Sharing ────────────────────────────────────────────────────────────
  // Share links replaced the referral system, which paid 200 gold for bringing
  // a friend -- gold that buys a 60-minute XP boost, in an app whose XP stopped
  // meaning much when it pivoted from the RPG to training. People share things
  // that are useful, not invite codes that pay in a currency with nothing to buy.
  //
  // ALWAYS a discgolfgo.com URL, never this app's own. The app is behind an auth
  // check and noindex; a friend who taps a /training link hits a login wall,
  // which is the opposite of sharing. The .com library is public, free and needs
  // no account, so it is the only honest thing to put in a text message.
  var PUBLIC_SITE = 'https://discgolfgo.com';

  /** The public page for a training category, optionally at one lesson. */
  function learnUrl(categorySlug, lessonSlug) {
    if (!categorySlug) return PUBLIC_SITE + '/learn';
    return PUBLIC_SITE + '/learn/' + categorySlug + (lessonSlug ? '#' + lessonSlug : '');
  }

  /**
   * Share a URL. Uses the OS share sheet where there is one, which on the
   * phones that are essentially the whole audience is what people expect.
   * Falls back to the clipboard, and then to selecting the text, because a
   * share button that silently does nothing is worse than no button.
   *
   * `btn` is restyled to confirm, since neither fallback shows any UI of its own.
   */
  async function share(opts) {
    var url = opts.url, btn = opts.btn;
    var done = function (label) {
      if (!btn) return;
      var original = btn.textContent;
      btn.textContent = label;
      setTimeout(function () { btn.textContent = original; }, 1800);
    };

    if (navigator.share) {
      try {
        await navigator.share({ title: opts.title || 'Disc Golf Go', text: opts.text || '', url: url });
        return 'shared';
      } catch (e) {
        // A cancelled share sheet throws AbortError. That is not a failure and
        // must not fall through to copying a link the person chose not to send.
        if (e && e.name === 'AbortError') return 'cancelled';
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      done('Link copied');
      return 'copied';
    } catch (e) { /* clipboard blocked (insecure context, or denied) */ }

    window.prompt('Copy this link:', url);
    return 'prompted';
  }

  // ── Notifications bell ────────────────────────────────────────────────
  //
  // The three scheduled jobs have been writing training_notifications rows,
  // and until now NOTHING in web/ read them back: the list and unread-count
  // endpoints had no caller, so Settings offered toggles for notifications
  // that could never be seen. This is that missing surface.
  //
  // It lives here rather than in 17 page templates because every topbar
  // carries different right-hand content (an XP pill, a logout button, a
  // period pill), so there is no single place to paste markup into. One copy,
  // appended to whatever .topbar the page has -- the same reasoning as
  // tabbar() and loungeSub().

  function timeAgo(iso) {
    var secs = Math.floor((Date.now() - Date.parse(iso)) / 1000);
    if (!isFinite(secs) || secs < 0) secs = 0;
    if (secs < 60) return 'just now';
    var mins = Math.floor(secs / 60);
    if (mins < 60) return mins + 'm ago';
    var hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + 'h ago';
    var days = Math.floor(hrs / 24);
    if (days < 7) return days + 'd ago';
    return Math.floor(days / 7) + 'w ago';
  }

  // Where a notification points. A row with no lesson (a streak reminder) is
  // not a link at all -- it must not pretend to lead somewhere.
  function notifHref(n) {
    if (!n.lesson_id || !n.category_slug) return '';
    return '/training?cat=' + encodeURIComponent(n.category_slug) + '&lesson=' + encodeURIComponent(n.lesson_id);
  }

  function bell() {
    var bar = document.querySelector('.topbar');
    // Signed-out visitors get no bell: unread-count answers 0 for them, so it
    // would be a control that can never do anything.
    if (!bar || document.getElementById('dggBell') || (!API.token() && !API.guestUuid())) return;

    bar.classList.add('topbar--bell');
    var btn = document.createElement('button');
    btn.id = 'dggBell';
    btn.className = 'bell';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Notifications');
    btn.setAttribute('aria-expanded', 'false');
    // Inline SVG rather than an emoji or a geometric character: it inherits
    // currentColor, so bell--unread turns it orange; it renders identically on
    // every platform; and it looks like a bell. The first pass used U+25C9,
    // which reads as a target or a record button.
    btn.innerHTML =
      '<svg class="bell__glyph" viewBox="0 0 24 24" aria-hidden="true" fill="none" ' +
        'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>' +
        '<path d="M13.7 21a2 2 0 0 1-3.4 0"/>' +
      '</svg>' +
      '<span class="bell__badge" id="dggBellBadge" hidden></span>';
    bar.appendChild(btn);

    var sheet = document.createElement('div');
    sheet.className = 'nsheet';
    sheet.id = 'dggSheet';
    sheet.hidden = true;
    sheet.innerHTML =
      '<div class="nsheet__panel" role="dialog" aria-label="Notifications">' +
        '<div class="nsheet__head">' +
          '<span class="nsheet__title">Notifications</span>' +
          '<button class="nsheet__act" id="dggReadAll" type="button" hidden>Mark all read</button>' +
        '</div>' +
        '<div class="nsheet__body" id="dggList"><p class="nsheet__empty">Loading…</p></div>' +
      '</div>';
    document.body.appendChild(sheet);

    var badge = document.getElementById('dggBellBadge');
    var list = document.getElementById('dggList');
    var readAll = document.getElementById('dggReadAll');

    function setCount(n) {
      n = Number(n) || 0;
      badge.hidden = n === 0;
      // A three-digit badge breaks the bell's circle, and the exact number
      // stops being useful long before that.
      badge.textContent = n > 99 ? '99+' : String(n);
      btn.classList.toggle('bell--unread', n > 0);
      readAll.hidden = n === 0;
    }

    function render(d) {
      var rows = d.notifications || [];
      setCount(d.unread_count);
      if (!rows.length) {
        list.innerHTML = '<p class="nsheet__empty">Nothing yet. Training tips and streak reminders land here.</p>';
        return;
      }
      list.innerHTML = rows.map(function (n) {
        var href = notifHref(n);
        var tag = href ? 'a' : 'div';
        var attrs = href ? ' href="' + esc(href) + '"' : '';
        return '<' + tag + ' class="nrow' + (n.is_read ? '' : ' nrow--unread') + '"' + attrs +
            ' data-id="' + esc(String(n.id)) + '">' +
          '<span class="nrow__dot" aria-hidden="true"></span>' +
          '<span class="nrow__body">' +
            '<span class="nrow__title">' + esc(n.title || '') + '</span>' +
            '<span class="nrow__msg">' + esc(n.message || '') + '</span>' +
            '<span class="nrow__time">' + esc(timeAgo(n.created_at)) + '</span>' +
          '</span>' +
        '</' + tag + '>';
      }).join('');
    }

    function load() {
      list.innerHTML = '<p class="nsheet__empty">Loading…</p>';
      API.get('/training/notifications?limit=20')
        .then(render)
        .catch(function () {
          list.innerHTML = '<p class="nsheet__empty">Could not load notifications.</p>';
        });
    }

    function open() {
      sheet.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
      load();
    }
    function close() {
      sheet.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
    }

    btn.addEventListener('click', function () { sheet.hidden ? open() : close(); });
    // Tapping the backdrop closes; tapping inside the panel must not.
    sheet.addEventListener('click', function (e) { if (e.target === sheet) close(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !sheet.hidden) close(); });

    readAll.addEventListener('click', function () {
      API.post('/training/notifications/read-all', {}).then(function () { load(); }).catch(function () {});
    });

    // Delegated, because the rows are re-rendered on every load.
    list.addEventListener('click', function (e) {
      var row = e.target.closest && e.target.closest('.nrow');
      if (!row) return;
      var id = row.getAttribute('data-id');
      if (!id || !row.classList.contains('nrow--unread')) return;
      // Mark read optimistically. A row that navigates away must not wait on
      // this request, and a failure here is not worth blocking the tap over.
      row.classList.remove('nrow--unread');
      setCount(Math.max(0, (parseInt(badge.textContent, 10) || 0) - 1));
      API.post('/training/notifications/' + encodeURIComponent(id) + '/read', {}).catch(function () {});
    });

    // The count is the only thing fetched on page load; the list waits until
    // the bell is actually opened.
    API.get('/training/notifications/unread-count')
      .then(function (d) { setCount(d && d.unread_count); })
      .catch(function () {});
  }

  // Auto-init: every app page that has a topbar gets the bell without having
  // to call anything, so a new page cannot ship without it by omission.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bell);
  } else {
    bell();
  }

  window.DGG = { API: API, requireAuth: requireAuth, signedIn: signedIn, logout: logout, esc: esc, tabbar: tabbar, loungeSub: loungeSub, share: share, learnUrl: learnUrl, bell: bell };
})();
