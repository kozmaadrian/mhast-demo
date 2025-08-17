/**
 * Form Navigation
 * Handles sidebar navigation, group management, and form interaction
 */
import { getDeepActiveElement } from '../utils/dom-utils.js';

export default class FormNavigation {
  constructor(formGenerator) {
    this.formGenerator = formGenerator;
    // Single delegated handler bound once to avoid duplicate listeners
    this.onTreeClick = this.onTreeClick.bind(this);
    // Drag & drop handlers for array item nav entries
    this.onItemDragStart = this.onItemDragStart.bind(this);
    this.onItemDragOver = this.onItemDragOver.bind(this);
    this.onItemDrop = this.onItemDrop.bind(this);
    this._dragData = null; // { arrayPath, fromIndex }
    // Guard to avoid double auto-add clicks for the same array path
    this._autoAddedOnce = new Set();
  }

  /**
   * Map fields to their groups after the group structure is built
   */
  mapFieldsToGroups() {
    this.formGenerator.container.querySelectorAll('.form-ui-field[data-field-path]').forEach((field) => {
      const { fieldPath } = field.dataset;
      const groupEl = field.closest('.form-ui-group');
      if (fieldPath && groupEl && groupEl.id) {
        this.formGenerator.fieldToGroup.set(fieldPath, groupEl.id);
      }
    });
  }

  /**
   * Scroll to a group by path index
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
   * Update active group indicator
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

      // Update navigation tree active state
      this.updateNavigationActiveState(activeGroupId);
    }
  }

  /**
   * Update active state in navigation tree
   */
  updateNavigationActiveState(activeGroupId) {
    if (!this.formGenerator.navigationTree) return;

    // Remove previous active states
    this.formGenerator.navigationTree.querySelectorAll('.form-ui-nav-item-content.active')
      .forEach((item) => item.classList.remove('active'));

    // Add active state to current item
    const activeNavItem = this.formGenerator.navigationTree.querySelector(`[data-group-id="${activeGroupId}"] .form-ui-nav-item-content`);
    if (activeNavItem) {
      activeNavItem.classList.add('active');

      // Update or create the active indicator element to match active item height/position
      let indicator = this.formGenerator.navigationTree.querySelector('.form-nav-active-indicator');
      if (!indicator) {
        indicator = document.createElement('div');
        indicator.className = 'form-nav-active-indicator';
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
   * Navigate to a specific group
   */
  navigateToGroup(groupId) {
    const groupInfo = this.formGenerator.groupElements.get(groupId);
    if (groupInfo) {
      // Highlight the form group with blue overlay
      this.formGenerator.highlightFormGroup(groupId);

      // Scroll to the group
      this.formGenerator.scrollToFormGroup(groupId);

      // Update active state
      this.updateActiveGroup(groupId);
    }
  }

  /**
   * Generate navigation tree for sidebar
   */
  generateNavigationTree() {
    if (!this.formGenerator.navigationTree) return;

    // Clear existing navigation
    this.formGenerator.navigationTree.innerHTML = '';

    // Generate navigation items for form groups
    const navItems = this.generateNavigationItems(this.formGenerator.schema, '', 0);
    navItems.forEach((item) => this.formGenerator.navigationTree.appendChild(item));

    // Setup delegated click handler on the tree (idempotent)
    this.setupNavigationHandlers();

    // Apply error markers to newly populated navigation
    this.formGenerator.validation.refreshNavigationErrorMarkers();

    // Add hover syncing: hovering groups moves the active indicator
    this.enableHoverSync();
    // Add scroll syncing: move active indicator while user scrolls the form
    this.enableScrollSync();

    // Ensure clicks on array-group items work the same as object groups
    // (handled by delegated onTreeClick using data-group-id)
  }

  /**
   * When hovering a form group in content, move the sidebar indicator to that item.
   */
  enableHoverSync() {
    if (!this.formGenerator.container || !this.formGenerator.navigationTree) return;

    const groups = this.formGenerator.container.querySelectorAll('.form-ui-group, .form-ui-array-item[id]');
    const handleMouseEnter = (e) => {
      const group = e.currentTarget;
      const groupId = group.id;
      if (!groupId) return;
      // Update nav indicator to hovered group without changing persistent active state
      this.updateNavigationActiveState(groupId);
    };

    groups.forEach((g) => {
      g.removeEventListener('mouseenter', handleMouseEnter);
      g.addEventListener('mouseenter', handleMouseEnter);
    });

    // Clicking anywhere in a group should also activate its nav item
    const handleGroupClick = (e) => {
      const group = e.currentTarget;
      const groupId = group.id;
      if (!groupId) return;
      // Highlight the form group and set as active
      this.formGenerator.highlightFormGroup(groupId);
      this.updateActiveGroup(groupId);
    };

    groups.forEach((g) => {
      g.removeEventListener('click', handleGroupClick);
      g.addEventListener('click', handleGroupClick);
    });
  }

  /**
   * Keep sidebar indicator in sync with scroll position (scrollspy)
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

  getScrollSource() {
    const bodyEl = this.formGenerator?.container?.querySelector?.('.form-ui-body') || null;
    const isScrollable = (el) => !!el && el.scrollHeight > el.clientHeight;
    if (isScrollable(bodyEl)) return { el: bodyEl, type: 'element' };
    // Fall back to document/window scrolling
    return { el: null, type: 'window' };
  }

  updateActiveGroupFromScroll() {
    if (!this.formGenerator?.groupElements || this.formGenerator.groupElements.size === 0) return;
    const { el, type } = this.getScrollSource();

    let candidateId = null;
    let candidateMetric = -Infinity; // larger is better

    if (type === 'element' && el) {
      const activeOffset = el.scrollTop + 20;
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
      const viewportTop = 0; // relative in getBoundingClientRect()
      const threshold = 80; // px from top of viewport
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
  }

  /**
   * Generate navigation items recursively
   */
  generateNavigationItems(schema, pathPrefix = '', level = 0) {
    const items = [];

    const normalized = this.formGenerator.normalizeSchema ? this.formGenerator.normalizeSchema(schema) : schema;
    if (normalized.type !== 'object' || !normalized.properties) {
      return items;
    }

    // Does this level have any primitive fields? If yes, add a nav item for this group.
    const hasPrimitivesAtThisLevel = this.formGenerator.hasPrimitiveFields(normalized);
    if (hasPrimitivesAtThisLevel) {
      const groupPath = pathPrefix || 'root';
      const groupId = `form-group-${groupPath.replace(/\./g, '-')}`;
      const groupTitle = normalized.title || (level === 0 ? 'Form' : this.formGenerator.formatLabel(pathPrefix.split('.').pop()));

      const navItem = document.createElement('div');
      navItem.className = 'form-ui-nav-item';
      navItem.dataset.groupId = groupId;
      navItem.dataset.level = level;

      const navContent = document.createElement('div');
      navContent.className = 'form-ui-nav-item-content';
      navContent.style.setProperty('--nav-level', level);

      const navTitle = document.createElement('span');
      navTitle.className = 'form-ui-nav-item-title';
      navTitle.textContent = groupTitle;

      navContent.appendChild(navTitle);
      navItem.appendChild(navContent);
      items.push(navItem);
    }

    // Walk properties in declaration order and append items inline respecting order.
    for (const [key, originalPropSchema] of Object.entries(normalized.properties)) {
      const derefProp = this.formGenerator.derefNode(originalPropSchema) || originalPropSchema;
      const nestedPath = pathPrefix ? `${pathPrefix}.${key}` : key;
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
      const isActive = !isOptional || !requiresActivation || this.formGenerator.isOptionalGroupActive(nestedPath);
      if (!isActive && requiresActivation) {
        const addItem = document.createElement('div');
        addItem.className = 'form-ui-nav-item form-ui-nav-item-add';
        addItem.dataset.groupId = `form-optional-${nestedPath.replace(/\./g, '-')}`;
        addItem.dataset.path = nestedPath;
        addItem.dataset.level = level + 1;

        const content = document.createElement('div');
        content.className = 'form-ui-nav-item-content form-ui-nav-item-add-content';
        content.style.setProperty('--nav-level', level + 1);

        const titleEl = document.createElement('span');
        titleEl.className = 'form-ui-nav-item-title form-ui-nav-item-add-title';
        titleEl.textContent = `+ Add ${this.formGenerator.getSchemaTitle(derefProp, key)}`;

        content.appendChild(titleEl);
        addItem.appendChild(content);
        items.push(addItem);
        continue;
      }

      // Active arrays-of-objects: render as their own group item
      if (isArrayOfObjects) {
        const groupId = `form-group-${nestedPath.replace(/\./g, '-')}`;
        const navItem = document.createElement('div');
        navItem.className = 'form-ui-nav-item';
        navItem.dataset.groupId = groupId;
        navItem.dataset.level = level + 1;

        const content = document.createElement('div');
        content.className = 'form-ui-nav-item-content';
        content.style.setProperty('--nav-level', level + 1);

        const titleEl = document.createElement('span');
        titleEl.className = 'form-ui-nav-item-title';
        titleEl.textContent = this.formGenerator.getSchemaTitle(derefProp, key);

        content.appendChild(titleEl);
        navItem.appendChild(content);
        items.push(navItem);

        // Child items: one entry per existing array item in the form
        const arrayContainer = this.formGenerator.container?.querySelector?.(
          `#${groupId} .form-ui-array-items`
        );
        if (arrayContainer) {
          // Only count direct children items to avoid picking nested array items inside each item
          const itemEls = Array.from(arrayContainer.querySelectorAll(':scope > .form-ui-array-item'));
          try { console.log('[NAV][BUILD] Listing array items', { path: nestedPath, count: itemEls.length }); } catch {}
          itemEls.forEach((el, idx) => {
            // Each item gets a child nav node with its own anchor to the item container
            const itemNav = document.createElement('div');
            itemNav.className = 'form-ui-nav-item';
            itemNav.classList.add('form-ui-nav-item-array-child');
            itemNav.dataset.groupId = el.id || `${groupId}-item-${idx}`;
            itemNav.dataset.level = level + 2;
            itemNav.dataset.arrayPath = nestedPath;
            itemNav.dataset.itemIndex = String(idx);
            itemNav.draggable = true;

            const itemContent = document.createElement('div');
            itemContent.className = 'form-ui-nav-item-content';
            itemContent.style.setProperty('--nav-level', level + 2);

            const itemTitle = document.createElement('span');
            itemTitle.className = 'form-ui-nav-item-title';
            itemTitle.textContent = `${this.formGenerator.getSchemaTitle(derefProp, key)} #${idx + 1}`;

            itemContent.appendChild(itemTitle);
            itemNav.appendChild(itemContent);
            // Attach drag handlers
            itemNav.addEventListener('dragstart', this.onItemDragStart);
            itemNav.addEventListener('dragover', this.onItemDragOver);
            itemNav.addEventListener('drop', this.onItemDrop);
            items.push(itemNav);

            // Inspect the item schema for nested arrays-of-objects (e.g., answerList inside questionList)
            const itemSchema = this.formGenerator.derefNode(derefProp.items) || derefProp.items || {};
            const itemProps = itemSchema.properties || {};
            const itemRequired = new Set(itemSchema.required || []);
            for (const [childKey, childOriginal] of Object.entries(itemProps)) {
              const childProp = this.formGenerator.derefNode(childOriginal) || childOriginal;
              const childIsArrayOfObjects = (
                childProp && childProp.type === 'array' && (
                  (childProp.items && (childProp.items.type === 'object' || childProp.items.properties)) || !!childProp.items?.$ref
                )
              );
              const childHasRef = !!childOriginal?.$ref || !!childProp?.$ref;
              if (!childIsArrayOfObjects && !childHasRef) continue;

              const childPath = `${nestedPath}[${idx}].${childKey}`;
              const childOptional = !itemRequired.has(childKey);
              const childActive = !childOptional || this.formGenerator.isOptionalGroupActive(childPath);

              if (!childActive) {
                // Show an add option for the nested array under this item
                const addChild = document.createElement('div');
                addChild.className = 'form-ui-nav-item form-ui-nav-item-add';
                addChild.dataset.groupId = `form-optional-${childPath.replace(/[.\[\]]/g, '-')}`;
                addChild.dataset.path = childPath;
                addChild.dataset.level = level + 3;
                const addContent = document.createElement('div');
                addContent.className = 'form-ui-nav-item-content form-ui-nav-item-add-content';
                addContent.style.setProperty('--nav-level', level + 3);
                const addTitle = document.createElement('span');
                addTitle.className = 'form-ui-nav-item-title form-ui-nav-item-add-title';
                addTitle.textContent = `+ Add ${this.formGenerator.getSchemaTitle(childProp, childKey)}`;
                addContent.appendChild(addTitle);
                addChild.appendChild(addContent);
                items.push(addChild);
                continue;
              }

              // Render the nested array group under this item
              const childGroupId = `form-group-${childPath.replace(/[.\[\]]/g, '-')}`;
              const childNav = document.createElement('div');
              childNav.className = 'form-ui-nav-item';
              childNav.dataset.groupId = childGroupId;
              childNav.dataset.level = level + 3;
              const childContent = document.createElement('div');
              childContent.className = 'form-ui-nav-item-content';
              childContent.style.setProperty('--nav-level', level + 3);
              const childTitle = document.createElement('span');
              childTitle.className = 'form-ui-nav-item-title';
              childTitle.textContent = this.formGenerator.getSchemaTitle(childProp, childKey);
              childContent.appendChild(childTitle);
              childNav.appendChild(childContent);
              items.push(childNav);

              // Add entries for each nested array item
              const childArrayContainer = this.formGenerator.container?.querySelector?.(
                `[data-field="${childPath}"] .form-ui-array-items`
              ) || this.formGenerator.container?.querySelector?.(
                `#${childGroupId} .form-ui-array-items`
              );
              if (childArrayContainer) {
                // Again, only count direct nested items
                const childItemEls = Array.from(childArrayContainer.querySelectorAll(':scope > .form-ui-array-item'));
                try { console.log('[NAV][BUILD] Listing nested array items', { path: childPath, count: childItemEls.length }); } catch {}
                childItemEls.forEach((cel, cidx) => {
                  const childItemNav = document.createElement('div');
                  childItemNav.className = 'form-ui-nav-item';
                  childItemNav.classList.add('form-ui-nav-item-array-child');
                  childItemNav.dataset.groupId = cel.id || `${childGroupId}-item-${cidx}`;
                  childItemNav.dataset.level = level + 4;
                  childItemNav.dataset.arrayPath = childPath;
                  childItemNav.dataset.itemIndex = String(cidx);
                  childItemNav.draggable = true;

                  const childItemContent = document.createElement('div');
                  childItemContent.className = 'form-ui-nav-item-content';
                  childItemContent.style.setProperty('--nav-level', level + 4);
                  const childItemTitle = document.createElement('span');
                  childItemTitle.className = 'form-ui-nav-item-title';
                  childItemTitle.textContent = `${this.formGenerator.getSchemaTitle(childProp, childKey)} #${cidx + 1}`;
                  childItemContent.appendChild(childItemTitle);
                  childItemNav.appendChild(childItemContent);
                  // Optional: attach drag within nested arrays (reuse handlers)
                  childItemNav.addEventListener('dragstart', this.onItemDragStart);
                  childItemNav.addEventListener('dragover', this.onItemDragOver);
                  childItemNav.addEventListener('drop', this.onItemDrop);
                  items.push(childItemNav);
                });
              }
            }
          });
        }
        continue;
      }

      // Regular object group: create a section header if it has only children, then recurse
      if (isObjectType && derefProp.properties) {
        const hasNestedPrimitives = this.formGenerator.hasPrimitiveFields(derefProp);
        const hasChildren = Object.keys(derefProp.properties || {}).length > 0;
        if (!hasNestedPrimitives && hasChildren) {
          const sectionId = `form-section-${nestedPath.replace(/\./g, '-')}`;
          const sectionTitle = this.formGenerator.getSchemaTitle(derefProp, key);

          const sectionItem = document.createElement('div');
          sectionItem.className = 'form-ui-nav-item form-ui-section-title-nav';
          sectionItem.dataset.groupId = sectionId;
          sectionItem.dataset.level = level + 1;

          const sectionContent = document.createElement('div');
          sectionContent.className = 'form-ui-nav-item-content';
          sectionContent.style.setProperty('--nav-level', level + 1);

          const sectionTitleEl = document.createElement('span');
          sectionTitleEl.className = 'form-ui-nav-item-title';
          sectionTitleEl.textContent = sectionTitle;

          sectionContent.appendChild(sectionTitleEl);
          sectionItem.appendChild(sectionContent);
          items.push(sectionItem);
        }

        const nestedItems = this.generateNavigationItems(derefProp, nestedPath, level + 1);
        items.push(...nestedItems);
      }
    }

    return items;
  }

  onItemDragStart(e) {
    const item = e.currentTarget;
    const { arrayPath, itemIndex } = item.dataset;
    if (!arrayPath || itemIndex == null) return;
    this._dragData = { arrayPath, fromIndex: Number(itemIndex) };
    try { e.dataTransfer.effectAllowed = 'move'; } catch { /* noop */ }
  }

  onItemDragOver(e) {
    const item = e.currentTarget;
    const { arrayPath } = item.dataset;
    if (!this._dragData || !arrayPath || arrayPath !== this._dragData.arrayPath) return;
    e.preventDefault();
    try { e.dataTransfer.dropEffect = 'move'; } catch { /* noop */ }
  }

  onItemDrop(e) {
    e.preventDefault();
    const item = e.currentTarget;
    const { arrayPath, itemIndex } = item.dataset;
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
   * Setup click handlers for navigation items
   */
  setupNavigationHandlers() {
    const tree = this.formGenerator.navigationTree;
    if (!tree) return;

    // Ensure we don't stack multiple listeners across rebuilds
    tree.removeEventListener('click', this.onTreeClick);
    tree.addEventListener('click', this.onTreeClick);
  }

  /**
   * Delegated click handler for nav tree
   */
  onTreeClick(e) {
    const navItem = e.target.closest('.form-ui-nav-item');
    if (!navItem) return;
    e.preventDefault();
    e.stopPropagation();
    try {
      console.log('[NAV][CLICK]', {
        classList: Array.from(navItem.classList),
        groupId: navItem.dataset.groupId,
        path: navItem.dataset.path,
        targetTag: e.target.tagName,
      });
    } catch {}
    const { groupId } = navItem.dataset;
    if (!groupId) return;
    if (navItem.classList.contains('form-ui-nav-item-add')) {
      // Activate corresponding optional group directly from schema path
      const path = navItem.dataset.path || groupId.replace(/^form-optional-/, '').replace(/-/g, '.');
      try {
        // Debug logs for activation
        // eslint-disable-next-line no-console
        console.log('[NAV][ADD] Clicked +Add in sidebar', { groupId, path, navItem });
      } catch { /* noop */ }
      const resolveSchemaByPath = (rootSchema, dottedPath) => {
        const tokens = dottedPath.split('.');
        let current = rootSchema;
        for (const token of tokens) {
          const normalized = this.formGenerator.normalizeSchema(current);
          if (!normalized) return null;
          const match = token.match(/^([^\[]+)(?:\[(\d+)\])?$/);
          const key = match ? match[1] : token;
          // descend into property
          current = normalized?.properties?.[key];
          if (!current) return null;
          // if an index is present, descend into array items schema
          const idxPresent = match && typeof match[2] !== 'undefined';
          if (idxPresent) {
            const curNorm = this.formGenerator.normalizeSchema(current);
            if (!curNorm || curNorm.type !== 'array') return null;
            current = this.formGenerator.derefNode(curNorm.items) || curNorm.items;
            if (!current) return null;
          }
        }
        return current;
      };
      const node = resolveSchemaByPath(this.formGenerator.schema, path);
      try {
        // eslint-disable-next-line no-console
        console.log('[NAV][ADD] Resolved schema node', { path, nodeType: this.formGenerator.normalizeSchema(node)?.type });
      } catch { /* noop */ }
      if (node) {
        this.formGenerator.onActivateOptionalGroup(path, node);
        // If activated node is array-of-objects, immediately add the first item
        const normalized = this.formGenerator.normalizeSchema(node);
        if (normalized && normalized.type === 'array') {
          if (this._autoAddedOnce.has(path)) {
            try { console.log('[NAV][ADD] Skipping auto-add (already performed)', { path }); } catch {}
          } else {
            this._autoAddedOnce.add(path);
            setTimeout(() => this._autoAddedOnce.delete(path), 500);
          }
          // Find the add button for this array within the group and click it once
          requestAnimationFrame(() => {
            // Prefer exact data-field match
            const byDataField = this.formGenerator.container.querySelector(`[data-field="${path}"] .form-ui-array-add`);
            if (byDataField) {
              const ctr = byDataField.closest('.form-ui-array-container');
              if (ctr && ctr.dataset.field === path) {
                try { console.log('[NAV][ADD] Clicking add button (data-field match)', { path }); } catch {}
                byDataField.click();
                return;
              }
            }
            // Fallback to group id selector when no data-field container is present
            const safeId = `form-group-${path.replace(/[.\[\]]/g, '-')}`;
            const byGroupId = this.formGenerator.container.querySelector(`#${safeId} .form-ui-array-add`);
            try {
              // eslint-disable-next-line no-console
              console.log('[NAV][ADD] Auto-add selection', { path, safeId, foundByDataField: !!byDataField, foundByGroupId: !!byGroupId });
              const parentArray = path.includes('[') ? path.split('[')[0] : path;
              const parentItems = this.formGenerator.container.querySelectorAll(`[data-field="${parentArray}"] .form-ui-array-items > .form-ui-array-item`).length;
              // eslint-disable-next-line no-console
              console.log('[NAV][ADD] Parent array items before add', { parentArray, count: parentItems });
            } catch { /* noop */ }
            if (byGroupId) {
              const ctr = byGroupId.closest('.form-ui-array-container');
              if (ctr && ctr.dataset.field === path) {
                try { console.log('[NAV][ADD] Clicking add button (groupId fallback)', { path }); } catch {}
                byGroupId.click();
              } else {
                try { console.warn('[NAV][ADD] Fallback add-button does not belong to path; skipping click', { path, safeId }); } catch {}
              }
            }
          });
        }
        const newGroupId = `form-group-${path.replace(/\./g, '-')}`;
        requestAnimationFrame(() => this.navigateToGroup(newGroupId));
      }
      return;
    }
    try { console.log('[NAV][GOTO]', { groupId }); } catch {}
    this.navigateToGroup(groupId);
  }

  /**
   * Highlight the active group when an input is focused
   */
  highlightActiveGroup(inputEl) {
    const groupEl = inputEl.closest('.form-ui-group');
    if (groupEl && groupEl.id) {
      this.updateActiveGroup(groupEl.id);
    }
  }

  /**
   * Clear active group highlight
   */
  clearActiveGroupHighlight() {
    this.formGenerator.groupElements.forEach((groupInfo) => {
      groupInfo.element.classList.remove('form-ui-group-active');
    });

    if (this.formGenerator.navigationTree) {
      this.formGenerator.navigationTree.querySelectorAll('.form-ui-nav-item-content.active')
        .forEach((item) => item.classList.remove('active'));
    }
  }

  /**
   * Check if any input is focused in the active group
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
