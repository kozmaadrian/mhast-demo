/**
 * Form Navigation
 * Handles sidebar navigation, group management, and form interaction
 */

export default class FormNavigation {
  constructor(formGenerator) {
    this.formGenerator = formGenerator;
    // Single delegated handler bound once to avoid duplicate listeners
    this.onTreeClick = this.onTreeClick.bind(this);
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
  }

  /**
   * When hovering a form group in content, move the sidebar indicator to that item.
   */
  enableHoverSync() {
    if (!this.formGenerator.container || !this.formGenerator.navigationTree) return;

    const groups = this.formGenerator.container.querySelectorAll('.form-ui-group');
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
   * Generate navigation items recursively
   */
  generateNavigationItems(schema, pathPrefix = '', level = 0) {
    const items = [];

    if (schema.type !== 'object' || !schema.properties) {
      return items;
    }

    const primitiveFields = {};
    const nestedGroups = {};

    // Separate primitive fields from nested objects
    Object.entries(schema.properties).forEach(([key, propSchema]) => {
      if (propSchema.type === 'object' && propSchema.properties) {
        nestedGroups[key] = propSchema;
      } else {
        primitiveFields[key] = propSchema;
      }
    });

    // Create navigation item for current level if it has primitive fields
    if (Object.keys(primitiveFields).length > 0) {
      const groupPath = pathPrefix || 'root';
      const groupId = `form-group-${groupPath.replace(/\./g, '-')}`;
      const groupTitle = schema.title || (level === 0 ? 'Form' : this.formGenerator.formatLabel(pathPrefix.split('.').pop()));

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

    // Process nested groups
    Object.entries(nestedGroups).forEach(([key, propSchema]) => {
      const nestedPath = pathPrefix ? `${pathPrefix}.${key}` : key;

      // If this nested group has no direct primitive fields, create a section header
      const hasPrimitives = this.formGenerator.hasPrimitiveFields(propSchema);
      const hasChildren = Object.keys(propSchema.properties || {}).length > 0;
      if (!hasPrimitives && hasChildren) {
        const sectionId = `form-section-${nestedPath.replace(/\./g, '-')}`;
        const sectionTitle = propSchema.title || this.formGenerator.formatLabel(key);

        const sectionItem = document.createElement('div');
        sectionItem.className = 'form-ui-nav-item form-ui-section-title-nav';
        sectionItem.dataset.groupId = sectionId;
        // Section header should be at same level as other children
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

      // Recursively generate navigation for nested groups
      const nestedItems = this.generateNavigationItems(propSchema, nestedPath, level + 1);
      items.push(...nestedItems);
    });

    return items;
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
    const { groupId } = navItem.dataset;
    if (groupId) {
      this.navigateToGroup(groupId);
    }
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

    const focusedElement = document.activeElement;
    return activeGroup.element.contains(focusedElement)
           && (focusedElement.matches('input, select, textarea, button') || focusedElement.contentEditable === 'true');
  }
}
