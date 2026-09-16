/**
 * Shared rules for the excluded-sites list.
 *
 * Loaded both as a content script (ahead of engine.js) and by the popup, so the
 * page and the settings UI always agree on what a domain is and what it matches.
 * Keep it dependency-free and side-effect-free.
 */
(function (root) {
  'use strict';

  // Accepts anything a user might paste - a full URL, a bare host, mixed case,
  // a port, a leading "www." - and reduces it to a bare lowercase domain.
  // Returns null when the input could not be a domain.
  function normalizeDomain(input) {
    if (typeof input !== 'string') return null;

    let value = input.trim().toLowerCase();
    if (!value) return null;

    // Full URL, or something with a scheme we can hand to the URL parser.
    if (value.includes('://')) {
      try {
        value = new URL(value).hostname;
      } catch (e) {
        return null;
      }
    } else {
      // Bare host, possibly with a path, query or fragment glued on.
      value = value.split('/')[0].split('?')[0].split('#')[0];
      // user:pass@host is rare here but cheap to tolerate.
      const at = value.lastIndexOf('@');
      if (at !== -1) value = value.slice(at + 1);
    }

    // Strip a port. IPv6 literals keep their brackets, so leave those alone.
    if (!value.startsWith('[')) {
      const colon = value.indexOf(':');
      if (colon !== -1) value = value.slice(0, colon);
    }

    // A leading www. is noise: excluding google.com already covers www.google.com.
    if (value.startsWith('www.')) value = value.slice(4);

    if (!isValidDomain(value)) return null;
    return value;
  }

  function isValidDomain(value) {
    if (!value) return false;
    if (value.length > 253) return false;
    if (value.startsWith('.') || value.endsWith('.')) return false;
    if (value.includes('..')) return false;
    if (!/^[a-z0-9.-]+$/.test(value)) return false;

    // Reject a bare label such as "settings" that is almost certainly a typo,
    // while still allowing the handful of real single-label hosts.
    if (!value.includes('.') && value !== 'localhost') return false;

    return value.split('.').every(function (label) {
      return label.length > 0 && label.length <= 63 &&
        !label.startsWith('-') && !label.endsWith('-');
    });
  }

  // google.com matches google.com and mail.google.com, but not notgoogle.com.
  // The dot is what keeps the suffix check honest.
  function matchesDomain(hostname, domain) {
    if (!hostname || !domain) return false;
    const host = String(hostname).trim().toLowerCase();
    return host === domain || host.endsWith('.' + domain);
  }

  function isExcluded(hostname, list) {
    if (!hostname || !Array.isArray(list) || list.length === 0) return false;
    return list.some(function (domain) {
      return matchesDomain(hostname, domain);
    });
  }

  root.TuiSiteRules = {
    normalizeDomain: normalizeDomain,
    isValidDomain: isValidDomain,
    matchesDomain: matchesDomain,
    isExcluded: isExcluded,
    STORAGE_KEY: 'tuiExcludedSites'
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
