/**
 * The body figure: a person at a keyboard, the three places the keys spare
 * (wrist, forearm, shoulder) lit up, and beside it what was spared.
 *
 *   TuiBenefitFigure.render(container, figures, { today, animate })
 *
 * `figures` and `today` come from TuiBenefitRules.computeBenefits(). Without
 * `today` the rows show no "today" line (the website's typical week). With
 * `animate` the reach for a mouse fades away, the places light up one after
 * another and the numbers count up, once; a reader who asked for less motion
 * gets the end state straight away.
 *
 * Shared by the stats page and the website (docs/, copied there by
 * scripts/sync-site-figure.js), so it needs nothing but benefit-rules.js.
 */
(function (root) {
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';

  // Front view, drawn in strokes so it takes the page's colours. The mouse
  // and the arm reaching for it are the ghost: what does not happen.
  const FIGURE = `
    <svg class="bf-figure" viewBox="0 0 240 220" role="img"
         aria-label="A person at a keyboard. Wrist, forearm and shoulder are highlighted; a reach for the mouse fades away.">
      <g class="bf-ghost">
        <path d="M156 86 L196 140 L210 180" />
        <rect x="202" y="178" width="16" height="24" rx="8" />
      </g>
      <g class="bf-zones">
        <circle class="bf-zone-shoulder" cx="156" cy="86" r="14" />
        <line class="bf-zone-forearm" x1="168" y1="150" x2="146" y2="176" />
        <circle class="bf-zone-wrist" cx="140" cy="186" r="9" />
      </g>
      <g class="bf-body">
        <circle cx="120" cy="36" r="20" />
        <path d="M120 56 L120 68" />
        <path d="M92 168 L84 86 Q120 66 156 86 L148 168" />
        <path d="M84 86 L70 148 L100 186" />
        <path d="M156 86 L170 148 L140 186" />
        <rect x="84" y="186" width="72" height="11" rx="3" />
        <path d="M24 204 L216 204" />
      </g>
    </svg>`;

  const ROWS = [
    {
      zone: 'wrist',
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
      title: 'Forearm',
      value: f => f.gripMinutes,
      format: n => root.TuiBenefitRules.formatMinutes(n),
      unit: 'without gripping a mouse',
      today: t => t.gripMinutes > 0 ? `+${root.TuiBenefitRules.formatMinutes(t.gripMinutes)} today` : '',
      why: 'Holding a mouse keeps the forearm muscles tense; key presses leave short pauses between them.'
    },
    {
      zone: 'shoulder',
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

  /**
   * Draws the figure and its rows into `container`, replacing what was there.
   * Returns the root element.
   */
  function render(container, figures, options) {
    const opts = options || {};
    const f = figures;
    const empty = !(f.clicks || f.arrows || f.reaches);

    const box = el('div', 'bf');
    const art = el('div', 'bf-art');
    art.innerHTML = FIGURE;
    box.appendChild(art);

    const side = el('div', 'bf-side');
    if (empty && opts.emptyText) side.appendChild(el('p', 'bf-empty', opts.emptyText));

    const rows = el('ul', 'bf-rows');
    const counters = [];
    for (const row of ROWS) {
      const li = el('li', 'bf-row');
      li.dataset.zone = row.zone;
      li.tabIndex = 0;

      li.appendChild(el('div', 'bf-row-title', row.title));

      const value = el('div', 'bf-value');
      const num = el('span', 'bf-num', row.format(row.value(f)));
      counters.push({ node: num, target: row.value(f), format: row.format });
      value.appendChild(num);
      value.appendChild(document.createTextNode(' ' + row.unit));
      li.appendChild(value);

      if (row.extra && row.value(f) > 0) li.appendChild(el('div', 'bf-extra', row.extra(f)));
      const today = opts.today ? row.today(opts.today) : '';
      if (today) li.appendChild(el('div', 'bf-today', today));

      const why = el('div', 'bf-why', row.why + ' ');
      if (row.source) {
        const a = el('a', null, row.source.label);
        a.href = row.source.href;
        a.target = '_blank';
        a.rel = 'noopener';
        why.appendChild(a);
      }
      li.appendChild(why);

      // The row a reader is on lights its place on the body.
      const on = () => box.setAttribute('data-on', row.zone);
      const off = () => box.removeAttribute('data-on');
      li.addEventListener('mouseenter', on);
      li.addEventListener('mouseleave', off);
      li.addEventListener('focus', on);
      li.addEventListener('blur', off);

      rows.appendChild(li);
    }
    side.appendChild(rows);
    side.appendChild(howCounted());
    box.appendChild(side);

    container.textContent = '';
    container.appendChild(box);

    if (opts.animate && !empty && !reducedMotion()) {
      box.classList.add('bf-play');
      countUp(counters, 1100);
      // A finished animation still holds its last frame, which would beat
      // the highlight of the row a reader is on.
      setTimeout(() => box.classList.remove('bf-play'), 2000);
    }
    return box;
  }

  root.TuiBenefitFigure = { render, ROWS };
})(typeof globalThis !== 'undefined' ? globalThis : self);
