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

  // Someone at ease at their desk, drawn in the page's own colours. The
  // twist is the extension's green focus ring: it steps from the wrist to the
  // forearm to the shoulder the way it steps through a page, and it is what
  // marks a place on the body. The mouse beside the keyboard has nothing to
  // do and has fallen asleep; the arm that would have reached for it is the
  // dashed ghost that fades away.
  const FIGURE = `
    <svg class="bf-figure" viewBox="0 0 260 232" role="img"
         aria-label="A person at a keyboard, smiling with eyes closed. A green focus ring marks the wrist, the forearm and the shoulder; the mouse beside the keyboard is asleep.">
      <defs>
        <filter id="bf-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      <g class="bf-desk">
        <rect class="bf-faint" x="8" y="198" width="244" height="30" rx="6" />
        <path class="bf-line" d="M8 198 L252 198" />
      </g>

      <g class="bf-mug">
        <path class="bf-steam" d="M40 160 C35 152 45 148 40 140" />
        <path class="bf-steam bf-steam-2" d="M50 162 C45 154 55 150 50 142" />
        <path class="bf-skin" d="M32 168 L58 168 L56 196 Q56 198 54 198 L36 198 Q34 198 34 196 Z" />
        <path class="bf-line" d="M58 174 Q68 174 66 184 Q64 190 57 189" />
      </g>

      <g class="bf-ghost">
        <path d="M156 104 C178 122 196 150 204 178" />
      </g>

      <g class="bf-sleeper">
        <path class="bf-line" d="M224 192 C234 192 238 196 248 196" />
        <path class="bf-skin" d="M190 197 C189 186 197 180 207 180 C217 180 225 186 224 197 Z" />
        <path class="bf-line" d="M207 180 L207 188" />
        <path class="bf-line" d="M196 192 Q199 194 202 192" />
        <text class="bf-z bf-z1" x="222" y="160">z</text>
        <text class="bf-z bf-z2" x="232" y="146">z</text>
        <text class="bf-z bf-z3" x="242" y="128">Z</text>
      </g>

      <g class="bf-person">
        <path class="bf-sweater" d="M78 198 C78 150 80 116 96 104 Q120 94 144 104 C160 116 162 150 162 198 Z" />
        <path class="bf-skin" d="M112 82 L112 98 Q120 103 128 98 L128 82 Z" />
        <circle class="bf-skin" cx="120" cy="62" r="25" />
        <path class="bf-hair" d="M95 60 C93 44 104 35 118 35 C134 34 147 43 145 58 C140 52 134 49 127 50 C120 44 108 46 101 52 C98 54 96 57 95 60 Z" />
        <path class="bf-line" d="M117 36 C114 29 120 25 125 29" />
        <path class="bf-line" d="M107 66 Q111 70 115 66" />
        <path class="bf-line" d="M125 66 Q129 70 133 66" />
        <path class="bf-line" d="M114 76 Q120 81 126 76" />
        <circle class="bf-blush" cx="104" cy="73" r="4" />
        <circle class="bf-blush" cx="136" cy="73" r="4" />
        <path class="bf-arm" d="M96 108 C84 126 80 146 84 156 C88 168 94 178 100 186" />
        <path class="bf-arm" d="M144 108 C156 126 160 146 156 156 C152 168 146 178 140 186" />
        <rect class="bf-skin" x="76" y="186" width="88" height="12" rx="3" />
        <path class="bf-keys" d="M84 192 L156 192" />
        <circle class="bf-skin" cx="100" cy="187" r="6" />
        <circle class="bf-skin" cx="140" cy="187" r="6" />
      </g>

      <g class="bf-zones">
        <rect class="bf-ring bf-zone-wrist" x="128" y="175" width="25" height="24" rx="7" />
        <rect class="bf-ring bf-zone-forearm" x="141" y="128" width="27" height="46" rx="10" />
        <rect class="bf-ring bf-zone-shoulder" x="130" y="94" width="32" height="30" rx="9" />
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
