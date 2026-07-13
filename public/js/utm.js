(function () {
  'use strict';

  var UTM_DEFAULTS = Object.freeze({
    source: 'disc_golf_go',
    medium: 'app',
  });

  var OUTBOUND_HOSTS = [
    'apps.apple.com',
    'play.google.com',
    'www.tiktok.com',
    'tiktok.com',
    'www.instagram.com',
    'instagram.com',
    'twitter.com',
    'x.com',
    'www.facebook.com',
    'facebook.com',
    'youtube.com',
    'youtu.be',
    'discord.gg',
    'discord.com',
  ];

  var HOST_DEFAULT_CAMPAIGN = {
    'apps.apple.com': 'app_download',
    'play.google.com': 'app_download',
    'www.tiktok.com': 'social_follow',
    'tiktok.com': 'social_follow',
    'www.instagram.com': 'social_follow',
    'instagram.com': 'social_follow',
    'twitter.com': 'social_follow',
    'x.com': 'social_follow',
    'www.facebook.com': 'social_follow',
    'facebook.com': 'social_follow',
    'youtube.com': 'video_referral',
    'youtu.be': 'video_referral',
    'discord.gg': 'social_follow',
    'discord.com': 'social_follow',
  };

  function appendUtm(url, opts) {
    if (!url || typeof url !== 'string') return url;
    if (!opts || typeof opts !== 'object') return url;

    var source = opts.source || UTM_DEFAULTS.source;
    var medium = opts.medium || UTM_DEFAULTS.medium;
    var campaign = opts.campaign;

    if (!campaign) return url;

    var parsed = null;
    try {
      parsed = new URL(url);
    } catch (_e) {
      parsed = null;
    }

    var params = new URLSearchParams();
    params.set('utm_source', source);
    params.set('utm_medium', medium);
    params.set('utm_campaign', campaign);
    if (opts.content) params.set('utm_content', opts.content);
    if (opts.term) params.set('utm_term', opts.term);

    var utmString = params.toString();
    if (!utmString) return url;

    if (parsed) {
      var keys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        var v = params.get(k);
        if (v && !parsed.searchParams.has(k)) parsed.searchParams.set(k, v);
      }
      return parsed.toString();
    }

    var separator = url.indexOf('?') >= 0 ? '&' : '?';
    return url + separator + utmString;
  }

  function findAnchor(el) {
    while (el && el !== document) {
      if (el.tagName === 'A' && el.href) return el;
      el = el.parentNode;
    }
    return null;
  }

  function bindOutboundTracking(rootEl) {
    rootEl = rootEl || document;
    if (!rootEl || !rootEl.addEventListener) return;

    rootEl.addEventListener('click', function (event) {
      var a = findAnchor(event.target);
      if (!a) return;

      var href = a.getAttribute('href') || a.href || '';
      if (!href) return;
      if (href.charAt(0) === '#') return;
      if (href.indexOf('/') === 0) return;
      if (href.indexOf('mailto:') === 0) return;
      if (href.indexOf('tel:') === 0) return;

      var parsed;
      try {
        parsed = new URL(a.href, window.location.href);
      } catch (_e) {
        return;
      }

      var host = parsed.hostname;
      if (!host) return;

      if (host === window.location.hostname) return;

      var inOutboundList = OUTBOUND_HOSTS.indexOf(host) >= 0;
      if (!inOutboundList && a.target !== '_blank') return;

      if (a.dataset && a.dataset.utmOriginal) {
        a.href = a.dataset.utmOriginal;
        delete a.dataset.utmOriginal;
      }

      var originalHref = a.href;

      var ds = a.dataset || {};
      var campaign = ds.utmCampaign || HOST_DEFAULT_CAMPAIGN[host] || 'referral';
      var opts = {
        source: ds.utmSource || undefined,
        medium: ds.utmMedium || undefined,
        campaign: campaign,
        content: ds.utmContent || undefined,
        term: ds.utmTerm || undefined,
      };

      var tagged = appendUtm(originalHref, opts);
      a.href = tagged;
      if (a.dataset) a.dataset.utmOriginal = originalHref;

      // Note: navigation continues with the rewritten URL because we mutated a.href
      // (anchors read href at navigation time, not click-handler time).
    }, { capture: true });
  }

  window.DGGO_UTM = {
    appendUtm: appendUtm,
    bindOutboundTracking: bindOutboundTracking,
    OUTBOUND_HOSTS: OUTBOUND_HOSTS,
  };
})();
