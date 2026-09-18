/**
 * Tests for which tabindexed elements are worth stopping on.
 *
 *   npm test
 *
 * The trees are plain objects in the shape the rules read: tagName,
 * attributes, parentElement and children.
 */

const assert = require('node:assert/strict');
const { test } = require('node:test');

require('../src/target-rules.js');
const {
  isCustomElement, isGenericTag, isGridRow, hasInteractiveRole, focusOwner, ownedItemTarget
} = globalThis.TuiTargetRules;

/** Minimal stand-in for an element; wires parentElement on its children. */
function el(tagName, attrs = {}, children = []) {
  const node = {
    tagName: tagName.toUpperCase(),
    children: children,
    parentElement: null,
    getAttribute: (name) => (name in attrs ? attrs[name] : null),
    hasAttribute: (name) => name in attrs
  };
  children.forEach((child) => { child.parentElement = node; });
  return node;
}

/** Google Drive's file list from the bug report, trimmed to its structure. */
function driveFileList() {
  const header = el('tr', { role: 'presentation' }, [el('th'), el('th'), el('th')]);
  const rows = [0, 1, 2].map((i) => el('tr', { role: 'row', tabindex: i === 0 ? '0' : '-1' }, [
    el('td', {}, [el('div', { role: 'button', tabindex: '-1' })]),
    el('td'),
    el('td', {}, [el('button', { tabindex: '0', 'aria-label': 'Share' })])
  ]));
  const table = el('table', { role: 'grid', 'aria-label': 'Item list' }, [
    el('thead', {}, [header]),
    el('tbody', {}, rows)
  ]);
  const view = el('c-wiz', { class: 'PEfnhb', tabindex: '-1' }, [el('div', {}, [table])]);
  return { view, table, header, rows };
}

test('the Drive view wrapper is a custom element and so needs proof of life', () => {
  const { view } = driveFileList();
  assert.equal(isCustomElement(view), true);
  assert.equal(isGenericTag(view), true);
  assert.equal(hasInteractiveRole(view), false);
});

test('each Drive file row is a target, whichever one holds the roving tabindex', () => {
  const { rows } = driveFileList();
  rows.forEach((row) => {
    assert.equal(isGridRow(row), true);
    assert.equal(hasInteractiveRole(row), true);
  });
});

test('the old generic tags are still generic, and native controls are not', () => {
  ['div', 'span', 'li', 'tr', 'td', 'section'].forEach((tag) => {
    assert.equal(isGenericTag(el(tag)), true, tag);
  });
  ['button', 'a', 'input', 'textarea', 'select', 'iframe'].forEach((tag) => {
    assert.equal(isGenericTag(el(tag)), false, tag);
  });
});

test('the roles that counted before still count', () => {
  ['button', 'link', 'menuitem', 'tab', 'option', 'gridcell', 'listitem'].forEach((role) => {
    assert.equal(hasInteractiveRole(el('div', { role })), true, role);
  });
  assert.equal(hasInteractiveRole(el('div', { role: 'region' })), false);
  assert.equal(hasInteractiveRole(el('div')), false);
});

test('a row of a plain table is layout, not a target', () => {
  const row = el('tr', { role: 'row', tabindex: '-1' }, [el('td')]);
  el('table', {}, [el('tbody', {}, [row])]);
  assert.equal(isGridRow(row), false);

  const aria = el('div', { role: 'row' }, [el('div', { role: 'cell' })]);
  el('div', { role: 'table' }, [el('div', { role: 'rowgroup' }, [aria])]);
  assert.equal(isGridRow(aria), false);
});

test('a row with no grid above it is not a target', () => {
  const row = el('div', { role: 'row', tabindex: '0' });
  el('div', {}, [el('div', {}, [row])]);
  assert.equal(isGridRow(row), false);
});

test('a treegrid row through an ARIA rowgroup is a target', () => {
  const row = el('div', { role: 'row', tabindex: '-1' }, [el('div', { role: 'gridcell' })]);
  el('div', { role: 'treegrid' }, [el('div', { role: 'rowgroup' }, [row])]);
  assert.equal(isGridRow(row), true);
});

test('a header row of a grid is not a target', () => {
  const byRole = el('div', { role: 'row' }, [el('div', { role: 'columnheader' })]);
  el('div', { role: 'grid' }, [byRole]);
  assert.equal(isGridRow(byRole), false);

  const byTag = el('tr', { role: 'row' }, [el('th'), el('th')]);
  el('table', { role: 'grid' }, [el('thead', {}, [byTag])]);
  assert.equal(isGridRow(byTag), false);
});

test('a row whose cells take focus leaves the stopping to the cells', () => {
  const row = el('div', { role: 'row', tabindex: '-1' }, [
    el('div', { role: 'gridcell', tabindex: '-1' }),
    el('div', { role: 'gridcell', tabindex: '-1' })
  ]);
  el('div', { role: 'grid' }, [row]);
  assert.equal(isGridRow(row), false);
});

test('a role list is read by its first role', () => {
  const row = el('tr', { role: ' Row  button' });
  el('table', { role: 'grid' }, [row]);
  assert.equal(isGridRow(row), true);
});

/* ── items whose container owns focus ───────────────────────────────────── */

/**
 * Google Drive's sidebar from the bug report, trimmed to its structure: the
 * tree holds the only tabindex, each item is a line (role="link") followed by
 * a subtree (role="group"), and nothing inside carries a tabindex.
 */
function driveSidebar() {
  const item = (id, children = []) => {
    const line = el('div', { role: 'link', 'data-target': 'node' }, [el('span')]);
    const subtree = el('div', { role: 'group' }, children);
    return { node: el('div', { id, role: 'treeitem' }, [line, subtree]), line };
  };
  const shared = item('nt:Sh');
  const home = item('nt:D');
  const myDrive = item('nt:Dr', [shared.node]);
  const tree = el('div', { role: 'tree', tabindex: '0' }, [home.node, myDrive.node]);
  const nav = el('nav', { role: 'navigation', tabindex: '-1' }, [tree]);
  return { nav, tree, home, myDrive, shared };
}

test('a Drive sidebar item is a target even though nothing in the tree has a tabindex', () => {
  const { tree, home, myDrive, shared } = driveSidebar();
  assert.equal(focusOwner(home.node), tree);
  assert.equal(focusOwner(shared.node), tree, 'an item of a subtree belongs to the same tree');
  // The ring stops on the line, not on the item, which wraps its whole subtree.
  assert.equal(ownedItemTarget(home.node), home.line);
  assert.equal(ownedItemTarget(myDrive.node), myDrive.line);
  assert.equal(ownedItemTarget(shared.node), shared.line);
});

test('an item with no subtree is its own target', () => {
  const option = el('div', { role: 'option' });
  el('div', { role: 'listbox', tabindex: '0' }, [option]);
  assert.equal(ownedItemTarget(option), option);
});

test('items are left alone when their container does not own focus', () => {
  // The container is not focusable: the widget is broken or inert, not ours to fix.
  const inert = el('div', { role: 'treeitem' });
  el('div', { role: 'tree' }, [inert]);
  assert.equal(ownedItemTarget(inert), null);

  const hidden = el('div', { role: 'option' });
  el('div', { role: 'listbox', tabindex: '-1' }, [hidden]);
  assert.equal(ownedItemTarget(hidden), null);

  // An item that has a tabindex is found by the ordinary search already.
  const roving = el('div', { role: 'treeitem', tabindex: '-1' });
  el('div', { role: 'tree', tabindex: '0' }, [roving]);
  assert.equal(ownedItemTarget(roving), null);

  // A stray role with no container of its kind above it.
  const stray = el('div', { role: 'option' });
  el('div', { role: 'dialog', tabindex: '0' }, [stray]);
  assert.equal(ownedItemTarget(stray), null);
});

test('a tree item counts as interactive once it does carry a tabindex', () => {
  assert.equal(hasInteractiveRole(el('div', { role: 'treeitem', tabindex: '-1' })), true);
  assert.equal(hasInteractiveRole(el('div', { role: 'tree', tabindex: '0' })), false);
});
