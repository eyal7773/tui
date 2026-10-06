/**
 * The body figure: one card for each place the keys spare (wrist, forearm,
 * shoulder), each with a picture of that part and what was spared.
 *
 *   TuiBenefitFigure.render(container, figures, { today, animate, images })
 *
 * `figures` and `today` come from TuiBenefitRules.computeBenefits(). Without
 * `today` the cards show no "today" line (the website's typical week).
 * `images` is the folder holding the pictures (body/ next to the stats page).
 *
 * Each picture is three layers rendered ahead of time by
 * testenv/render-body.js: the part, the same part warm where a mouse loads
 * it, and the extension's focus ring around that place. With `animate` the
 * warm part shows first, the ring arrives, and the warmth fades to a trace,
 * one card after another, while the numbers count up; a reader who asked for
 * less motion gets the end state straight away.
 *
 * Shared by the stats page and the website (docs/, copied there by
 * scripts/sync-site-figure.js), so it needs nothing but benefit-rules.js.
 */
(function (root) {
  'use strict';

  const ROWS = [
    {
      zone: 'wrist',
      ringAt: '46% 48%',   // where the ring sits in the picture, to grow from
      title: 'Wrist & fingers',
      value: f => f.clicks,
      format: n => Math.round(n).toLocaleString(),
      unit: 'clicks your hand didn’t make',
      today: t => t.clicks > 0 ? `+${t.clicks.toLocaleString()} today` : '',
      why: 'Clicking and dragging with a mouse raises the pressure inside the carpal tunnel.',
      source: { label: 'Keir, Bach & Rempel, Ergonomics 1999', href: 'https://pubmed.ncbi.nlm.nih.gov/10582504/' }
    },
    {
      zone: 'forearm',
      ringAt: '57% 45%',   // where the ring sits in the picture, to grow from
      title: 'Forearm',
      value: f => f.gripMinutes,
      format: n => root.TuiBenefitRules.formatMinutes(n),
      unit: 'without gripping a mouse',
      today: t => t.gripMinutes > 0 ? `+${root.TuiBenefitRules.formatMinutes(t.gripMinutes)} today` : '',
      why: 'Holding a mouse keeps the forearm muscles tense; key presses leave short pauses between them.'
    },
    {
      zone: 'shoulder',
      ringAt: '60% 46%',   // where the ring sits in the picture, to grow from
      title: 'Shoulder & neck',
      value: f => f.reaches,
      format: n => Math.round(n).toLocaleString(),
      unit: 'reaches for the mouse skipped',
      extra: f => `≈ ${root.TuiBenefitRules.formatDistance(f.armMetres)} your arm didn’t travel`,
      today: t => t.reaches > 0 ? `+${t.reaches.toLocaleString()} today` : '',
      why: 'A mouse beside the keyboard pulls the shoulder out to the side; the hands stay close on the keys.',
      source: { label: 'ANSI/HFES 100-2007', href: 'https://www.hfes.org/publications/technical-standards' }
    }
  ];

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
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

  function howCounted() {
    const a = root.TuiBenefitRules.ASSUMPTIONS;
    const details = el('details', 'bf-how');
    details.appendChild(el('summary', null, 'Estimates, not measurements: how they are counted'));
    const list = el('ul');
    [
      'Each Enter the extension sends is a click your hand didn’t make.',
      `Gripping time: ${a.gripSecondsPerClick} s for each click, ${a.gripSecondsPerArrow} s for each arrow (a short pointer move or a turn of the wheel).`,
      `A run of keys after a pause of more than ${a.burstGapMs / 1000} s counts as one reach for the mouse, about ${a.armMetresPerReach * 100 / 2} cm each way.`
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
      text.appendChild(el('div', 'bf-row-title', row.title));
      const value = el('div', 'bf-value');
      const num = el('span', 'bf-num', row.format(row.value(f)));
      counters.push({ node: num, target: row.value(f), format: row.format });
      value.appendChild(num);
      value.appendChild(document.createTextNode(' ' + row.unit));
      text.appendChild(value);

      if (row.extra && row.value(f) > 0) text.appendChild(el('div', 'bf-extra', row.extra(f)));
      const today = opts.today ? row.today(opts.today) : '';
      if (today) text.appendChild(el('div', 'bf-today', today));

      const why = el('div', 'bf-why', row.why + ' ');
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
    box.appendChild(howCounted());

    container.textContent = '';
    container.appendChild(box);

    if (opts.animate && !empty && !reducedMotion()) {
      box.classList.add('bf-play');
      countUp(counters, 1400);
      // A finished animation still holds its last frame, which would beat
      // the hover state of a card.
      setTimeout(() => box.classList.remove('bf-play'), 3200);
    }
    return box;
  }

  root.TuiBenefitFigure = { render, ROWS };
})(typeof globalThis !== 'undefined' ? globalThis : self);
