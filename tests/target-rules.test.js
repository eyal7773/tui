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
const { isCustomElement, isGenericTag, isGridRow, hasInteractiveRole } = globalThis.TuiTargetRules;

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
