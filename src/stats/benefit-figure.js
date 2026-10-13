/**
 * The body figure: one card for each place the keys spare (wrist, forearm,
 * shoulder), each with a picture of that part and what was spared.
 *
 *   TuiBenefitFigure.render(container, figures, { today, animate, countUp, images })
 *
 * `figures` and `today` come from TuiBenefitRules.computeBenefits(). Without
 * `today` the cards show no "today" line (the website's typical week).
 * `images` is the folder holding the pictures (body/ next to the stats page).
 * `strings` replaces the English words (see STRINGS below).
 *
 * Each picture is three layers rendered ahead of time by
 * testenv/render-body.js: the part, the same part warm where a mouse loads
 * it, and the extension's focus ring around that place. With `animate` the
 * warm part shows first, the ring arrives, and the warmth fades to a trace,
 * one card after another; then the ring lets go and it starts again, until
 * the reader presses Stop (remembered for the next visit) or Play again.
 * The numbers count up once, unless `countUp` is false. A reader who asked
 * for less motion gets the end state straight away and no button.
 *
 * Shared by the stats page and the website (docs/, copied there by
 * scripts/sync-site-figure.js), so it needs nothing but benefit-rules.js.
 */
(function (root) {
  'use strict';

  /**
   * Every word the figure shows. A page in another language passes its own
   * copy as `strings` (the website's Hebrew one lives in site/i18n/he.json);
   * {name} marks where a number goes.
   */
  const STRINGS = {
    play: 'Play',
    stop: 'Stop',
    playLabel: 'Play the animation',
    stopLabel: 'Stop the animation',
    today: '+{n} today',
    howSummary: 'Estimates, not measurements: how they are counted',
    howClicks: 'Each Enter the extension sends is a click your hand didn’t make.',
    howGrip: 'Gripping time: {click} s for each click, {arrow} s for each arrow (a short pointer move or a turn of the wheel).',
    howReach: 'A run of keys after a pause of more than {gap} s counts as one reach for the mouse, about {cm} cm each way.',
    units: { s: 's', min: 'min', h: 'h', m: 'm', km: 'km' },
    wrist: {
      title: 'Wrist & fingers',
      unit: 'clicks your hand didn’t make',
      why: 'Clicking and dragging with a mouse raises the pressure inside the carpal tunnel.'
    },
    forearm: {
      title: 'Forearm',
      unit: 'without gripping a mouse',
      why: 'Holding a mouse keeps the forearm muscles tense; key presses leave short pauses between them.'
    },
    shoulder: {
      title: 'Shoulder & neck',
      unit: 'reaches for the mouse skipped',
      extra: '≈ {distance} your arm didn’t travel',
      why: 'A mouse beside the keyboard pulls the shoulder out to the side; the hands stay close on the keys.'
    }
  };

  /** "+{n} today" with n = 12 → "+12 today". */
  function fill(template, values) {
    return template.replace(/\{(\w+)\}/g, (match, name) => values[name]);
  }

  const count = n => Math.round(n).toLocaleString();

  const ROWS = [
    {
      zone: 'wrist',
      ringAt: '46% 48%',   // where the ring sits in the picture, to grow from
      value: f => f.clicks,
      format: () => count,
      today: t => t.clicks > 0 ? count(t.clicks) : '',
      source: { label: 'Keir, Bach & Rempel, Ergonomics 1999', href: 'https://pubmed.ncbi.nlm.nih.gov/10582504/' }
    },
    {
      zone: 'forearm',
      ringAt: '57% 45%',   // where the ring sits in the picture, to grow from
      value: f => f.gripMinutes,
      format: s => n => root.TuiBenefitRules.formatMinutes(n, s.units),
      today: (t, s) => t.gripMinutes > 0 ? root.TuiBenefitRules.formatMinutes(t.gripMinutes, s.units) : ''
    },
    {
      zone: 'shoulder',
      ringAt: '60% 46%',   // where the ring sits in the picture, to grow from
      value: f => f.reaches,
      format: () => count,
      extra: (f, s) => fill(s.shoulder.extra, { distance: root.TuiBenefitRules.formatDistance(f.armMetres, s.units) }),
      today: t => t.reaches > 0 ? count(t.reaches) : '',
      source: { label: 'ANSI/HFES 100-2007', href: 'https://www.hfes.org/publications/technical-standards' }
    }
  ];

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  const STOPPED_KEY = 'tui-benefit-stopped';

  function wasStopped() {
    try { return root.localStorage.getItem(STOPPED_KEY) === '1'; } catch (e) { return false; }
  }

  function rememberStopped(stopped) {
    try {
      if (stopped) root.localStorage.setItem(STOPPED_KEY, '1');
      else root.localStorage.removeItem(STOPPED_KEY);
    } catch (e) { /* storage off: only this visit remembers */ }
  }

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const ICONS = {
    stop: 'M3 3h10v10H3z',
    play: 'M4 2.5v11l9.5-5.5z'
  };

  /** The Stop / Play button; it pauses the pictures where they are. */
  function playToggle(box, t) {
    const bar = el('div', 'bf-controls');
    const button = el('button', 'bf-toggle');
    button.type = 'button';
    const icon = document.createElementNS(SVG_NS, 'svg');
    icon.setAttribute('class', 'bf-toggle-icon');
    icon.setAttribute('viewBox', '0 0 16 16');
    icon.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(SVG_NS, 'path');
    icon.appendChild(path);
    const label = el('span');
    button.appendChild(icon);
    button.appendChild(label);

    function show(stopped) {
      box.classList.toggle('bf-paused', stopped);
      path.setAttribute('d', stopped ? ICONS.play : ICONS.stop);
      label.textContent = stopped ? t.play : t.stop;
      button.setAttribute('aria-label', stopped ? t.playLabel : t.stopLabel);
    }
    button.addEventListener('click', () => {
      const stopped = !box.classList.contains('bf-paused');
      show(stopped);
      rememberStopped(stopped);
    });
    show(wasStopped());
    bar.appendChild(button);
    return bar;
  }

  function reducedMotion() {
    return !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  /** Counts each number up from zero, easing out, in about `ms`. */
  function countUp(items, ms) {
    const start = performance.now();
    function frame(now) {
      const t = Math.min(1, (now - start) / ms);
      const eased = 1 - Math.pow(1 - t, 3);
      for (const item of items) item.node.textContent = item.format(item.target * eased);
      if (t < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  function howCounted(t) {
    const a = root.TuiBenefitRules.ASSUMPTIONS;
    const details = el('details', 'bf-how');
    details.appendChild(el('summary', null, t.howSummary));
    const list = el('ul');
    [
      t.howClicks,
      fill(t.howGrip, { click: a.gripSecondsPerClick, arrow: a.gripSecondsPerArrow }),
      fill(t.howReach, { gap: a.burstGapMs / 1000, cm: a.armMetresPerReach * 100 / 2 })
    ].forEach(line => list.appendChild(el('li', null, line)));
    details.appendChild(list);
    return details;
  }

  function picture(row, folder) {
    const stage = el('div', 'bf-stage');
    stage.setAttribute('aria-hidden', 'true');
    for (const layer of ['calm', 'heat', 'ring']) {
      const img = el('img', `bf-layer bf-${layer}`);
      img.src = `${folder}${row.zone}-${layer}.webp`;
      img.alt = '';
      img.decoding = 'async';
      if (layer === 'ring') img.style.transformOrigin = row.ringAt;
      stage.appendChild(img);
    }
    return stage;
  }

  /**
   * Draws the cards into `container`, replacing what was there. Returns the
   * root element.
   */
  function render(container, figures, options) {
    const opts = options || {};
    const f = figures;
    const empty = !(f.clicks || f.arrows || f.reaches);
    const folder = opts.images || 'body/';
    const t = opts.strings || STRINGS;

    const box = el('div', 'bf');
    if (empty && opts.emptyText) box.appendChild(el('p', 'bf-empty', opts.emptyText));

    const cards = el('ul', 'bf-cards');
    const counters = [];
    for (const row of ROWS) {
      const li = el('li', 'bf-card');
      li.dataset.zone = row.zone;
      li.tabIndex = 0;
      li.appendChild(picture(row, folder));

      const text = el('div', 'bf-text');
      const words = t[row.zone];
      const format = row.format(t);
      text.appendChild(el('div', 'bf-row-title', words.title));
      const value = el('div', 'bf-value');
      const num = el('span', 'bf-num', format(row.value(f)));
      counters.push({ node: num, target: row.value(f), format });
      value.appendChild(num);
      value.appendChild(document.createTextNode(' ' + words.unit));
      text.appendChild(value);

      if (row.extra && row.value(f) > 0) text.appendChild(el('div', 'bf-extra', row.extra(f, t)));
      const today = opts.today ? row.today(opts.today, t) : '';
      if (today) text.appendChild(el('div', 'bf-today', fill(t.today, { n: today })));

      const why = el('div', 'bf-why', words.why + ' ');
      if (row.source) {
        const a = el('a', null, row.source.label);
        a.href = row.source.href;
        a.target = '_blank';
        a.rel = 'noopener';
        why.appendChild(a);
      }
      text.appendChild(why);
      li.appendChild(text);
      cards.appendChild(li);
    }
    box.appendChild(cards);
    box.appendChild(howCounted(t));

    container.textContent = '';
    container.appendChild(box);

    if (opts.animate && !empty && !reducedMotion()) {
      box.classList.add('bf-play');
      box.insertBefore(playToggle(box, t), cards);
      if (opts.countUp !== false) countUp(counters, 1400);
    }
    return box;
  }

  root.TuiBenefitFigure = { render, fill, ROWS, STRINGS };
})(typeof globalThis !== 'undefined' ? globalThis : self);
