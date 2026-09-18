/**
 * Which elements with a tabindex are worth stopping on.
 *
 * Pages put tabindex on plenty of things that are not targets: a wrapper that
 * takes focus so a script can manage it, a whole view that listens for keys.
 * The engine checks such "generic" elements for signs of life (an interactive
 * role, a pointer cursor) before letting the ring land on them. These rules
 * decide which elements get that check and which roles count as a sign of life.
 *
 * Three cases shaped them, all from Google Drive:
 *   - The list sits in a <c-wiz tabindex="-1"> that fills most of the screen.
 *     A custom element is as generic as a <div>, but it was not on the tag
 *     list, so it skipped the check and ArrowDown landed on the whole list.
 *   - Each file is a <tr role="row"> in a <table role="grid">, with the cursor
 *     left at default. "row" was not a sign of life, so the files themselves
 *     were never candidates.
 *   - The sidebar ("Home", "My Drive", ...) is a role="tree" that holds the
 *     only tabindex. Its items have none at all, so they never matched the
 *     search, and ArrowDown from "+ New" skipped the whole sidebar and landed
 *     on "Ask Gemini" in the main view. See ownedItemTarget.
 *
 * The tree is read through tagName, getAttribute, parentElement and children
 * only, so the decisions can be tested against a plain object tree.
 */
(function (root) {
  'use strict';

  const GENERIC_TAGS = new Set([
    'DIV', 'SPAN', 'LI', 'TR', 'TD', 'UL', 'OL', 'NAV', 'SECTION', 'ARTICLE',
    'ASIDE', 'HEADER', 'FOOTER'
  ]);

  // Roles that make a generic element a target on their own. "row" is not
  // here: a row is a target only inside a grid, see isGridRow.
  const INTERACTIVE_ROLES = new Set([
    'button', 'link', 'menuitem', 'menuitemradio', 'menuitemcheckbox', 'tab',
    'option', 'treeitem', 'gridcell', 'listitem'
  ]);

  // Items of a widget whose container may keep the only tabindex, and the
  // roles of those containers.
  const ITEM_ROLES = new Set([
    'treeitem', 'option', 'menuitem', 'menuitemradio', 'menuitemcheckbox', 'tab'
  ]);
  const COMPOSITE_ROLES = new Set(['tree', 'listbox', 'menu', 'menubar', 'tablist']);

  // Roles that sit between an item and its container: a subtree of a tree is
  // a "group" inside the parent item.
  const ITEM_PASS_THROUGH_ROLES = new Set(['group', 'treeitem', 'presentation', 'none']);

  // Two levels per step down a tree (item -> group -> item), plus wrappers.
  const MAX_ITEM_DEPTH = 16;

  // Roles that sit between a row and its grid without saying anything.
  const PASS_THROUGH_ROLES = new Set(['rowgroup', 'presentation', 'none']);

  // How far up a row may look for its grid: row -> rowgroup -> grid, with
  // some slack for wrappers a framework slips in.
  const MAX_GRID_DEPTH = 5;

  // A row is small. Anything bigger is not a row we should be reading.
  const MAX_NODES = 300;

  function tagOf(el) {
    return el && el.tagName ? String(el.tagName).toUpperCase() : '';
  }

  // A role list is allowed to carry fallbacks ("row button"); the first one wins.
  function roleOf(el) {
    if (!el || typeof el.getAttribute !== 'function') return null;
    const role = el.getAttribute('role');
    if (!role) return null;
    return String(role).trim().toLowerCase().split(/\s+/)[0] || null;
  }

  function hasTabindex(el) {
    return !!el && typeof el.hasAttribute === 'function' && el.hasAttribute('tabindex');
  }

  /** Pre-order search with a node budget, so a huge subtree stays cheap. */
  function someDescendant(el, predicate) {
    let budget = MAX_NODES;

    const visit = (node) => {
      const kids = (node && node.children) ? node.children : [];
      for (let i = 0; i < kids.length; i++) {
        if (budget-- <= 0) return false;
        if (predicate(kids[i]) || visit(kids[i])) return true;
      }
      return false;
    };

    return visit(el);
  }

  /** <c-wiz>, <drive-collection>, <my-app>: the dash is what the spec requires. */
  function isCustomElement(el) {
    return tagOf(el).includes('-');
  }

  /** Needs proof of being interactive before it may be a target. */
  function isGenericTag(el) {
    return GENERIC_TAGS.has(tagOf(el)) || isCustomElement(el);
  }

  /**
   * A row of a grid that the user picks as a whole, like a file in a list.
   *
   * Not a row of a plain table, where rows are just layout. Not a header row.
   * And not a row whose cells take focus themselves: there the cells are the
   * targets, and stopping on the row too would cost an extra keypress.
   */
  function isGridRow(el) {
    if (roleOf(el) !== 'row') return false;

    let ancestor = el.parentElement;
    let inGrid = false;
    for (let depth = 0; ancestor && depth < MAX_GRID_DEPTH; depth++) {
      const role = roleOf(ancestor);
      if (role === 'grid' || role === 'treegrid') {
        inGrid = true;
        break;
      }
      // Any other role, or a bare <table> (role table), ends the search.
      if (role && !PASS_THROUGH_ROLES.has(role)) return false;
      if (!role && tagOf(ancestor) === 'TABLE') return false;
      ancestor = ancestor.parentElement;
    }
    if (!inGrid) return false;

    const isHeaderRow = someDescendant(el, (node) =>
      roleOf(node) === 'columnheader' || (tagOf(node) === 'TH' && !roleOf(node)));
    if (isHeaderRow) return false;

    const cellsTakeFocus = someDescendant(el, (node) =>
      roleOf(node) === 'gridcell' && hasTabindex(node));
    return !cellsTakeFocus;
  }

  /**
   * The container that owns focus for an item without a tabindex of its own,
   * or null.
   *
   * Some widgets keep a single tabindex on the container and track the current
   * item themselves (aria-activedescendant, or a class). Their items have no
   * tabindex, so a search for focusable things never finds them.
   */
  function focusOwner(item) {
    if (!ITEM_ROLES.has(roleOf(item)) || hasTabindex(item)) return null;

    let ancestor = item.parentElement;
    for (let depth = 0; ancestor && depth < MAX_ITEM_DEPTH; depth++) {
      const role = roleOf(ancestor);
      if (COMPOSITE_ROLES.has(role)) {
        const tabindex = ancestor.getAttribute('tabindex');
        return tabindex !== null && tabindex !== '-1' ? ancestor : null;
      }
      if (role && !ITEM_PASS_THROUGH_ROLES.has(role)) return null;
      ancestor = ancestor.parentElement;
    }
    return null;
  }

  /**
   * What the ring should stop on for an item whose container owns focus, or
   * null when the item is not one of those.
   *
   * Usually the item itself. A tree item that holds a subtree is taller than
   * its own line once expanded, and its children sit inside it, so the arrows
   * could never step from the item to its first child. There the target is the
   * line: the item's first child that is not the subtree.
   */
  function ownedItemTarget(item) {
    if (!focusOwner(item)) return null;

    const kids = Array.from(item.children || []);
    if (!kids.some((kid) => roleOf(kid) === 'group')) return item;
    return kids.find((kid) => roleOf(kid) !== 'group') || item;
  }

  /** Does this role (or grid-row shape) make a generic element a target? */
  function hasInteractiveRole(el) {
    return INTERACTIVE_ROLES.has(roleOf(el)) || isGridRow(el);
  }

  root.TuiTargetRules = {
    isCustomElement: isCustomElement,
    isGenericTag: isGenericTag,
    isGridRow: isGridRow,
    hasInteractiveRole: hasInteractiveRole,
    focusOwner: focusOwner,
    ownedItemTarget: ownedItemTarget,
    OWNED_ITEM_SELECTOR: Array.from(ITEM_ROLES)
      .map((role) => '[role="' + role + '"]:not([tabindex])').join(', ')
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
