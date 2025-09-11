/**
 * Navigation feature
 * Builds the sidebar tree, maintains active/hover states and scroll syncing,
 * and delegates clicks to navigate and activate optional groups.
 */
import { getDeepActiveElement } from '../utils/dom-utils.js';

import { UI_CLASS as CLASS } from '../constants.js';
// Debug logging toggle for navigation generation
const NAV_DEBUG = true;
const navLog = (...args) => { if (NAV_DEBUG) { try { console.log('[form-ui][nav]', ...args); } catch {} } };
import { html, render } from 'da-lit';
import { navItemTemplate, navAddItemTemplate, navArrayChildItemTemplate, navSectionTitleTemplate, navListTemplate, breadcrumbItemTemplate, breadcrumbSeparatorTemplate } from '../templates/nav.js';
import { pathToGroupId, arrayItemId, hyphenatePath } from '../form-generator/path-utils.js';

/**
 * FormNavigation
 *
 * Builds and maintains the sidebar navigation for a generated form.
 *
 * High-level responsibilities:
 * - Generate a flat list of navigation items from the active JSON Schema structure
 * - Convert that flat list into a nested UL/LI tree used in the sidebar
 * - Keep nav selection in sync with the content scroll position (scrollspy)
 * - Provide hover and click interactions to highlight and navigate to groups
 * - Support arrays-of-objects with per-item entries and drag-and-drop reordering
 * - Emit and maintain an "active group" concept across content and navigation
 *
 * Usage:
 * - Instantiated by `FormGenerator` and wired with the same context and model
 * - Call `generateNavigationTree()` after the form body is (re)built
 * - Call `destroy()` on teardown to remove event listeners
 */
export default class FormNavigation {
  /**
   * Create a new FormNavigation instance
   * @param {object} context - Shared app context (services, config, DOM refs)
   * @param {import('../form-generator.js').default} formGenerator - Owner generator
   */
  constructor(context, formGenerator) {
    this.context = context;
    this.formGenerator = formGenerator;
    // Single delegated handler bound once to avoid duplicate listeners
    this.onTreeClick = this.onTreeClick.bind(this);
    // Drag & drop handlers for array item nav entries
    this.onItemDragStart = this.onItemDragStart.bind(this);
    this.onItemDragOver = this.onItemDragOver.bind(this);
    this.onItemDrop = this.onItemDrop.bind(this);
    this._dragData = null; // { arrayPath, fromIndex }
    this._hoverHandler = null;
    this._contentClickHandler = null;
    this._onScrollHandler = null;
    this._onResizeHandler = null;

  }

  /**
   * Given a schema path for a section/object, return the first descendant path
   * that represents a concrete group (has primitive fields) to navigate to.
   * Falls back to the section itself if a primitive is directly under it.
   *
   * @param {string} sectionPath - Dotted schema path for the section/object
   * @returns {string|null} - Best descendant group path or null if none
   */
  resolveFirstDescendantGroupPath(sectionPath) {
    const sectionSchema = this.formGenerator.model.resolveSchemaByPath(sectionPath);
    const norm = this.formGenerator.normalizeSchema(this.formGenerator.derefNode(sectionSchema) || sectionSchema || {});
    if (!norm || !norm.properties) return null;
    // Prefer direct children with primitives
    for (const [key, child] of Object.entries(norm.properties)) {
      const eff = this.formGenerator.normalizeSchema(this.formGenerator.derefNode(child) || child || {});
      if (!eff) continue;
      const childPath = sectionPath ? `${sectionPath}.${key}` : key;
      if (eff.type === 'object' && eff.properties) {
        if (this.formGenerator.hasPrimitiveFields(eff)) return childPath;
        // Otherwise recurse
        const deeper = this.resolveFirstDescendantGroupPath(childPath);
        if (deeper) return deeper;
      } else if (eff.type === 'array') {
        // Skip arrays here; user will add items explicitly
        continue;
      } else {
        // Primitive under section: its parent group is the section itself
        return sectionPath;
      }
    }
    return null;
  }

  /**
   * Map fields to their groups after the group structure is built
   *
   * Build a mapping from field paths to their owning group element IDs.
   * Must be called after the DOM groups/fields are rendered.
   */
  mapFieldsToGroups() {
    this.formGenerator.container.querySelectorAll(`.${CLASS.field}[data-field-path]`).forEach((field) => {
      const { fieldPath } = field.dataset;
      const groupEl = field.closest(`.${CLASS.group}`);
      if (fieldPath && groupEl && groupEl.id) {
        this.formGenerator.fieldToGroup.set(fieldPath, groupEl.id);
      }
    });
  }

  /**
   * Scroll to a group by path index
   *
   * Scroll the content area to the group whose path length matches `pathIndex+1`.
   * Primarily used by index-based navigation affordances.
   * @param {number} pathIndex - Zero-based depth index into the group path
   */
  scrollToGroup(pathIndex) {
    // Find group by path index
    for (const [, groupInfo] of this.formGenerator.groupElements) {
      if (groupInfo.path.length === pathIndex + 1) {
        // Use center positioning with negative scroll margin
        groupInfo.element.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });

        // Briefly highlight the target group
        groupInfo.element.classList.add('form-ui-group-highlighted');
        setTimeout(() => {
          groupInfo.element.classList.remove('form-ui-group-highlighted');
        }, 2000);

        break;
      }
    }
  }

  /**
   * Mark a given group as active across content and sidebar and update
   * the schema-path-driven breadcrumb.
   * @param {string} activeGroupId - DOM id of the group to activate
   */
  updateActiveGroup(activeGroupId) {
    // Remove previous active states
    this.formGenerator.groupElements.forEach((groupInfo) => {
      groupInfo.element.classList.remove('form-ui-group-active');
    });

    // Add active state to current group
    const activeGroup = this.formGenerator.groupElements.get(activeGroupId);
    if (activeGroup) {
      activeGroup.element.classList.add('form-ui-group-active');

      // Persist currently active group so we can restore after hover
      this.formGenerator.activeGroupId = activeGroupId;
      // Persist active schema path in state (schema-driven)
      const schemaPath = activeGroup.schemaPath
        || activeGroup.element?.dataset?.schemaPath
        || '';
      this.formGenerator.activeSchemaPath = schemaPath;

      // Update navigation tree active state
      this.updateNavigationActiveState(activeGroupId);
      // Update content breadcrumb to reflect the active group path
      this.updateContentBreadcrumb(activeGroupId);
    }
  }

  /**
   * Update active state and visual indicator inside the navigation tree.
   * @param {string} activeGroupId - DOM id of the group to reflect as active
   */
  updateNavigationActiveState(activeGroupId) {
    if (!this.formGenerator.navigationTree) return;

    // Remove previous active states
    this.formGenerator.navigationTree.querySelectorAll(`.${CLASS.navItemContent}.active`)
      .forEach((item) => item.classList.remove('active'));
    // Clear previous active/ancestor path highlighting on the UL/LI tree
    this.formGenerator.navigationTree
      .querySelectorAll('.form-nav-tree li.tree-active, .form-nav-tree li.tree-ancestor')
      .forEach((li) => { li.classList.remove('tree-active'); li.classList.remove('tree-ancestor'); });

    // Add active state to current item
    const activeNavItem = this.formGenerator.navigationTree.querySelector(`[data-group-id="${activeGroupId}"] .${CLASS.navItemContent}`);
    if (activeNavItem) {
      activeNavItem.classList.add('active');

      // Mark LI and its ancestors for path highlighting (affects dotted connectors via CSS vars)
      const activeLi = activeNavItem.closest('li');
      if (activeLi) {
        activeLi.classList.add('tree-active');
        let parentLi = activeLi.parentElement ? activeLi.parentElement.closest('li') : null;
        while (parentLi) {
          parentLi.classList.add('tree-ancestor');
          parentLi = parentLi.parentElement ? parentLi.parentElement.closest('li') : null;
        }
      }

      // Update or create the active indicator element to match active item height/position
      let indicator = this.formGenerator.navigationTree.querySelector(`.${CLASS.navIndicator}`);
      if (!indicator) {
        indicator = document.createElement('div');
        indicator.className = CLASS.navIndicator;
        this.formGenerator.navigationTree.appendChild(indicator);
      }

      const treeRect = this.formGenerator.navigationTree.getBoundingClientRect();
      const itemRect = activeNavItem.getBoundingClientRect();
      const top = itemRect.top - treeRect.top + this.formGenerator.navigationTree.scrollTop;
      indicator.style.top = `${top}px`;
      indicator.style.height = `${itemRect.height}px`;
    }
  }

  /**
   * Programmatically navigate to a group: highlight, scroll to, and activate it.
   * @param {string} groupId - DOM id of the target group
   */
  navigateToGroup(groupId) {
    const groupInfo = this.formGenerator.groupElements.get(groupId);
    if (groupInfo) {
      // Highlight the form group with blue overlay
      this.formGenerator.highlightFormGroup(groupId);

      // Scroll to the group
      // Mark a short programmatic-scroll window to defer breadcrumb updates
      try { this.formGenerator._programmaticScrollUntil = Date.now() + 1200; } catch {}
      this.formGenerator.scrollToFormGroup(groupId);

      // Update active state
      this.updateActiveGroup(groupId);
      // Immediately compute breadcrumb for the intended target (avoid wait for scrollspy)
      this.updateContentBreadcrumb(groupId);
    }
  }

  /**
   * Rebuild the breadcrumb displayed above the content based on the
   * currently active schema path. Breadcrumb items are clickable to
   * activate optional groups or navigate to array items.
   * @param {string} groupId - Current active group id (used for immediate updates)
   */
  updateContentBreadcrumb(groupId) {
    const bc = this.formGenerator?.contentBreadcrumbEl;
    if (!bc) return;
    // Schema/data-driven breadcrumb: use stored group schema path and schema titles
    // Use schema-driven active path and schema; no DOM fallbacks
    const schemaPath = this.formGenerator?.activeSchemaPath || '';
    const buildTitleForToken = (parentSchema, token, index) => {
      const m = token.match(/^([^\[]+)(?:\[(\d+)\])?$/);
      const key = m ? m[1] : token;
      const idx = m && m[2] ? Number(m[2]) : null;
      const norm = this.formGenerator.normalizeSchema(this.formGenerator.derefNode(parentSchema) || parentSchema || {});
      const propSchema = norm?.properties?.[key];
      const propNorm = this.formGenerator.normalizeSchema(this.formGenerator.derefNode(propSchema) || propSchema || {});
      if (propNorm?.type === 'array') {
        const title = this.formGenerator.getSchemaTitle(propNorm, key);
        const labels = [];
        // Always include the array's title
        if (title) labels.push(title);
        // If an index is present, include item label as well
        if (idx != null) labels.push(`${title} #${(idx || 0) + 1}`);
        return { label: labels, nextSchema: this.formGenerator.derefNode(propNorm.items) || propNorm.items };
      }
      return { label: [this.formGenerator.getSchemaTitle(propNorm || {}, key)], nextSchema: propNorm };
    };
    // Build clickable crumbs
    bc.innerHTML = '';
    const separator = () => {
      const mount = document.createElement('span');
      render(breadcrumbSeparatorTemplate(), mount);
      return mount.firstElementChild;
    };
    const tokens = String(schemaPath)
      .split('.')
      .filter((t) => t && t !== 'root');
    let curSchema = this.formGenerator.schema;
    let accPath = '';
    tokens.forEach((tok, i) => {
      const m = tok.match(/^([^\[]+)(?:\[(\d+)\])?$/);
      const key = m ? m[1] : tok;
      const idx = m && m[2] ? Number(m[2]) : null;
      accPath = accPath ? `${accPath}.${key}` : key;
      const { label, nextSchema } = buildTitleForToken(curSchema, tok, idx);

      const addCrumb = (text, dataset) => {
        if (!text) return;
        const mount = document.createElement('span');
        render(breadcrumbItemTemplate({
          text,
          path: dataset?.path ?? null,
          groupId: dataset?.groupId ?? null,
          onClick: (e) => {
            e.preventDefault(); e.stopPropagation();
            const path = dataset?.path;
            const gid = dataset?.groupId;
            if (gid) {
              this.navigateToGroup(gid);
              return;
            }
            if (path) {
              const isActive = this.formGenerator.isOptionalGroupActive(path);
              if (!isActive) {
                this.formGenerator.commandActivateOptional(path);
                requestAnimationFrame(() => {
                  const value = this.formGenerator.model.getNestedValue(this.formGenerator.data, path);
                  if (Array.isArray(value) && value.length > 0) {
                    const id = this.formGenerator.arrayItemId(path, 0);
                    this.navigateToGroup(id);
                  } else {
                    const target = this.resolveFirstDescendantGroupPath(path) || path;
                    const gid2 = this.formGenerator.pathToGroupId(target);
                    this.navigateToGroup(gid2);
                  }
                  this.formGenerator.validation.validateAllFields();
                });
              } else {
                const target = this.resolveFirstDescendantGroupPath(path) || path;
                const gid2 = this.formGenerator.pathToGroupId(target);
                this.navigateToGroup(gid2);
              }
            }
          },
        }), mount);
        bc.appendChild(mount.firstElementChild);
      };

      // For arrays, create two crumbs: the array itself and the specific item
      if (Array.isArray(label) && label.length > 0) {
        // Array parent
        addCrumb(label[0], { path: accPath });
        // Array item (if index present)
        if (idx != null && label[1]) {
          bc.appendChild(separator());
          const itemGroupId = this.formGenerator.arrayItemId(accPath, idx);
          addCrumb(label[1], { groupId: itemGroupId });
        }
      } else if (Array.isArray(label)) {
        // No labels
      } else {
        addCrumb(label, { path: accPath });
      }

      // Append separator except after last
      if (i < tokens.length - 1) bc.appendChild(separator());

      // Advance schema for next token
      const curNorm = this.formGenerator.normalizeSchema(this.formGenerator.derefNode(curSchema) || curSchema || {});
      let next = curNorm?.properties?.[key];
      const nextNorm = this.formGenerator.normalizeSchema(this.formGenerator.derefNode(next) || next || {});
      curSchema = nextNorm?.type === 'array' ? (this.formGenerator.derefNode(nextNorm.items) || nextNorm.items) : nextNorm || nextSchema;
      // If array index was present, keep accPath with [idx]
      if (idx != null) accPath = `${accPath}[${idx}]`;
    });
  }

  /**
   * Build and render the full navigation tree into the sidebar container.
   * Applies event handlers and restores scroll position.
   */
  generateNavigationTree() {
    if (!this.formGenerator.navigationTree) return;
    navLog('generateNavigationTree:begin');

    // Preserve current scroll position to avoid jumping to top on re-render
    const treeEl = this.formGenerator.navigationTree;
    const prevScrollTop = treeEl.scrollTop;

    // Clear existing navigation
    this.formGenerator.navigationTree.innerHTML = '';

    // Generate flat navigation items for form groups (with dataset.level)
    const flatItems = this.generateNavigationItems(this.formGenerator.schema, '', 0);
    const nested = this.buildNestedListFromFlat(flatItems);
    this.formGenerator.navigationTree.appendChild(nested);

    // Setup delegated click handler on the tree (idempotent)
    this.setupNavigationHandlers();

    // Apply error markers to newly populated navigation
    this.formGenerator.validation.refreshNavigationErrorMarkers();

    // Add hover syncing: hovering groups moves the active indicator
    this.enableHoverSync();
    // Add scroll syncing: move active indicator while user scrolls the form
    this.enableScrollSync();

    // Restore prior scroll position after layout is updated
    requestAnimationFrame(() => {
      const maxTop = Math.max(0, treeEl.scrollHeight - treeEl.clientHeight);
      treeEl.scrollTop = Math.min(prevScrollTop, maxTop);
    });
  }

  /**
   * Convert a flat array of nav item elements (each carrying dataset.level)
   * into a nested UL/LI structure suitable for the sidebar tree.
   *
   * @param {HTMLElement[]} nodes - Flat nav items with metadata
   * @returns {HTMLUListElement} - Root UL element of the nested tree
   */
  buildNestedListFromFlat(nodes) {
    // Rebuild a lightweight nested structure describing the list for template rendering
    const items = [];
    const stack = [{ level: 0, children: items, last: null }];

    const ensureLevel = (targetLevel) => {
      while (stack.length - 1 > targetLevel) stack.pop();
      while (stack.length - 1 < targetLevel) {
        const parent = stack[stack.length - 1];
        const last = parent.last;
        if (!last) {
          // If missing parent, attach to current level anyway
          const newNode = { className: '', dataset: {}, node: html``, children: [] };
          parent.children.push(newNode);
          stack.push({ level: parent.level + 1, children: newNode.children, last: null });
        } else {
          if (!last.children) last.children = [];
          stack.push({ level: parent.level + 1, children: last.children, last: null });
        }
      }
    };

    nodes.forEach((node) => {
      const level = Number(node?.dataset?.level || 0);
      ensureLevel(level);
      const current = stack[stack.length - 1];
      // Capture dataset and content
      const data = { ...node.dataset };
      const className = node.className || '';
      const nodeHtml = html`${Array.from(node.childNodes).map((n) => n)} `; // reuse children
      const item = { className, dataset: data, node: nodeHtml, children: [] };
      current.children.push(item);
      current.last = item;
    });

    const mount = document.createElement('div');
    render(navListTemplate(items), mount);
    return mount.firstElementChild;
  }

  /**
   * Sync the nav active indicator while hovering groups in the content area.
   * Also sets up a delegated click handler to select a group when clicked.
   */
  enableHoverSync() {
    if (!this.formGenerator.container || !this.formGenerator.navigationTree) return;

    const groups = this.formGenerator.container.querySelectorAll(`.${CLASS.group}, .${CLASS.arrayItem}[id]`);
    const handleMouseEnter = (e) => {
      const group = e.currentTarget;
      const groupId = group.id;
      if (!groupId) return;
      // Update nav indicator to hovered group without changing persistent selected state
      this.updateNavigationActiveState(groupId);
    };
    this._hoverHandler = handleMouseEnter;
    groups.forEach((g) => {
      g.removeEventListener('mouseenter', this._hoverHandler);
      g.addEventListener('mouseenter', this._hoverHandler);
    });

    // Delegated click handler on the form body to avoid bubbling through ancestor groups
    const bodyEl = this.formGenerator.container.querySelector(`.${CLASS.body}`) || this.formGenerator.container;

    if (this._contentClickHandler) {
      bodyEl.removeEventListener('click', this._contentClickHandler);
    }
    this._contentClickHandler = (e) => {
      const clickedGroup = e.target.closest(`.${CLASS.group}, .${CLASS.arrayItem}[id]`);
      if (!clickedGroup) return;
      const groupId = clickedGroup.id;
      if (!groupId) return;
      // Highlight the innermost clicked group and set as active
      this.formGenerator.highlightFormGroup(groupId);
      this.updateActiveGroup(groupId);
    };
    bodyEl.addEventListener('click', this._contentClickHandler);
  }

  /**
   * Attach a throttled scroll listener (or window listener) that updates the
   * active nav item based on the current scroll position (scrollspy behavior).
   */
  enableScrollSync() {
    const { el, type } = this.getScrollSource();
    if (!el && type !== 'window') return;

    let scheduled = false;
    const onScroll = () => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        this.updateActiveGroupFromScroll();
      });
    };

    this._onScrollHandler = onScroll;
    if (type === 'window') {
      window.removeEventListener('scroll', onScroll);
      window.addEventListener('scroll', onScroll, { passive: true });
    } else if (el) {
      el.removeEventListener('scroll', onScroll);
      el.addEventListener('scroll', onScroll, { passive: true });
    }
    this._onResizeHandler = () => this.updateActiveGroupFromScroll();
    window.removeEventListener('resize', this._onResizeHandler);
    window.addEventListener('resize', this._onResizeHandler, { passive: true });

    this.updateActiveGroupFromScroll();
  }

  /**
   * Determine which element is the scroll container: the form body (preferred)
   * or the window/document as a fallback.
   * @returns {{el:HTMLElement|null,type:'element'|'window'}}
   */
  getScrollSource() {
    const bodyEl = this.formGenerator?.container?.querySelector?.(`.${CLASS.body}`) || null;
    const isScrollable = (el) => !!el && el.scrollHeight > el.clientHeight;
    if (isScrollable(bodyEl)) return { el: bodyEl, type: 'element' };
    // Fall back to document/window scrolling
    return { el: null, type: 'window' };
  }

  /**
   * Compute the currently visible group based on scroll position and update
   * navigation and breadcrumb accordingly. Skips updates during programmatic
   * scrolling windows to avoid flicker.
   */
  updateActiveGroupFromScroll() {
    if (!this.formGenerator?.groupElements || this.formGenerator.groupElements.size === 0) return;
    // During programmatic navigation/scroll, skip scrollspy updates entirely
    const until = this.formGenerator?._programmaticScrollUntil || 0;
    if (until && Date.now() <= until) return;
    const { el, type } = this.getScrollSource();

    let candidateId = null;
    let candidateMetric = -Infinity; // larger is better

    // Account for sticky header/breadcrumb and trigger earlier by 100px
    const headerOffset = Math.max(0, this.formGenerator?._headerOffset || 0);
    const extraEarly = 100;

    if (type === 'element' && el) {
      const activeOffset = el.scrollTop + headerOffset + extraEarly;
      const getOffsetTopWithinContainer = (element, containerEl) => {
        let top = 0;
        let node = element;
        while (node && node !== containerEl) {
          top += node.offsetTop;
          node = node.offsetParent;
        }
        return top;
      };
      for (const [groupId, info] of this.formGenerator.groupElements) {
        const top = getOffsetTopWithinContainer(info.element, el);
        if (top <= activeOffset && top >= candidateMetric) {
          candidateMetric = top;
          candidateId = groupId;
        }
      }
    } else {
      // Window scroll: use viewport positions
      const threshold = headerOffset + extraEarly; // px from top of viewport
      for (const [groupId, info] of this.formGenerator.groupElements) {
        const rect = info.element.getBoundingClientRect();
        const top = rect.top;
        if (top <= threshold && top >= candidateMetric) {
          candidateMetric = top;
          candidateId = groupId;
        }
      }
    }

    if (!candidateId) {
      const first = this.formGenerator.groupElements.keys().next();
      if (!first.done) candidateId = first.value;
    }
    if (!candidateId) return;
    this.updateNavigationActiveState(candidateId);
    this.formGenerator.activeGroupId = candidateId;
    // Keep active schema path in sync when scroll selects a group
    const info = this.formGenerator.groupElements.get(candidateId);
    if (info) {
      const schemaPath = info.schemaPath || info.element?.dataset?.schemaPath || '';
      this.formGenerator.activeSchemaPath = schemaPath;
    }
    // Update content breadcrumb unless we are in a programmatic scroll window
    const until2 = this.formGenerator?._programmaticScrollUntil || 0;
    if (!until2 || Date.now() > until2) {
      this.updateContentBreadcrumb(candidateId);
    }
  }

  /**
   * Recursively generate flat navigation items for the given schema subtree.
   * Items include sections, groups, arrays-of-objects, and per-item entries.
   * Optional inactive groups render as "+ Add" affordances.
   *
   * @param {object} schema - Effective schema node for the current level
   * @param {string} [pathPrefix=''] - Dotted path to this node
   * @param {number} [level=0] - Indentation level for visual nesting
   * @returns {HTMLElement[]} - Flat array of nav item elements
   */
  generateNavigationItems(schema, pathPrefix = '', level = 0) {
    const items = [];

    const normalized = this.formGenerator.normalizeSchema ? this.formGenerator.normalizeSchema(schema) : schema;
    navLog('generateNavigationItems:enter', { pathPrefix, level, keys: Object.keys(normalized?.properties || {}) });
    if (normalized.type !== 'object' || !normalized.properties) {
      return items;
    }

    // Does this level have any primitive fields? If yes, add a nav item for this group.
    const hasPrimitivesAtThisLevel = this.formGenerator.hasPrimitiveFields(normalized);
    if (hasPrimitivesAtThisLevel) {
      const groupPath = pathPrefix || 'root';
      const groupId = this.formGenerator.pathToGroupId(groupPath);
      const groupTitle = normalized.title || (level === 0 ? 'Form' : this.formGenerator.formatLabel(pathPrefix.split('.').pop()));

      // Previously: gated optional plain objects when inactive. With always-on rendering,
      // we do not gate leaf groups based on activation state.
      if (groupPath !== 'root') {
        const parentPath = groupPath.replace(/\.[^\.]+$/, (m) => '')
          .replace(/\[[^\]]+\]$/, (m) => '');
        const lastTokenMatch = groupPath.match(/(^|\.)[^.\[]+$/);
        const lastToken = lastTokenMatch ? lastTokenMatch[0].replace(/^\./, '') : '';
        const parentSchema = this.formGenerator.resolveSchemaByPath(parentPath) || {};
        const parentNorm = this.formGenerator.normalizeSchema(this.formGenerator.derefNode(parentSchema) || parentSchema || {});
        const isOptional = !(new Set(parentNorm.required || [])).has(lastToken);
        const isActive = this.formGenerator.isOptionalGroupActive(groupPath);
        console.log('isActive isOptional', { groupPath, isActive, isOptional });
        if (isOptional && !this.formGenerator.isOptionalGroupActive(groupPath)) {
          console.log('emit:optional-group', { groupPath, groupId });
          const mount = document.createElement('div');
          render(navAddItemTemplate({ path: groupPath, groupId: `form-optional-${hyphenatePath(groupPath)}`, level, title: `+ Add ${groupTitle}` }), mount);
          items.push(mount.firstElementChild);
          return items;
        }
      }
      const mount = document.createElement('div');
      render(navItemTemplate({ groupId, level, title: groupTitle }), mount);
      items.push(mount.firstElementChild);
    }

    // Walk properties in declaration order and append items inline respecting order.
    for (const [key, originalPropSchema] of Object.entries(normalized.properties)) {
      const derefProp = this.formGenerator.derefNode(originalPropSchema) || originalPropSchema;
      const nestedPath = pathPrefix ? `${pathPrefix}.${key}` : key;
      navLog('prop', { key, path: nestedPath, level: level + 1, type: derefProp?.type, hasRef: !!originalPropSchema?.$ref });
      const isOptional = !(normalized.required || []).includes(key);
      const hasRef = !!originalPropSchema?.$ref;

      const isObjectType = (
        derefProp && (
          derefProp.type === 'object'
          || (Array.isArray(derefProp.type) && derefProp.type.includes('object'))
        )
      );
      const isArrayOfObjects = (
        derefProp && derefProp.type === 'array' && (
          (derefProp.items && (derefProp.items.type === 'object' || derefProp.items.properties)) || !!derefProp.items?.$ref
        )
      );

      // Skip primitives as they belong to the current group's form
      const isPrimitive = !isObjectType && !isArrayOfObjects;
      if (isPrimitive) continue;

      // Optional inactive refs/array-groups: show an Add item IN PLACE
      const requiresActivation = hasRef || isArrayOfObjects;
      // Always render optional groups; no gating
      const isActive = true;
      if (!isActive && requiresActivation) {
        const addItem = document.createElement('div');
        addItem.className = `${CLASS.navItem} ${CLASS.navItemAdd}`;
        addItem.dataset.groupId = `form-optional-${hyphenatePath(nestedPath)}`;
        addItem.dataset.path = nestedPath;
        addItem.dataset.level = level + 1;

        const content = document.createElement('div');
        content.className = `${CLASS.navItemContent} ${CLASS.navItemAddContent}`;
        content.style.setProperty('--nav-level', level + 1);

        const titleEl = document.createElement('span');
        titleEl.className = `${CLASS.navItemTitle} ${CLASS.navItemAddTitle}`;
        titleEl.textContent = `+ Add ${this.formGenerator.getSchemaTitle(derefProp, key)}`;

        content.appendChild(titleEl);
        addItem.appendChild(content);
        items.push(addItem);
        continue;
      }

      // Active arrays-of-objects: render as their own group item
      if (isArrayOfObjects) {
        navLog('array-of-objects', { key, nestedPath, level: level + 1 });
        const groupId = this.formGenerator.pathToGroupId(nestedPath);
        {
          const mount = document.createElement('div');
          render(navItemTemplate({ groupId, level: level + 1, title: this.formGenerator.getSchemaTitle(derefProp, key) }), mount);
          const el = mount.firstElementChild;
          el.dataset.arrayPath = nestedPath;
          items.push(el);
        }

        // Child items: one entry per existing array item in the form
        const dataArray = this.formGenerator.model.getNestedValue(this.formGenerator.data, nestedPath) || [];
        if (Array.isArray(dataArray)) {
          dataArray.forEach((_, idx) => {
            // Each item gets a child nav node with its own anchor to the item container
            {
              const mount = document.createElement('div');
              render(navArrayChildItemTemplate({
                groupId: this.formGenerator.arrayItemId(nestedPath, idx),
                level: level + 2,
                arrayPath: nestedPath,
                itemIndex: idx,
                title: `${this.formGenerator.getSchemaTitle(derefProp, key)} #${idx + 1}`
              }), mount);
              const itemNav = mount.firstElementChild;
              itemNav.addEventListener('dragstart', this.onItemDragStart);
              itemNav.addEventListener('dragover', this.onItemDragOver);
              itemNav.addEventListener('drop', this.onItemDrop);
              items.push(itemNav);
              navLog('array-item', { arrayPath: nestedPath, index: idx, itemGroupId: this.formGenerator.arrayItemId(nestedPath, idx) });
            }

            // Inspect the item schema for nested arrays-of-objects and nested objects (e.g., link/dataRef/questionnaire)
            const rawItemSchema = this.formGenerator.derefNode(derefProp.items) || derefProp.items || {};
            const itemSchema = this.formGenerator.normalizeSchema ? this.formGenerator.normalizeSchema(rawItemSchema) : rawItemSchema;
            const itemProps = itemSchema.properties || {};
            const itemRequired = new Set(itemSchema.required || []);
            navLog('array-item:inspect-item-schema', { arrayPath: nestedPath, index: idx, childKeys: Object.keys(itemProps) });
            for (const [childKey, childOriginal] of Object.entries(itemProps)) {
              const childRaw = this.formGenerator.derefNode(childOriginal) || childOriginal || {};
              const childProp = this.formGenerator.normalizeSchema ? this.formGenerator.normalizeSchema(childRaw) : childRaw;
              const childIsArrayOfObjects = (
                childProp && childProp.type === 'array' && (
                  (childProp.items && (childProp.items.type === 'object' || childProp.items.properties))
                  || !!childProp.items?.$ref
                  || Array.isArray(childProp.items?.oneOf)
                )
              );
              const childHasRef = !!childOriginal?.$ref || !!childProp?.$ref;
              const childIsObject = !!(childProp && (childProp.type === 'object' || childProp.properties));
              if (!childIsArrayOfObjects && !childHasRef && !childIsObject) continue;

              const childPath = `${nestedPath}[${idx}].${childKey}`;
              const childOptional = !itemRequired.has(childKey);
              // Always render nested children; no gating
              const childActive = true;
              navLog('array-item:child', { childKey, childPath, childIsArrayOfObjects, childIsObject, childHasRef, childOptional });

              if (childIsArrayOfObjects && !childActive) {
                // Show an add option under this item for the nested array-of-objects
                {
                  const mount = document.createElement('div');
                  render(navAddItemTemplate({
                    path: childPath,
                    groupId: `form-optional-${hyphenatePath(childPath)}`,
                    level: level + 3,
                    title: `+ Add ${this.formGenerator.getSchemaTitle(childProp, childKey)} Item`
                  }), mount);
                  items.push(mount.firstElementChild);
                }
                continue;
              }

              // Render nested object or active array-of-objects
              const childGroupId = this.formGenerator.pathToGroupId(childPath);
              if (childIsArrayOfObjects) {
                {
                  const mount = document.createElement('div');
                  render(navItemTemplate({ groupId: childGroupId, level: level + 3, title: this.formGenerator.getSchemaTitle(childProp, childKey) }), mount);
                  items.push(mount.firstElementChild);
                  navLog('emit:child-array-group', { childKey, childPath });
                }
              } else if (childIsObject) {
                // If object has primitives at this level, render as a regular group nav item
                const hasNestedPrimitives = this.formGenerator.hasPrimitiveFields(childProp);
                const hasChildren = Object.keys(childProp.properties || {}).length > 0;
                const childGroupIdForObject = this.formGenerator.pathToGroupId(childPath);
                // Only ONE node per object: emulate group-builder
                if (!hasNestedPrimitives && hasChildren) {
                  const mount = document.createElement('div');
                  render(navSectionTitleTemplate({
                    groupId: childGroupIdForObject,
                    level: level + 3,
                    path: childPath,
                    title: this.formGenerator.getSchemaTitle(childProp, childKey)
                  }), mount);
                  items.push(mount.firstElementChild);
                  navLog('emit:child-section', { childKey, childPath });
                } else {
                  const mount = document.createElement('div');
                  render(navItemTemplate({
                    groupId: childGroupIdForObject,
                    level: level + 3,
                    title: this.formGenerator.getSchemaTitle(childProp, childKey)
                  }), mount);
                  items.push(mount.firstElementChild);
                  navLog('emit:child-object-group', { childKey, childPath });
                }
                if (hasChildren) {
                  const nestedChildItems = this.generateNavigationItems(childProp, childPath, level + 3);
                  items.push(...nestedChildItems);
                  navLog('recurse:child-object-children', { childKey, childPath });
                }
              }

              // Add entries for each nested array item (data-driven)
              const rawChildData = this.formGenerator.model.getNestedValue(this.formGenerator.data, childPath);
              const childDataArray = childIsArrayOfObjects ? (rawChildData || []) : rawChildData;
              if (Array.isArray(childDataArray)) {
                navLog('child-array:data', { childPath, count: childDataArray.length });

                childDataArray.forEach((_, cidx) => {
                  const childItemNav = document.createElement('div');
                  childItemNav.className = CLASS.navItem;
                  childItemNav.classList.add(CLASS.navItemArrayChild);
                  childItemNav.dataset.groupId = this.formGenerator.arrayItemId(childPath, cidx);
                  childItemNav.dataset.level = level + 4;
                  childItemNav.dataset.arrayPath = childPath;
                  childItemNav.dataset.itemIndex = String(cidx);
                  childItemNav.draggable = true;
                  navLog('emit:child-array-item', { childPath, index: cidx, groupId: this.formGenerator.arrayItemId(childPath, cidx) });

                  const childItemContent = document.createElement('div');
                  childItemContent.className = CLASS.navItemContent;
                  childItemContent.style.setProperty('--nav-level', level + 4);
                  const childItemTitle = document.createElement('span');
                  childItemTitle.className = CLASS.navItemTitle;
                  childItemTitle.textContent = `${this.formGenerator.getSchemaTitle(childProp, childKey)} #${cidx + 1}`;
                  childItemContent.appendChild(childItemTitle);
                  childItemNav.appendChild(childItemContent);
                  // Optional: attach drag within nested arrays (reuse handlers)
                  childItemNav.addEventListener('dragstart', this.onItemDragStart);
                  childItemNav.addEventListener('dragover', this.onItemDragOver);
                  childItemNav.addEventListener('drop', this.onItemDrop);
                  items.push(childItemNav);

                  // RECURSE into this nested array item schema so grandchildren render (e.g., iconSeparator)
                  try {
                    const nestedItemRaw = this.formGenerator.derefNode(childProp.items) || childProp.items || {};
                    const nestedItemSchema = this.formGenerator.normalizeSchema ? this.formGenerator.normalizeSchema(nestedItemRaw) : nestedItemRaw;
                    const grandChildPathPrefix = `${childPath}[${cidx}]`;
                    const grandChildren = this.generateNavigationItems(nestedItemSchema, grandChildPathPrefix, level + 5);
                    if (Array.isArray(grandChildren) && grandChildren.length > 0) {
                      items.push(...grandChildren);
                      navLog('recurse:nested-array-item-children', { pathPrefix: grandChildPathPrefix, count: grandChildren.length });
                    }
                  } catch (e) { navLog('recurse:nested-array-item-children:err', e?.message || String(e)); }
                });

                // Add control: "+ Add #N item" at end for nested arrays
                const nextChildIndex = childDataArray.length;
                const addChildItem = document.createElement('div');
                addChildItem.className = `${CLASS.navItem} ${CLASS.navItemAdd}`;
                addChildItem.dataset.groupId = `form-add-${hyphenatePath(childPath)}`;
                addChildItem.dataset.level = level + 4;
                addChildItem.dataset.arrayPath = childPath;

                const addChildContent = document.createElement('div');
                addChildContent.className = `${CLASS.navItemContent} ${CLASS.navItemAddContent}`;
                addChildContent.style.setProperty('--nav-level', level + 4);

                const addTitle = document.createElement('span');
                addTitle.className = `${CLASS.navItemTitle} ${CLASS.navItemAddTitle}`;
                addTitle.textContent = `+ Add '${this.formGenerator.getSchemaTitle(childProp, childKey)}' Item`
                addChildContent.appendChild(addTitle);
                addChildItem.appendChild(addChildContent);
                items.push(addChildItem);
              }
            }
          });

          // Add control: "+ Add #N item" at end of the list
          const nextIndex = dataArray.length;
          {
            const mount = document.createElement('div');
            render(navAddItemTemplate({
              path: nestedPath,
              groupId: `form-add-${hyphenatePath(nestedPath)}`,
              level: level + 2,
              title: `+ Add '${this.formGenerator.getSchemaTitle(derefProp, key)}' Item`
            }), mount);
            const el = mount.firstElementChild;
            el.dataset.arrayPath = nestedPath;
            items.push(el);
          }
        }
        continue;
      }

      // Regular object group: create a section header if it has only children, then recurse
      if (isObjectType && derefProp.properties) {
        const hasNestedPrimitives = this.formGenerator.hasPrimitiveFields(derefProp);
        const hasChildren = Object.keys(derefProp.properties || {}).length > 0;
        if (!hasNestedPrimitives && hasChildren) {
          const sectionId = `form-section-${this.formGenerator.hyphenatePath(nestedPath)}`;
          const sectionTitle = this.formGenerator.getSchemaTitle(derefProp, key);

          {
            const mount = document.createElement('div');
            render(navSectionTitleTemplate({ groupId: sectionId, level: level + 1, path: nestedPath, title: sectionTitle }), mount);
            items.push(mount.firstElementChild);
          }
        }

        const nestedItems = this.generateNavigationItems(derefProp, nestedPath, level + 1);
        items.push(...nestedItems);
      }
    }

    return items;
  }

  /**
   * Drag handler: begin dragging an array item entry in the nav tree.
   * Stores source array path and index.
   * @param {DragEvent} e
   */
  onItemDragStart(e) {
    const item = e.currentTarget.closest?.(`.${CLASS.navItem}`) || e.currentTarget;
    const { arrayPath, itemIndex } = (e.currentTarget.dataset && (e.currentTarget.dataset.arrayPath || e.currentTarget.dataset.itemIndex != null))
      ? e.currentTarget.dataset
      : item.dataset || {};
    if (!arrayPath || itemIndex == null) return;
    this._dragData = { arrayPath, fromIndex: Number(itemIndex) };
    try { e.dataTransfer.effectAllowed = 'move'; } catch { /* noop */ }
  }

  /**
   * Drag handler over potential drop targets. Allows drop when dragging within
   * the same array path.
   * @param {DragEvent} e
   */
  onItemDragOver(e) {
    const item = e.currentTarget.closest?.(`.${CLASS.navItem}`) || e.currentTarget;
    const data = (e.currentTarget.dataset && (e.currentTarget.dataset.arrayPath != null)) ? e.currentTarget.dataset : item.dataset || {};
    const { arrayPath } = data;
    if (!this._dragData || !arrayPath || arrayPath !== this._dragData.arrayPath) return;
    e.preventDefault();
    try { e.dataTransfer.dropEffect = 'move'; } catch { /* noop */ }
  }

  /**
   * Drop handler: delegate to the generator to reorder the underlying data
   * and rebuild UI, then navigate to the moved item.
   * @param {DragEvent} e
   */
  onItemDrop(e) {
    e.preventDefault();
    const item = e.currentTarget.closest?.(`.${CLASS.navItem}`) || e.currentTarget;
    const data = (e.currentTarget.dataset && (e.currentTarget.dataset.arrayPath != null)) ? e.currentTarget.dataset : item.dataset || {};
    const { arrayPath, itemIndex } = data;
    if (!this._dragData || !arrayPath || arrayPath !== this._dragData.arrayPath) {
      this._dragData = null;
      return;
    }
    const toIndex = Number(itemIndex);
    const { fromIndex } = this._dragData;
    this._dragData = null;
    if (Number.isNaN(fromIndex) || Number.isNaN(toIndex) || fromIndex === toIndex) return;
    // Delegate to generator to reorder DOM and reindex inputs/ids, then rebuild nav
    this.formGenerator.reorderArrayItem(arrayPath, fromIndex, toIndex);
  }

  /**
   * Attach a single delegated click listener to the navigation tree container.
   * Safe to call multiple times; existing listener is removed first.
   */
  setupNavigationHandlers() {
    const tree = this.formGenerator.navigationTree;
    if (!tree) return;

    // Ensure we don't stack multiple listeners across rebuilds
    tree.removeEventListener('click', this.onTreeClick);
    tree.addEventListener('click', this.onTreeClick);
  }

  /**
   * Delegated click handler for navigation items. Handles three cases:
   * - "+ Add" controls for arrays (adds new item and navigates to it)
   * - Clicks on optional sections (activates them, then navigates)
   * - Regular group navigation by group id
   * @param {MouseEvent} e
   */
  onTreeClick(e) {
    const navItem = e.target.closest(`.${CLASS.navItem}`);
    if (!navItem) return;
    e.preventDefault();
    e.stopPropagation();

    // Handle add-array-item click from nav: items created with dataset.arrayPath
    if (navItem.classList.contains(CLASS.navItemAdd) && navItem.dataset && navItem.dataset.arrayPath) {
      const arrayPath = navItem.dataset.arrayPath;
      this.formGenerator.commandAddArrayItem(arrayPath);
      requestAnimationFrame(() => {
        const arr = this.formGenerator.model.getNestedValue(this.formGenerator.data, arrayPath) || [];
        const newIndex = Math.max(0, arr.length - 1);
        const targetId = this.formGenerator.arrayItemId(arrayPath, newIndex);
        this.navigateToGroup(targetId);
        this.formGenerator.validation.validateAllFields();
      });
      return;
    }

    const { groupId } = navItem.dataset;
    if (!groupId) return;
    // Purely data-driven: use schema path when present
    if (navItem.dataset && navItem.dataset.path) {
      const path = navItem.dataset.path;
      const isActive = this.formGenerator.isOptionalGroupActive(path);
      if (!isActive) {
        // Optional group not active: activate
        this.formGenerator.commandActivateOptional(path);
        requestAnimationFrame(() => {
          const value = this.formGenerator.model.getNestedValue(this.formGenerator.data, path);
          if (Array.isArray(value) && value.length > 0) {
            const id = this.formGenerator.arrayItemId(path, 0);
            this.navigateToGroup(id);
          } else {
            const target = this.resolveFirstDescendantGroupPath(path) || path;
            const gid = this.formGenerator.pathToGroupId(target);
            this.navigateToGroup(gid);
          }
          this.formGenerator.validation.validateAllFields();
        });
      } else {
        // Already active: navigate to best target group under this section
        const target = this.resolveFirstDescendantGroupPath(path) || path;
        const gid = this.formGenerator.pathToGroupId(target);
        this.navigateToGroup(gid);
      }
      return;
    }

    this.navigateToGroup(groupId);
  }

  /**
   * Highlight and mark active the group that contains the given input element.
   * Used by focus handlers from inputs to hint current editing context.
   * @param {HTMLElement} inputEl
   */
  highlightActiveGroup(inputEl) {
    const groupEl = inputEl.closest('.form-ui-group');
    if (groupEl && groupEl.id) {
      this.updateActiveGroup(groupEl.id);
    }
  }

  /**
   * Remove active and breadcrumb states across content and navigation.
   */
  clearActiveGroupHighlight() {
    this.formGenerator.groupElements.forEach((groupInfo) => {
      groupInfo.element.classList.remove('form-ui-group-active');
    });

    if (this.formGenerator.navigationTree) {
      this.formGenerator.navigationTree.querySelectorAll('.form-ui-nav-item-content.active')
        .forEach((item) => item.classList.remove('active'));
    }
    // Clear content breadcrumb text
    if (this.formGenerator?.contentBreadcrumbEl) {
      this.formGenerator.contentBreadcrumbEl.textContent = '';
    }
  }

  /**
   * Check if any focusable control is currently focused inside the active group.
   * @returns {boolean}
   */
  isAnyInputFocusedInActiveGroup() {
    if (!this.formGenerator.activeGroupId) return false;

    const activeGroup = this.formGenerator.groupElements.get(this.formGenerator.activeGroupId);
    if (!activeGroup) return false;

    const focusedElement = getDeepActiveElement();
    return !!focusedElement
           && activeGroup.element.contains(focusedElement)
           && (focusedElement.matches('input, select, textarea, button') || focusedElement.contentEditable === 'true');
  }
}

/**
 * Cleanup listeners and transient state for the navigation feature.
 */
FormNavigation.prototype.destroy = function destroy() {
  const tree = this.formGenerator?.navigationTree;
  if (tree) tree.removeEventListener('click', this.onTreeClick);
  const bodyEl = this.formGenerator?.container?.querySelector?.('.form-ui-body') || this.formGenerator?.container;
  if (bodyEl && this._contentClickHandler) bodyEl.removeEventListener('click', this._contentClickHandler);
  if (bodyEl && this._hoverHandler) {
    bodyEl.querySelectorAll?.('.form-ui-group, .form-ui-array-item[id]')?.forEach?.((g) => g.removeEventListener('mouseenter', this._hoverHandler));
  }
  if (this._onScrollHandler) {
    const { el, type } = this.getScrollSource();
    if (type === 'window') window.removeEventListener('scroll', this._onScrollHandler);
    else if (el) el.removeEventListener('scroll', this._onScrollHandler);
  }
  if (this._onResizeHandler) window.removeEventListener('resize', this._onResizeHandler);
  this._hoverHandler = null;
  this._contentClickHandler = null;
  this._onScrollHandler = null;
  this._onResizeHandler = null;
};
