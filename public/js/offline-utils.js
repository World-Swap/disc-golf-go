// public/js/offline-utils.js
// Offline-first utilities for Disc Golf Go scorecard.
// No external dependencies — runs in the service worker and the main page.

const OFFLINE_DB = {
  // ── Pending rounds queue ──────────────────────────────────────────────────
  // Each entry: { id, roundId, payload, createdAt }

  getPendingRounds() {
    try {
      return JSON.parse(localStorage.getItem('dggo_pending_rounds') || '[]');
    } catch { return []; }
  },

  addPendingRound(roundId, payload) {
    const queue = this.getPendingRounds();
    // Avoid duplicates
    if (queue.some((r) => r.roundId === roundId)) return;
    queue.push({ id: Date.now(), roundId, payload, createdAt: new Date().toISOString() });
    localStorage.setItem('dggo_pending_rounds', JSON.stringify(queue));
  },

  removePendingRound(roundId) {
    const queue = this.getPendingRounds().filter((r) => r.roundId !== roundId);
    localStorage.setItem('dggo_pending_rounds', JSON.stringify(queue));
  },

  clearPendingRounds() {
    localStorage.setItem('dggo_pending_rounds', '[]');
  },

  getPendingCount() {
    return this.getPendingRounds().length;
  },

  // ── Course / layout local cache ───────────────────────────────────────────

  getCachedCourse(courseId) {
    try {
      const all = JSON.parse(localStorage.getItem('dggo_course_cache') || '{}');
      return all[courseId] || null;
    } catch { return null; }
  },

  setCachedCourse(courseId, data) {
    try {
      const all = JSON.parse(localStorage.getItem('dggo_course_cache') || '{}');
      all[courseId] = { ...data, _cachedAt: new Date().toISOString() };
      // Prune to last 50 courses
      const keys = Object.keys(all);
      if (keys.length > 50) {
        const oldest = keys.sort((a, b) => new Date(all[a]._cachedAt) - new Date(all[b]._cachedAt));
        oldest.slice(0, keys.length - 50).forEach((k) => delete all[k]);
      }
      localStorage.setItem('dggo_course_cache', JSON.stringify(all));
    } catch {}
  },

  // Cache course when player checks in
  cacheOnCheckin(courseId, courseName, courseCity, state, layoutId, layoutName, layoutHoles) {
    this.setCachedCourse(courseId, {
      name: courseName,
      city: courseCity,
      state,
      layouts: [{
        id: layoutId,
        name: layoutName,
        holes: layoutHoles, // array of { hole_number, par, distance_ft, letter_suffix }
      }],
    });
  },

  // ── Score entry (localStorage per-hole) ─────────────────────────────────

  getHoleScores(roundId) {
    try {
      return JSON.parse(localStorage.getItem(`dggo_holes_${roundId}`) || '[]');
    } catch { return []; }
  },

  saveHoleScore(roundId, holeNumber, score, par) {
    const holes = this.getHoleScores(roundId);
    const idx = holes.findIndex((h) => h.holeNumber === holeNumber);
    const entry = { holeNumber, score, par, savedAt: new Date().toISOString() };
    if (idx >= 0) holes[idx] = entry;
    else holes.push(entry);
    localStorage.setItem(`dggo_holes_${roundId}`, JSON.stringify(holes));
  },

  clearHoleScores(roundId) {
    localStorage.removeItem(`dggo_holes_${roundId}`);
  },

  // ── Online status ───────────────────────────────────────────────────────

  isOnline() {
    return navigator.onLine;
  },

  // ── Offline indicator UI helpers ───────────────────────────────────────

  showOfflineBanner(message) {
    let el = document.getElementById('offline-banner');
    if (!el) {
      el = document.createElement('div');
      el.id = 'offline-banner';
      el.style.cssText = `
        position: fixed; top: 0; left: 0; right: 0; z-index: 9999;
        background: #f59e0b; color: #fff; text-align: center;
        padding: 8px 16px; font-size: 0.85rem; font-weight: 600;
        display: none;
      `;
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.style.display = 'block';
    return el;
  },

  hideOfflineBanner() {
    const el = document.getElementById('offline-banner');
    if (el) el.style.display = 'none';
  },

  // ── Flush pending rounds ─────────────────────────────────────────────────
  // Returns { submitted, failed } counts

  async flushPendingRounds(token) {
    const queue = this.getPendingRounds();
    if (queue.length === 0) return { submitted: 0, failed: 0 };

    let submitted = 0;
    let failed = 0;
    for (const item of queue) {
      try {
        const res = await fetch(`/api/rounds/queue-process`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(item.payload),
        });
        if (res.ok) {
          this.removePendingRound(item.roundId);
          submitted++;
        } else {
          failed++;
        }
      } catch {
        failed++;
      }
    }
    return { submitted, failed };
  },

  // ── Watch online/offline events and flush queue ─────────────────────────

  startQueueWatcher(token, onProgress) {
    const tryFlush = () => {
      if (!this.isOnline()) return;
      const count = this.getPendingCount();
      if (count === 0) return;
      onProgress && onProgress(`Submitting ${count} saved round${count > 1 ? 's' : ''}…`);
      this.flushPendingRounds(token).then(({ submitted }) => {
        if (submitted > 0) {
          onProgress && onProgress(`Rounds submitted ✓`);
          setTimeout(() => this.hideOfflineBanner(), 3000);
        }
      });
    };

    window.addEventListener('online', tryFlush);
    // Also try on page load
    if (document.readyState !== 'complete') {
      window.addEventListener('load', tryFlush);
    } else {
      tryFlush();
    }
  },
};