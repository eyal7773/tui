/**
 * Tests for what Enter clicks.
 *
 *   npm test
 *
 * The rules decide where a keypress lands, so a wrong answer is either a dead
 * Enter or a click on something the user never aimed at. The trees here are
 * plain objects in the shape the rules read: tagName, attributes, children.
 */

const assert = require('node:assert/strict');
const { test } = require('node:test');

require('../src/click-rules.js');
const { resolveClickTarget, isActivating, isContainer, isPrimaryAction } = globalThis.TuiClickRules;

/** Minimal stand-in for an element: enough of the DOM for the rules to read. */
function el(tagName, attrs = {}, children = []) {
  const node = {
    tagName: tagName.toUpperCase(),
    attrs: attrs,
    children: children,
    text: attrs.text || '',
    getAttribute: (name) => (name in attrs ? attrs[name] : null),
    hasAttribute: (name) => name in attrs
  };

  delete attrs.text;
  node.id = attrs.id || '';
  node.className = attrs.class || '';

  Object.defineProperty(node, 'textContent', {
    get() {
      return node.text + node.children.map((child) => child.textContent).join('');
    }
  });

  return node;
}

/** The pull request row from the bug report, trimmed to its structure. */
function githubPullsRow() {
  const titleLink = el('a', {
    class: 'Title-module__anchor__dBbYy PullsListItem-module__titleLink__pGIKH',
    href: 'https://github.com/365Scores/DB/pull/1709',
    tabindex: '-1',
    text: 'FC-30193 insert-pid-and-gender-to-temp-referee table'
  });

  const row = el('li', {
    id: '_r_12_-list-view-node-_r_2e_',
    class: 'ListItem-module__listItem__wBJcm PullsListItem-module__listItem__CSciQ',
    tabindex: '0'
  }, [
    el('div', { class: 'Title-module__container__ZzhV_' }, [
      el('h3', { class: 'Title-module__heading__tHuYV' }, [titleLink])
    ]),
    el('div', { class: 'PullsListItem-module__metadata' }, [
      el('span', { class: 'prc-Text-Text-9mHv3', text: '#1709 opened 2 days ago' })
    ])
  ]);

  return { row, titleLink };
}

test('a row whose link holds the href is clicked on the link, not the row', () => {
  const { row, titleLink } = githubPullsRow();

  // This is the reported bug: Enter on the focused <li> did nothing, because
  // the row has no handler of its own and the link never saw the click.
  assert.equal(resolveClickTarget(row), titleLink);
});

test('the element navigation aimed at wins over any guess about the row', () => {
  const { row, titleLink } = githubPullsRow();
  const secondLink = el('a', { href: '/365Scores/DB/pull/1709/files', text: '4 files changed' });
  row.children.push(secondLink);

  // Focus bounced from secondLink up to the row; Enter belongs on secondLink.
  assert.equal(resolveClickTarget(row, secondLink), secondLink);

  // With nothing aimed at, the row's own first action is still the title.
  assert.equal(resolveClickTarget(row), titleLink);
});

test('an intended element outside the focused one is ignored', () => {
  const { row, titleLink } = githubPullsRow();
  const elsewhere = el('a', { href: '/somewhere', text: 'Unrelated' });

  // Stale aim from an earlier navigation must never redirect the click.
  assert.equal(resolveClickTarget(row, elsewhere), titleLink);
});

test('an element that acts on its own click is clicked as it is', () => {
  const link = el('a', { href: '/x', text: 'Open' });
  const button = el('button', { text: 'Save' }, [el('span', { class: 'icon' })]);
  const checkbox = el('input', { type: 'checkbox', tabindex: '0' });
  const roleButton = el('div', { role: 'button', text: 'Send' }, [el('div', { class: 'label' })]);

  assert.equal(resolveClickTarget(link), link);
  assert.equal(resolveClickTarget(button), button);
  assert.equal(resolveClickTarget(checkbox), checkbox);
  assert.equal(resolveClickTarget(roleButton), roleButton);
});

test('side controls in a row are skipped in favour of the row action', () => {
  const menu = el('button', { 'aria-haspopup': 'true', text: 'More' });
  const icon = el('button', { 'aria-label': 'Close' });      // icon only, no text
  const hidden = el('a', { href: '/skip', 'aria-hidden': 'true', text: 'Skip link' });
  const disabled = el('button', { disabled: '', text: 'Merge' });
  const real = el('a', { href: '/thread/9', text: 'Design review' });

  const row = el('li', { tabindex: '0' }, [menu, icon, hidden, disabled, real]);

  assert.equal(resolveClickTarget(row), real);
});

test('a row with no link or button falls back to its content wrapper', () => {
  // The chat-list shape: the click handler lives on an inner div.
  const spacer = el('div', {});
  const content = el('div', { class: 'chat-row-content' }, [
    el('span', { text: 'Some conversation' })
  ]);
  const row = el('div', { role: 'listitem', tabindex: '0' }, [spacer, content]);

  assert.equal(resolveClickTarget(row), content);
});

test('a row with nothing inside it is clicked itself', () => {
  const row = el('li', { tabindex: '0' }, [el('span', { text: 'Plain text row' })]);
  assert.equal(resolveClickTarget(row), row);
});

test('an explicit widget role beats the container tag', () => {
  // A <li role="button"> is the widget, so it is not searched as a row.
  const inner = el('a', { href: '/x', text: 'Settings' });
  const item = el('li', { role: 'button', tabindex: '0' }, [inner]);

  assert.equal(resolveClickTarget(item), item);
});

test('a tree item that wraps its label link is clicked on the link', () => {
  // A chat sidebar: the row takes focus, the router link inside has the
  // handler, and a click on the row never reached it.
  const link = el('a', { href: '/client/calendar', tabindex: '-1', text: 'Calendar' }, [
    el('span', { text: '2' })
  ]);
  const more = el('button', { 'aria-haspopup': 'menu', 'aria-label': 'More' });
  const item = el('div', { role: 'treeitem', tabindex: '-1' }, [el('div', { class: 'row' }, [link, more])]);
  assert.equal(resolveClickTarget(item), link);

  // The same for a menu item, an option and a tab built that way.
  for (const role of ['menuitem', 'option', 'tab']) {
    const inner = el('a', { href: '/x', text: 'Settings' });
    assert.equal(resolveClickTarget(el('li', { role: role }, [inner])), inner);
  }
});

test('a tree item with no link in it is clicked on its label, where a mouse would', () => {
  // A chat sidebar's direct-message row: the treeitem holds a div with the
  // handler, an avatar, the name and an unread badge, and no link at all. A
  // click on the row never reached the div; a click on the name passes it.
  const name = el('span', { text: 'Dana Levi' });
  const row = el('div', { class: 'sidebar__channel', draggable: 'true' }, [
    el('div', { class: 'sidebar__avatar' }, [el('img', { alt: '' })]),
    el('span', { class: 'sidebar__name' }, [name]),
    el('span', { class: 'sidebar__suffix' }, [el('span', { class: 'badge', text: '1' })])
  ]);
  const item = el('div', { role: 'treeitem', tabindex: '-1' }, [row]);
  assert.equal(resolveClickTarget(item), name);

  // A section heading whose toggle is a hidden role=button around the label.
  const label = el('span', { text: 'Starred' });
  const heading = el('div', { role: 'treeitem', tabindex: '-1', 'aria-expanded': 'true' }, [
    el('div', { class: 'section_heading' }, [
      el('div', { role: 'button', 'aria-hidden': 'true', tabindex: '-1' }, [label]),
      el('button', { 'aria-haspopup': 'menu', 'aria-label': 'Section options' })
    ])
  ]);
  assert.equal(resolveClickTarget(heading), label);

  // An item with no text at all is clicked itself.
  const icon = el('div', { role: 'tab' }, [el('div', { class: 'icon' })]);
  assert.equal(resolveClickTarget(icon), icon);
});

test('an item is clicked on its label, not on a link in it that is not the label', () => {
  // Most of the option's text is outside the link.
  const profile = el('a', { href: '/u/dana', text: 'profile' });
  const words = el('span', { text: 'Dana Levi, product designer, Tel Aviv office' });
  const option = el('div', { role: 'option' }, [words, profile]);
  assert.equal(resolveClickTarget(option), words);

  // A section row: its own label is plain text, the links are its children's.
  const child = el('a', { href: '/client/general', text: 'general' });
  const channels = el('span', { text: 'Channels' });
  const section = el('div', { role: 'treeitem', 'aria-expanded': 'true' }, [
    channels,
    el('div', { role: 'group' }, [el('div', { role: 'treeitem' }, [child])])
  ]);
  assert.equal(resolveClickTarget(section), channels);

  // A real link or button with the role keeps the click.
  const tabLink = el('a', { role: 'tab', href: '#a', text: 'Tab' }, [el('a', { href: '/x', text: 'Tab' })]);
  assert.equal(resolveClickTarget(tabLink), tabLink);
});

test('an explicit container role beats an activating tag', () => {
  const inner = el('a', { href: '/x', text: 'Open card' });
  const odd = el('button', { role: 'listitem' }, [inner]);

  assert.equal(resolveClickTarget(odd), inner);
});

test('an anchor without href is not treated as a link', () => {
  const anchor = el('a', { tabindex: '0', text: 'Script hook' });
  assert.equal(isActivating(anchor), false);
  assert.equal(isPrimaryAction(anchor), false);
});

test('a role list may carry fallbacks and the first role decides', () => {
  assert.equal(isActivating(el('div', { role: 'link button' })), true);
  assert.equal(isContainer(el('div', { role: 'row presentation' })), true);
});

test('missing or odd input is handled without throwing', () => {
  assert.equal(resolveClickTarget(null), null);
  assert.equal(resolveClickTarget(undefined), undefined);

  const bare = { tagName: 'LI' }; // no children, no getAttribute
  assert.equal(resolveClickTarget(bare), bare);
});

test('the descendant search stops rather than walking a huge subtree', () => {
  // A container that is really a whole feed must not cost a full tree walk.
  let deepest = null;
  let node = el('div', { class: 'level' });
  deepest = node;
  for (let i = 0; i < 500; i++) {
    const child = el('div', { class: 'level' });
    node.children.push(child);
    node = child;
  }
  node.children.push(el('a', { href: '/deep', text: 'Too far down' }));

  const row = el('li', { tabindex: '0' }, [deepest]);
  const target = resolveClickTarget(row);

  // The link is past the budget, so the search settles for the wrapper it found.
  assert.equal(target, deepest);
});

test('a row or a tile may want a double-click; links, buttons and controls never do', () => {
  const { mayWantDoubleClick } = globalThis.TuiClickRules;
  // Drive's file row: a click selects it, a double-click opens it.
  assert.equal(mayWantDoubleClick(el('tr', { role: 'row', 'aria-selected': 'false' })), true);
  assert.equal(mayWantDoubleClick(el('div', { tabindex: '0', class: 'tile' })), true);
  assert.equal(mayWantDoubleClick(el('a', { href: '/doc' })), false);
  assert.equal(mayWantDoubleClick(el('button')), false);
  assert.equal(mayWantDoubleClick(el('div', { role: 'button' })), false);
  assert.equal(mayWantDoubleClick(el('input', { type: 'checkbox' })), false);
  assert.equal(mayWantDoubleClick(null), false);
});

test('what a click brings up when it opens something counts as an overlay', () => {
  const { isOverlay, EFFECT_ATTRIBUTES } = globalThis.TuiClickRules;
  assert.equal(isOverlay(el('dialog')), true);
  assert.equal(isOverlay(el('div', { role: 'dialog' })), true);
  assert.equal(isOverlay(el('div', { role: 'menu' })), true);
  assert.equal(isOverlay(el('div', { popover: '' })), true);
  assert.equal(isOverlay(el('div', { 'aria-modal': 'true' })), true);
  assert.equal(isOverlay(el('div', { class: 'toolbar' })), false);
  // Being selected is not a sign that a click did what it was for.
  assert.equal(EFFECT_ATTRIBUTES.includes('aria-selected'), false);
});
