// One-off script: adds notification bell UI to all authenticated app pages
// Run: node scripts/patch-notif-bell.js
'use strict';

const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..', 'public');

const pages = [
  'battles.html',
  'rounds.html',
  'profile.html',
  'crews.html',
  'challenges.html',
  'vault.html',
  'story.html',
  'leaderboard.html',
  'scorecard.html',
  'progress.html',
];

const BELL_HTML = `<div class="notif-bell-wrap" id="notifWrap">
                <button class="notif-bell-btn" id="notifBell" title="Notifications" aria-label="Notifications">🔔</button>
                <span class="notif-badge" id="notifBadge" hidden></span>
                <div class="notif-panel" id="notifPanel">
                    <div class="notif-panel-header">
                        <span class="notif-panel-title">Notifications</span>
                        <button class="notif-panel-close" id="notifClose" aria-label="Close">&#x2715;</button>
                    </div>
                    <div class="notif-list" id="notifList"></div>
                </div>
            </div>`;

const NOTIF_JS = `
<script>
// Notification bell — fetches unread admin notifications, shows badge + dropdown
(function() {
    var token = localStorage.getItem('dggo_token');
    var bell = document.getElementById('notifBell');
    var badge = document.getElementById('notifBadge');
    var panel = document.getElementById('notifPanel');
    var list = document.getElementById('notifList');
    var closeBtn = document.getElementById('notifClose');
    if (!bell || !token) return;

    function fmtTime(iso) {
        var d = new Date(iso);
        var now = new Date();
        var diff = (now - d) / 1000;
        if (diff < 60) return 'just now';
        if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
        if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
        return Math.floor(diff / 86400) + 'd ago';
    }

    function updateBadge(count) {
        if (!count) { badge.hidden = true; return; }
        badge.hidden = false;
        badge.classList.toggle('dot', count > 9);
        badge.textContent = count > 9 ? '' : String(count);
    }

    var notifs = [];
    function loadNotifs() {
        fetch('/api/notifications/all', { headers: { Authorization: 'Bearer ' + token } })
            .then(function(r) { return r.ok ? r.json() : { notifications: [] }; })
            .then(function(data) {
                notifs = data.notifications || [];
                updateBadge(notifs.length);
            })
            .catch(function() {});
    }

    function renderPanel() {
        if (!notifs.length) {
            list.innerHTML = '<div class="notif-empty"><span>&#x1F514;</span>No new notifications</div>';
            return;
        }
        list.innerHTML = notifs.map(function(n) {
            return '<div class="notif-item" data-id="' + n.id + '">' +
                '<div class="notif-item-title">' + n.title + '</div>' +
                '<div class="notif-item-body">' + n.message + '</div>' +
                '<div class="notif-item-time">' + fmtTime(n.created_at) + '</div>' +
                '</div>';
        }).join('');
        list.querySelectorAll('.notif-item').forEach(function(el) {
            el.addEventListener('click', function() {
                var id = el.getAttribute('data-id');
                el.classList.add('read');
                fetch('/api/notifications/' + id + '/dismiss', {
                    method: 'POST',
                    headers: { Authorization: 'Bearer ' + token }
                }).catch(function() {});
                notifs = notifs.filter(function(n) { return String(n.id) !== id; });
                updateBadge(notifs.length);
                setTimeout(function() {
                    el.remove();
                    if (!list.querySelectorAll('.notif-item').length) renderPanel();
                }, 350);
            });
        });
    }

    bell.addEventListener('click', function(e) {
        e.stopPropagation();
        var isOpen = panel.classList.contains('open');
        panel.classList.toggle('open', !isOpen);
        if (!isOpen) renderPanel();
    });
    if (closeBtn) closeBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        panel.classList.remove('open');
    });
    document.addEventListener('click', function(e) {
        var wrap = document.getElementById('notifWrap');
        if (wrap && !wrap.contains(e.target)) panel.classList.remove('open');
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', loadNotifs);
    } else {
        loadNotifs();
    }
})();
<\/script>`;

// All the different theme-btn patterns found across pages, with what precedes </div>
// We insert BELL_HTML before the theme button, inside the header-actions div
const PATTERNS = [
  // battles.html — 8 spaces, moon emoji, 4 spaces closing div
  {
    from: '        <button class="theme-btn" id="themeToggle" title="Toggle dark mode">\uD83C\uDF19</button>\n    </div>',
    to:   BELL_HTML + '\n        <button class="theme-btn" id="themeToggle" title="Toggle dark mode">\uD83C\uDF19</button>\n    </div>',
  },
  // rounds.html / profile.html / crews.html / vault.html — 12 spaces, 🌓, 8 spaces closing div
  {
    from: '            <button class="theme-btn" id="themeToggle" title="Toggle dark mode">\uD83C\uDF13</button>\n        </div>',
    to:   BELL_HTML + '\n            <button class="theme-btn" id="themeToggle" title="Toggle dark mode">\uD83C\uDF13</button>\n        </div>',
  },
  // challenges.html / scorecard.html — 8 spaces, 🌓, 4 spaces closing div
  {
    from: '        <button class="theme-btn" id="themeToggle" title="Toggle dark mode">\uD83C\uDF13</button>\n    </div>',
    to:   BELL_HTML + '\n        <button class="theme-btn" id="themeToggle" title="Toggle dark mode">\uD83C\uDF13</button>\n    </div>',
  },
  // story.html / progress.html — aria-label="Toggle theme", 🌙
  {
    from: '        <button class="theme-btn" id="themeToggle" aria-label="Toggle theme">\uD83C\uDF19</button>\n    </div>',
    to:   BELL_HTML + '\n        <button class="theme-btn" id="themeToggle" aria-label="Toggle theme">\uD83C\uDF19</button>\n    </div>',
  },
  // leaderboard.html — btn-icon class, aria-label, 🌙
  {
    from: '        <button class="btn-icon" id="themeToggle" aria-label="Toggle dark mode">\uD83C\uDF19</button>\n    </div>',
    to:   BELL_HTML + '\n        <button class="btn-icon" id="themeToggle" aria-label="Toggle dark mode">\uD83C\uDF19</button>\n    </div>',
  },
];

let patched = 0;
pages.forEach(function(page) {
  const fp = path.join(BASE, page);
  let content = fs.readFileSync(fp, 'utf8');

  if (content.includes('notifBell') || content.includes('notif-bell-btn')) {
    console.log('SKIP (already patched):', page);
    return;
  }

  let replaced = false;
  for (let i = 0; i < PATTERNS.length; i++) {
    if (content.includes(PATTERNS[i].from)) {
      content = content.replace(PATTERNS[i].from, PATTERNS[i].to);
      replaced = true;
      console.log('Bell HTML inserted (pattern ' + i + '):', page);
      break;
    }
  }

  if (!replaced) {
    console.warn('WARN: no theme-btn pattern matched for', page);
    // Dump what we see around header-actions for debugging
    const idx = content.indexOf('header-actions');
    if (idx >= 0) console.log('  header-actions ctx:', JSON.stringify(content.substring(idx, idx + 200)));
    return;
  }

  // Insert notif JS before </body>
  content = content.replace('</body>', NOTIF_JS + '\n</body>');

  fs.writeFileSync(fp, content, 'utf8');
  patched++;
  console.log('Done:', page);
});

console.log('\nTotal pages patched:', patched, '/', pages.length);
