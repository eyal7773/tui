/**
 * What Enter should actually click.
 *
 * The ring can end up holding a container rather than the thing inside it that
 * does the work. A list row is the common case: the page puts `tabindex="0"` on
 * the `<li>` and leaves the link inside it unreachable by tab, so focusing the
 * link bounces focus up to the row. Clicking the row then does nothing, because
 * the row has no handler and the link it wraps never saw the click.
 *
 * These rules pick the target: the element navigation was actually aiming at
 * when the browser moved focus to its container, otherwise the row's own
 * action, otherwise the element itself.
 *
 * The tree is walked through `children`, `getAttribute` and `textContent` only,
 * so the decisions can be tested against a plain object tree instead of a page.
 */
(function (root) {
  'use strict';

  // Roles that mean "this element is the widget", so a click belongs on it.
  const ACTIVATING_ROLES = new Set([
    'button', 'link', 'checkbox', 'radio', 'switch', 'tab', 'option',
    'menuitem', 'menuitemcheckbox', 'menuitemradio', 'treeitem',
    'combobox', 'textbox', 'searchbox', 'slider', 'spinbutton'
  ]);

  const ACTIVATING_TAGS = new Set([
    'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'SUMMARY', 'OPTION', 'LABEL'
  ]);

  // Roles and tags that hold a row of content and hand their focusability to
  // whatever the page decided was keyboard-reachable.
  const CONTAINER_ROLES = new Set([
    'listitem', 'row', 'gridcell', 'cell', 'rowheader', 'columnheader'
  ]);

  const CONTAINER_TAGS = new Set(['LI', 'TR', 'TD', 'TH']);

  // Items of a tree, listbox, menu or tab list. They take focus as a whole
  // row, yet a page may keep the handler on the link the row wraps.
  const ITEM_ROLES = new Set(['treeitem', 'option', 'menuitem', 'tab']);

  // Where an item's own content ends: the items nested under it, and the
  // group that holds them.
  const NESTED_ROLES = new Set(['group', 'tree', 'listbox', 'menu', 'tablist', ...ITEM_ROLES]);

  /**
   * How many descendants a search will look at. A row is small; a virtualised
   * feed pretending to be one is not, and Enter has to stay instant.
   */
  const MAX_NODES = 300;

  function tagOf(el) {
    return el && el.tagName ? String(el.tagName).toUpperCase() : '';
  }

  function attrOf(el, name) {
    if (!el || typeof el.getAttribute !== 'function') return null;
    const value = el.getAttribute(name);
    if (value === null || value === undefined) return null;
    return String(value).trim().toLowerCase();
  }

  function hasAttr(el, name) {
    if (el && typeof el.hasAttribute === 'function') return el.hasAttribute(name);
    return attrOf(el, name) !== null;
  }

  // A role list is allowed to carry fallbacks ("link button"); the first one wins.
  function roleOf(el) {
    const role = attrOf(el, 'role');
    if (!role) return null;
    return role.split(/\s+/)[0] || null;
  }

  function textOf(el) {
    return el && typeof el.textContent === 'string' ? el.textContent.trim() : '';
  }

  function childrenOf(el) {
    return (el && el.children) ? el.children : [];
  }

  /**
   * Pre-order, so the first match is the first one in reading order.
   * A node that `skip` accepts is passed over with everything inside it.
   */
  function findDescendant(el, predicate, limit, skip) {
    let budget = typeof limit === 'number' ? limit : MAX_NODES;

    const visit = (node) => {
      const kids = childrenOf(node);
      for (let i = 0; i < kids.length; i++) {
        if (budget-- <= 0) return null;
        const child = kids[i];
        if (skip && skip(child)) continue;
        if (predicate(child)) return child;
        const found = visit(child);
        if (found) return found;
      }
      return null;
    };

    return visit(el);
  }

  function contains(el, other) {
    if (!el || !other) return false;
    if (el === other) return true;
    if (typeof el.contains === 'function') return el.contains(other);
    return !!findDescendant(el, (node) => node === other, MAX_NODES);
  }

  function isOut(el) {
    if (!el) return true;
    if (attrOf(el, 'aria-hidden') === 'true') return true;
    if (attrOf(el, 'aria-disabled') === 'true') return true;
    if (hasAttr(el, 'disabled')) return true;
    return false;
  }

  /** Does clicking this element itself do something? */
  function isActivating(el) {
    const role = roleOf(el);
    if (role) {
      if (ACTIVATING_ROLES.has(role)) return true;
      // An explicit container role is a container even on a <button>-ish tag.
      if (CONTAINER_ROLES.has(role)) return false;
    }

    const tag = tagOf(el);
    // An anchor without href is a hook for a script, not a link, and the
    // scripted ones are usually the container case below.
    if (tag === 'A') return hasAttr(el, 'href');
    if (el && el.isContentEditable) return true;
    return ACTIVATING_TAGS.has(tag);
  }

  function isContainer(el) {
    const role = roleOf(el);
    if (role) {
      if (CONTAINER_ROLES.has(role)) return true;
      if (ACTIVATING_ROLES.has(role)) return false;
    }
    return CONTAINER_TAGS.has(tagOf(el));
  }

  /**
   * The one thing in a row that the row is about: its link or its button.
   *
   * Side controls are skipped rather than clicked by accident. A menu trigger
   * announces itself with aria-haspopup, and the icon-only controls that sit at
   * the end of a row - the overflow dots, a close cross - carry no text, while
   * the row's real action is the one you can read.
   */
  function isPrimaryAction(el) {
    if (isOut(el)) return false;
    if (hasAttr(el, 'aria-haspopup')) return false;

    const tag = tagOf(el);
    const role = roleOf(el);
    const linkish = role === 'link' || (tag === 'A' && hasAttr(el, 'href'));
    const buttonish = role === 'button' || tag === 'BUTTON';
    if (!linkish && !buttonish) return false;

    return textOf(el).length > 0;
  }

  function isClassedDiv(el) {
    return tagOf(el) === 'DIV' && typeof el.className === 'string' && el.className.trim() !== '';
  }

  function isDiv(el) {
    return tagOf(el) === 'DIV';
  }

  function isNested(el) {
    return NESTED_ROLES.has(roleOf(el));
  }

  /** Letters only, so the lengths of parts add up to the length of the whole. */
  function inkOf(el) {
    return textOf(el).replace(/\s+/g, '').length;
  }

  /**
   * How much of an item's text is its own: the items nested under it, and
   * the group that holds them, are taken away, outermost first.
   */
  function ownInkOf(el) {
    let own = inkOf(el);
    let budget = MAX_NODES;
    const visit = (node) => {
      const kids = childrenOf(node);
      for (let i = 0; i < kids.length && budget-- > 0; i++) {
        if (isNested(kids[i])) own -= inkOf(kids[i]);
        else visit(kids[i]);
      }
    };
    visit(el);
    return own;
  }

  /**
   * Where a mouse would click an item of a tree, listbox, menu or tab list
   * that is a plain box: on its label. The page may keep the handler on
   * anything between the label and the row - a router link, or a div of the
   * row's own (Slack's sidebar rows are divs with no link at all) - and a
   * click on the row itself never reaches it, while a click on the label
   * passes through every one of them.
   *
   * The label's link or button wins when it carries most of the item's own
   * text. Otherwise it is the innermost element that does: the chain of
   * children each holding at least half of that text. The items nested under
   * the item do not count, so a section row is clicked on its heading, never
   * on a channel inside it, and an option is never clicked on a small link
   * that merely sits in it.
   */
  function itemLabelAction(el) {
    if (!ITEM_ROLES.has(roleOf(el))) return null;
    const tag = tagOf(el);
    if ((tag === 'A' && hasAttr(el, 'href')) || ACTIVATING_TAGS.has(tag)) return null;

    const own = ownInkOf(el);
    if (own <= 0) return null;
    const carries = (node) => inkOf(node) * 2 >= own;

    const action = findDescendant(el, isPrimaryAction, MAX_NODES, isNested);
    if (action && carries(action)) return action;

    let label = el;
    let budget = MAX_NODES;
    for (;;) {
      const kids = childrenOf(label);
      let next = null;
      for (let i = 0; i < kids.length && budget-- > 0; i++) {
        if (!isNested(kids[i]) && carries(kids[i])) { next = kids[i]; break; }
      }
      if (!next) break;
      label = next;
    }
    return label === el ? null : label;
  }

  /**
   * @param {Element} el       the focused element, which is what a click would hit
   * @param {Element} [intended] the element navigation aimed at, when focus was
   *                             bounced to a container instead
   * @returns {Element} the element to click
   */
  function resolveClickTarget(el, intended) {
    if (!el) return el;

    // 1. Navigation already knows which link the user was standing on; the
    //    browser only refused to keep focus on it. That beats any guess.
    if (intended && intended !== el && contains(el, intended)) return intended;

    // 2. A tree, listbox, menu or tab item that is a plain box: on its label.
    const label = itemLabelAction(el);
    if (label) return label;

    // 3. Anything that acts on its own click is clicked as-is.
    if (isActivating(el)) return el;

    if (isContainer(el)) {
      // 4. The row's own action.
      const action = findDescendant(el, isPrimaryAction, MAX_NODES);
      if (action) return action;

      // 5. No link or button, so the handler is on some inner div - the shape
      //    used by chat lists and other app-like rows. The outermost one with
      //    classes of its own is the content wrapper; bare divs are spacers.
      const wrapper = findDescendant(el, isClassedDiv, MAX_NODES) ||
        findDescendant(el, isDiv, MAX_NODES);
      if (wrapper) return wrapper;
    }

    return el;
  }

  /**
   * Enter twice within this many milliseconds on the same element is a
   * double-click, the same window Windows gives the mouse by default.
   */
  const DOUBLE_ENTER_MS = 500;

  /** How long a click has to show it did something before Enter's hint. */
  const CLICK_EFFECT_MS = 800;

  // State that changes when a click opens, expands or toggles something.
  // aria-selected is left out on purpose: a file row in Drive only gets
  // selected by a click and opens on a double-click, and that is exactly
  // the case the hint is for.
  const EFFECT_ATTRIBUTES = ['aria-expanded', 'aria-pressed', 'aria-checked', 'open'];

  const OVERLAY_ROLES = new Set(['dialog', 'alertdialog', 'menu', 'listbox']);

  /** A dialog, menu or popup: what a click brings up when it opens something. */
  function isOverlay(el) {
    if (!el || !el.tagName) return false;
    if (tagOf(el) === 'DIALOG' || hasAttr(el, 'popover')) return true;
    if (attrOf(el, 'aria-modal') === 'true') return true;
    return OVERLAY_ROLES.has(roleOf(el));
  }

  /**
   * Whether a click on el that did nothing may have wanted a double-click.
   * Links, buttons and form controls act on one click by nature; a row or a
   * tile whose action is scripted may open only on a double-click.
   */
  function mayWantDoubleClick(el) {
    return !!el && !isActivating(el);
  }

  root.TuiClickRules = {
    resolveClickTarget: resolveClickTarget,
    isOverlay: isOverlay,
    mayWantDoubleClick: mayWantDoubleClick,
    EFFECT_ATTRIBUTES: EFFECT_ATTRIBUTES,
    DOUBLE_ENTER_MS: DOUBLE_ENTER_MS,
    CLICK_EFFECT_MS: CLICK_EFFECT_MS,
    isActivating: isActivating,
    isContainer: isContainer,
    isPrimaryAction: isPrimaryAction,
    MAX_NODES: MAX_NODES
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
