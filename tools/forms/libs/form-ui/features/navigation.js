/**
 * Navigation feature
 * Builds the sidebar tree, maintains active/hover states and scroll syncing,
 * and delegates clicks to navigate and activate optional groups.
 */
import { getDeepActiveElement } from '../utils/dom-utils.js';
import { UI_CLASS as CLASS } from '../core/constants.js';
import { pathToGroupId, arrayItemId, hyphenatePath } from '../core/form-generator/path-utils.js';

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
    this._hoverHandler = null;
    this._contentClickHandler = null;
    this._onScrollHandler = null;
    this._onResizeHandler = null;
  }

  /**
   * Map fields to their groups after the group structure is built
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
    this.formGenerator.navigationTree.querySelectorAll(`.${CLASS.navItemContent}.active`)
      .forEach((item) => item.classList.remove('active'));

    // Add active state to current item
    const activeNavItem = this.formGenerator.navigationTree.querySelector(`[data-group-id="${activeGroupId}"] .${CLASS.navItemContent}`);
    if (activeNavItem) {
      activeNavItem.classList.add('active');

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

    // Preserve current scroll position to avoid jumping to top on re-render
    const treeEl = this.formGenerator.navigationTree;
    const prevScrollTop = treeEl.scrollTop;

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

    // Restore prior scroll position after layout is updated
    requestAnimationFrame(() => {
      const maxTop = Math.max(0, treeEl.scrollHeight - treeEl.clientHeight);
      treeEl.scrollTop = Math.min(prevScrollTop, maxTop);
    });
  }

  /**
   * When hovering a form group in content, move the sidebar indicator to that item.
   */
  enableHoverSync() {
    if (!this.formGenerator.container || !this.formGenerator.navigationTree) return;

    const groups = this.formGenerator.container.querySelectorAll(`.${CLASS.group}, .${CLASS.arrayItem}[id]`);
    const handleMouseEnter = (e) => {
      const group = e.currentTarget;
      const groupId = group.id;
      if (!groupId) return;
      // Update nav indicator to hovered group without changing persistent active state
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
    const bodyEl = this.formGenerator?.container?.querySelector?.(`.${CLASS.body}`) || null;
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
      const groupId = this.formGenerator.pathToGroupId(groupPath);
      const groupTitle = normalized.title || (level === 0 ? 'Form' : this.formGenerator.formatLabel(pathPrefix.split('.').pop()));

      const navItem = document.createElement('div');
      navItem.className = CLASS.navItem;
      navItem.dataset.groupId = groupId;
      navItem.dataset.level = level;

      const navContent = document.createElement('div');
      navContent.className = CLASS.navItemContent;
      navContent.style.setProperty('--nav-level', level);

      const navTitle = document.createElement('span');
      navTitle.className = CLASS.navItemTitle;
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
      const isActive = this.formGenerator.renderAllGroups
        || !isOptional
        || !requiresActivation
        || this.formGenerator.isOptionalGroupActive(nestedPath);
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
        const groupId = this.formGenerator.pathToGroupId(nestedPath);
        const navItem = document.createElement('div');
        navItem.className = CLASS.navItem;
        navItem.dataset.groupId = groupId;
        navItem.dataset.level = level + 1;

        const content = document.createElement('div');
        content.className = CLASS.navItemContent;
        content.style.setProperty('--nav-level', level + 1);

        const titleEl = document.createElement('span');
        titleEl.className = CLASS.navItemTitle;
        titleEl.textContent = this.formGenerator.getSchemaTitle(derefProp, key);

        content.appendChild(titleEl);
        navItem.appendChild(content);
        items.push(navItem);

        // Child items: one entry per existing array item in the form
        const dataArray = this.formGenerator.model.getNestedValue(this.formGenerator.data, nestedPath) || [];
        if (Array.isArray(dataArray)) {
          
          dataArray.forEach((_, idx) => {
            // Each item gets a child nav node with its own anchor to the item container
            const itemNav = document.createElement('div');
            itemNav.className = CLASS.navItem;
            itemNav.classList.add(CLASS.navItemArrayChild);
            itemNav.dataset.groupId = this.formGenerator.arrayItemId(nestedPath, idx);
            itemNav.dataset.level = level + 2;
            itemNav.dataset.arrayPath = nestedPath;
            itemNav.dataset.itemIndex = String(idx);
            itemNav.draggable = true;

            const itemContent = document.createElement('div');
            itemContent.className = CLASS.navItemContent;
            itemContent.style.setProperty('--nav-level', level + 2);

            const itemTitle = document.createElement('span');
            itemTitle.className = CLASS.navItemTitle;
            itemTitle.textContent = `${this.formGenerator.getSchemaTitle(derefProp, key)} #${idx + 1}`;

            itemContent.appendChild(itemTitle);
            itemNav.appendChild(itemContent);
            // Attach drag handlers
            itemNav.addEventListener('dragstart', this.onItemDragStart);
            itemNav.addEventListener('dragover', this.onItemDragOver);
            itemNav.addEventListener('drop', this.onItemDrop);
            items.push(itemNav);

            // Inspect the item schema for nested arrays-of-objects and nested objects (e.g., link/dataRef/questionnaire)
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
              const childIsObject = !!(childProp && (childProp.type === 'object' || childProp.properties));
              if (!childIsArrayOfObjects && !childHasRef && !childIsObject) continue;

              const childPath = `${nestedPath}[${idx}].${childKey}`;
              const childOptional = !itemRequired.has(childKey);
              // Inside array items, do NOT auto-activate optional objects based on renderAllGroups.
              // Only show when required or explicitly active (data present or toggled).
              const childActive = (!childOptional)
                || this.formGenerator.isOptionalGroupActive(childPath);

              if (!childActive) {
                // Show an add option for the nested array under this item
                const addChild = document.createElement('div');
                addChild.className = `${CLASS.navItem} ${CLASS.navItemAdd}`;
                addChild.dataset.groupId = `form-optional-${hyphenatePath(childPath)}`;
                addChild.dataset.path = childPath;
                addChild.dataset.level = level + 3;
                const addContent = document.createElement('div');
                addContent.className = `${CLASS.navItemContent} ${CLASS.navItemAddContent}`;
                addContent.style.setProperty('--nav-level', level + 3);
                const addTitle = document.createElement('span');
                addTitle.className = `${CLASS.navItemTitle} ${CLASS.navItemAddTitle}`;
                addTitle.textContent = `+ Add ${this.formGenerator.getSchemaTitle(childProp, childKey)}`;
                addContent.appendChild(addTitle);
                addChild.appendChild(addContent);
                items.push(addChild);
                continue;
              }

              // Render nested object-or-array-of-objects under this item without duplicating objects
              const childGroupId = this.formGenerator.pathToGroupId(childPath);
              if (childIsArrayOfObjects) {
                const childNav = document.createElement('div');
                childNav.className = CLASS.navItem;
                childNav.dataset.groupId = childGroupId;
                childNav.dataset.level = level + 3;
                const childContent = document.createElement('div');
                childContent.className = CLASS.navItemContent;
                childContent.style.setProperty('--nav-level', level + 3);
                const childTitle = document.createElement('span');
                childTitle.className = CLASS.navItemTitle;
                childTitle.textContent = this.formGenerator.getSchemaTitle(childProp, childKey);
                childContent.appendChild(childTitle);
                childNav.appendChild(childContent);
                items.push(childNav);
              } else if (childIsObject) {
                // For nested objects, rely on recursive generation to avoid duplicate entry
                const nestedChildItems = this.generateNavigationItems(childProp, childPath, level + 3);
                items.push(...nestedChildItems);
              }

              // Add entries for each nested array item (data-driven)
              const childDataArray = this.formGenerator.model.getNestedValue(this.formGenerator.data, childPath) || [];
              if (Array.isArray(childDataArray)) {
                
                childDataArray.forEach((_, cidx) => {
                  const childItemNav = document.createElement('div');
                  childItemNav.className = CLASS.navItem;
                  childItemNav.classList.add(CLASS.navItemArrayChild);
                  childItemNav.dataset.groupId = this.formGenerator.arrayItemId(childPath, cidx);
                  childItemNav.dataset.level = level + 4;
                  childItemNav.dataset.arrayPath = childPath;
                  childItemNav.dataset.itemIndex = String(cidx);
                  childItemNav.draggable = true;

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
          const sectionId = `form-section-${this.formGenerator.hyphenatePath(nestedPath)}`;
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
    const navItem = e.target.closest(`.${CLASS.navItem}`);
    if (!navItem) return;
    e.preventDefault();
    e.stopPropagation();
    
    const { groupId } = navItem.dataset;
    if (!groupId) return;
    if (navItem.classList.contains(CLASS.navItemAdd)) {
      // Activate corresponding optional group directly from schema path
      const path = navItem.dataset.path || groupId.replace(/^form-optional-/, '').replace(/-/g, '.');
      
      // Use centralized command to activate; it will auto-add first array item if empty
      this.formGenerator.commandActivateOptional(path);
      // After activation, navigate accordingly
      requestAnimationFrame(() => {
        const value = this.formGenerator.model.getNestedValue(this.formGenerator.data, path);
        if (Array.isArray(value) && value.length > 0) {
          const id = this.formGenerator.arrayItemId(path, 0);
          const el = this.formGenerator.container?.querySelector?.(`#${id}`);
          if (el && el.id) this.navigateToGroup(el.id);
        } else {
          const gid = this.formGenerator.pathToGroupId(path);
          this.navigateToGroup(gid);
        }
        this.formGenerator.validation.validateAllFields();
      });
      return;
    }
    
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
