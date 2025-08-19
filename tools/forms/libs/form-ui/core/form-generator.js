/**
 * JSON Schema-driven Form Generator
 * Generates form UI from a JSON Schema.
 *
 * Responsibilities:
 * - Orchestrate schema→DOM rendering (header/body/footer)
 * - Build sections and groups via GroupBuilder
 * - Create controls via InputFactory and wire events
 * - Maintain data via FormModel
 * - Plug features: Navigation, Validation
 * - Expose maps/refs for features:
 *   groupElements, fieldSchemas, fieldElements, fieldToGroup, navigationTree
 */

import FormValidation from '../features/validation.js';
import FormNavigation from '../features/navigation.js';
import FormModel from './form-model.js';
import InputFactory from './input-factory.js';
import GroupBuilder from './group-builder.js';
import HighlightOverlay from './highlight-overlay.js';
import getControlElement from '../utils/dom-utils.js';
import FormIcons from '../utils/icons.js';

export default class FormGenerator {
  constructor(schema, options = {}) {
    // Use schema as-is; resolve only parts on-demand to avoid deep recursion on large graphs
    this.schema = schema;
    this.renderAllGroups = !!options.renderAllGroups;
    // Data model
    this.model = new FormModel(this.schema);
    this.data = this.renderAllGroups
      ? this.generateBaseJSON(this.schema)
      : this.model.generateBaseJSON(this.schema);
    this.listeners = new Set();
    this.groupCounter = 0;
    this.groupElements = new Map();
    this.navigationTree = null;
    this.fieldErrors = new Map();
    this.fieldSchemas = new Map();
    this.fieldElements = new Map();
    this.fieldToGroup = new Map();
    this.activeOptionalGroups = new Set();

    // Initialize validation and navigation
    this.validation = new FormValidation(this);
    this.navigation = new FormNavigation(this);

    // Input factory with injected handlers to preserve behavior
    this.inputFactory = new InputFactory({
      onInputOrChange: (fieldPath, propSchema, inputEl) => {
        this.updateData();
        this.validation.validateField(fieldPath, propSchema, inputEl);
      },
      onBlur: (fieldPath, propSchema, inputEl) => {
        this.validation.validateField(fieldPath, propSchema, inputEl);
      },
      onFocus: (_fieldPath, _schema, target) => {
        this.navigation.highlightActiveGroup(target);
      },
      derefNode: this.derefNode.bind(this),
      getArrayValue: (path) => this.model.getNestedValue(this.data, path),
      onArrayAdd: (path, propSchema) => {
        // Use centralized command for primitive arrays
        const itemSchema = this.derefNode(propSchema.items) || propSchema.items || { type: 'string' };
        // Determine default by type
        let defaultValue = '';
        const type = Array.isArray(itemSchema.type) ? (itemSchema.type.find((t) => t !== 'null') || itemSchema.type[0]) : itemSchema.type;
        if (type === 'number' || type === 'integer') defaultValue = 0;
        if (type === 'boolean') defaultValue = false;
        this.updateData();
        this.model.pushArrayItem(this.data, path, defaultValue);
        this.rebuildBody();
        requestAnimationFrame(() => this.validation.validateAllFields());
      },
      onArrayRemove: (path, index) => {
        // Use centralized command for primitive arrays
        this.commandRemoveArrayItem(path, index);
        requestAnimationFrame(() => this.validation.validateAllFields());
      },
    });

    // Group builder delegates DOM structuring
    this.groupBuilder = new GroupBuilder({
      inputFactory: this.inputFactory,
      formatLabel: this.formatLabel.bind(this),
      hasPrimitiveFields: this.hasPrimitiveFields.bind(this),
      generateObjectFields: this.generateObjectFields.bind(this),
      generateInput: this.generateInput.bind(this),
      generateField: this.generateField.bind(this),
      isOptionalGroupActive: this.isOptionalGroupActive.bind(this),
      onActivateOptionalGroup: this.onActivateOptionalGroup.bind(this),
      refreshNavigation: () => {
        // Re-map fields to groups and rebuild navigation tree after dynamic insertion
        this.navigation.mapFieldsToGroups();
        if (this.navigationTree) {
          this.navigation.generateNavigationTree();
        }
        // Re-run validation for newly added controls
        this.validation.validateAllFields();
      },
      derefNode: this.derefNode.bind(this),
      getSchemaTitle: this.getSchemaTitle.bind(this),
      normalizeSchema: this.normalizeSchema.bind(this),
      renderAllGroups: this.renderAllGroups,
    });

    // Visual overlay
    this.highlightOverlay = new HighlightOverlay();
  }

  /**
   * Decide if an optional nested object should be immediately rendered
   * Defaults to false unless data already has any value at that path
   */
  isOptionalGroupActive(path) {
    if (this.activeOptionalGroups.has(path)) return true;
    const cur = this.model.getNestedValue(this.data, path);
    if (Array.isArray(cur)) return cur.length > 0;
    if (cur && typeof cur === 'object') return true;
    return cur != null && cur !== '';
  }

  /**
   * Handler when user activates an optional object via "+ Add" button
   */
  onActivateOptionalGroup(path, schema) {
    
    // Mark path as active to include it in navigation
    this.activeOptionalGroups.add(path);
    // Ensure nested path exists in current data
    const schemaNode = this.normalizeSchema(schema);
    let baseValue = {};
    if (schemaNode) {
      if (schemaNode.type === 'object') {
        baseValue = this.renderAllGroups
          ? this.generateBaseJSON(schemaNode)
          : this.model.generateBaseJSON(schemaNode);
      } else if (schemaNode.type === 'array') {
        baseValue = [];
      }
    }
    
    this.setNestedValue(this.data, path, baseValue);
    // Notify listeners for data change
    this.listeners.forEach((listener) => listener(this.data));
    // Rebuild the form body to materialize the newly activated group
    
    this.rebuildBody();
  }

  /**
   * Rebuild only the form body based on current activation state and data
   */
  rebuildBody() {
    if (!this.container) return;
    const body = this.container.querySelector('.form-ui-body');
    if (!body) return;
    // Preserve current scroll position of body
    const previousScrollTop = body.scrollTop;
    // Clear maps
    this.groupElements.clear();
    this.fieldSchemas.clear();
    this.fieldElements.clear();
    this.fieldToGroup.clear();
    // Rebuild DOM
    body.innerHTML = '';
    const rootSchema = this.normalizeSchema(this.schema);
    if (rootSchema?.type === 'object' && rootSchema.properties) {
      this.groupElements = this.groupBuilder.buildInline(
        body,
        rootSchema,
        [rootSchema.title || 'Form'],
        [],
        new Map(),
      );
    }
    // Re-attach overlay anchor
    this.highlightOverlay.attach(this.container);
    // Remap fields and validate
    this.navigation.mapFieldsToGroups();
    this.ensureGroupRegistry();
    // Restore existing data into fields
    this.loadData(this.data);
    // Rebuild navigation tree
    if (this.navigationTree) {
      this.navigation.generateNavigationTree();
    }
    // Run validation after nav rebuild so markers reflect current DOM
    this.validation.validateAllFields();
    // Restore scroll
    body.scrollTop = previousScrollTop;
  }

  /**
   * Ensure any groups created via generateField (arrays-of-objects) are registered in groupElements
   */
  ensureGroupRegistry() {
    if (!this.container) return;
    const groups = this.container.querySelectorAll('.form-ui-group[id], .form-ui-array-item[id]');
    groups.forEach((el) => {
      const id = el.id;
      if (!this.groupElements.has(id)) {
        this.groupElements.set(id, {
          element: el,
          path: el.dataset.groupPath ? el.dataset.groupPath.split(' > ') : [],
          title: el.querySelector('.form-ui-group-title')?.textContent || el.querySelector('.form-ui-label')?.textContent || '',
          isSection: false,
        });
      }
    });
  }

  /**
   * Resolve a single node shallowly (on-demand) for $ref using local $defs/definitions
   */
  derefNode(node) {
    if (!node || typeof node !== 'object' || !node.$ref || typeof node.$ref !== 'string') return node;
    const root = this.schema;
    const resolvePointer = (ref) => {
      if (!ref.startsWith('#')) return null;
      let pointer = ref.slice(1);
      if (pointer.startsWith('/')) pointer = pointer.slice(1);
      if (!pointer) return root;
      const parts = pointer.split('/').map((p) => p.replace(/~1/g, '/').replace(/~0/g, '~'));
      let current = root;
      for (const part of parts) {
        if (current && typeof current === 'object' && part in current) current = current[part];
        else return null;
      }
      return current;
    };
    const target = resolvePointer(node.$ref);
    if (!target) return { ...node };
    // Merge extras over target (shallow for on-demand usage)
    const extras = Object.fromEntries(Object.entries(node).filter(([k]) => k !== '$ref'));
    return { ...target, ...extras };
  }

  getSchemaTitle(propSchema, fallbackKey) {
    const src = this.derefNode(propSchema) || propSchema;
    // Prefer explicit title on the effective schema; fallback to formatted key
    return (src && typeof src.title === 'string' && src.title.trim().length > 0)
      ? src.title
      : this.formatLabel(fallbackKey);
  }

  /**
   * Generate base JSON structure from schema with default values
   */
  generateBaseJSON(schema, seenRefs = new Set()) {
    const normalizedRoot = this.normalizeSchema(schema) || schema;
    if (!normalizedRoot || normalizedRoot.type !== 'object' || !normalizedRoot.properties) {
      return {};
    }

    const baseData = {};

    Object.entries(normalizedRoot.properties).forEach(([key, originalPropSchema]) => {
      const effective = this.normalizeSchema(originalPropSchema) || originalPropSchema;
      const refStr = originalPropSchema && originalPropSchema.$ref ? String(originalPropSchema.$ref) : null;
      if (refStr) {
        if (seenRefs.has(refStr)) {
          // Prevent cycles
          return;
        }
        seenRefs.add(refStr);
      }

      const type = Array.isArray(effective?.type)
        ? (effective.type.find((t) => t !== 'null') || effective.type[0])
        : effective?.type;

      switch (type) {
        case 'string':
          baseData[key] = effective.default || '';
          break;
        case 'number':
        case 'integer':
          baseData[key] = effective.default || 0;
          break;
        case 'boolean':
          baseData[key] = effective.default || false;
          break;
        case 'array':
          // Always initialize arrays to [] so optional arrays serialize explicitly
          baseData[key] = Array.isArray(effective.default) ? effective.default : [];
          break;
        case 'object': {
          // Recursively include all child properties
          baseData[key] = this.generateBaseJSON(effective, seenRefs);
          break;
        }
        default: {
          // If effective is a ref to an object without explicit type, try recursing
          if (effective && typeof effective === 'object' && effective.properties) {
            baseData[key] = this.generateBaseJSON(effective, seenRefs);
          } else if (effective && effective.enum) {
            baseData[key] = effective.default || '';
          } else {
            baseData[key] = effective && Object.prototype.hasOwnProperty.call(effective, 'default') ? effective.default : null;
          }
        }
      }

      if (refStr) {
        seenRefs.delete(refStr);
      }
    });

    return baseData;
  }

  /**
   * Generate form HTML from JSON schema
   */
  generateForm() {
    const container = document.createElement('div');
    container.className = 'form-ui-container';

    // Add form header (simplified - controls moved to side panel)
    const header = document.createElement('div');
    header.className = 'form-ui-header';
    header.innerHTML = `
      <div class="form-ui-title-container">
        <span class="form-ui-title">${this.schema.title || 'Form'}</span>
        <span class="form-ui-mode">Form View</span>
      </div>
    `;
    container.appendChild(header);

    // Add form body with nested groups support
    const body = document.createElement('div');
    body.className = 'form-ui-body';

    const rootSchema = this.normalizeSchema(this.schema);
    if (rootSchema.type === 'object' && rootSchema.properties) {
      // Build groups/sections via GroupBuilder to keep DOM identical
      this.groupElements = this.groupBuilder.build(
        body,
        rootSchema,
        [rootSchema.title || 'Form'],
        [],
        new Map(),
      );
      this.ensureGroupRegistry();
    }

    container.appendChild(body);

    // Add form footer with validation
    const footer = document.createElement('div');
    footer.className = 'form-ui-footer';
    footer.innerHTML = '<div class="form-ui-validation"></div>';
    container.appendChild(footer);

    // Store container reference
    this.container = container;

    // Attach overlay to the container
    this.highlightOverlay.attach(this.container);

    // Setup after groups are created
    setTimeout(() => {
      // Map fields to groups now that DOM structure is complete
      this.navigation.mapFieldsToGroups();
      this.ensureGroupRegistry();
      // Initial validation pass once in DOM
      this.validation.validateAllFields();
      // Emit initial data so consumers have a complete default JSON,
      // including empty arrays for multivalue fields
      this.updateData();
    }, 100);

    // Setup form change listeners (kept for future extensions)
    this.setupFormChangeListeners(container);

    return container;
  }

  /**
   * Generate fields for object properties
   */
  generateObjectFields(container, properties, required = [], pathPrefix = '') {
    Object.entries(properties).forEach(([key, originalPropSchema]) => {
      const propSchema = this.derefNode(originalPropSchema) || originalPropSchema;
      const field = this.generateField(key, propSchema, required.includes(key), pathPrefix);
      if (field) {
        container.appendChild(field);
      }
    });
  }

  /**
   * Generate a single form field
   */
  generateField(key, propSchema, isRequired = false, pathPrefix = '') {
    const fullPath = pathPrefix ? `${pathPrefix}.${key}` : key;

    // Special-case: arrays of objects should render as a sub-group, not a simple field
    const itemSchema = this.derefNode(propSchema?.items) || propSchema?.items;
    const isArrayOfObjects = propSchema && propSchema.type === 'array' && (
      (itemSchema && (itemSchema.type === 'object' || itemSchema.properties)) || !!propSchema.items?.$ref
    );
    if (isArrayOfObjects) {
      // Optional gating for arrays-of-objects (including nested within array items)
      if (!isRequired) {
        const insideArrayItem = /\[\d+\]/.test(fullPath);
        const shouldGate = (!this.renderAllGroups || insideArrayItem);
        if (shouldGate && !this.isOptionalGroupActive(fullPath)) {
          const placeholder = document.createElement('div');
          placeholder.className = 'form-ui-placeholder-add';
          placeholder.dataset.path = fullPath;
          const title = this.getSchemaTitle(propSchema, key);
          placeholder.textContent = `+ Add ${title}`;
          placeholder.addEventListener('click', (e) => {
            e.preventDefault(); e.stopPropagation();
            this.commandActivateOptional(fullPath);
          });
          return placeholder;
        }
      }
      const groupContainer = document.createElement('div');
      groupContainer.className = 'form-ui-group';
      groupContainer.id = `form-group-${fullPath.replace(/[.\[\]]/g, '-')}`;
      groupContainer.dataset.groupPath = fullPath;
      groupContainer.dataset.fieldPath = fullPath;
      groupContainer.dataset.required = isRequired ? 'true' : 'false';

      const groupHeader = document.createElement('div');
      groupHeader.className = 'form-ui-group-header';
      const sep = document.createElement('div');
      sep.className = 'form-ui-separator-text';
      const label = document.createElement('div');
      label.className = 'form-ui-separator-label';
      const titleSpan = document.createElement('span');
      titleSpan.className = 'form-ui-group-title';
      titleSpan.textContent = propSchema.title || this.formatLabel(key);
      label.appendChild(titleSpan);
      sep.appendChild(label);
      groupHeader.appendChild(sep);
      groupContainer.appendChild(groupHeader);

      const groupContent = document.createElement('div');
      groupContent.className = 'form-ui-group-content';
      const arrayUI = this.generateInput(fullPath, propSchema);
      const existingArr = this.model.getNestedValue(this.data, fullPath);
      const isEmpty = Array.isArray(existingArr) && existingArr.length === 0;
      if (arrayUI && !isEmpty) {
        groupContent.appendChild(arrayUI);
      } else if (isEmpty) {
        const placeholder = document.createElement('div');
        placeholder.className = 'form-ui-placeholder-add';
        placeholder.dataset.path = fullPath;
        const title = this.getSchemaTitle(propSchema, key);
        placeholder.textContent = `+ Add ${title} Item`;
        placeholder.addEventListener('click', (e) => {
          e.preventDefault(); e.stopPropagation();
          this.commandAddArrayItem(fullPath);
        });
        groupContent.appendChild(placeholder);
      }
      
      // If rendering all groups and the array is required, ensure one item is present by default
      if (this.renderAllGroups && isRequired && arrayUI) {
        const existing = this.model.getNestedValue(this.data, fullPath);
        const itemsContainer = arrayUI.querySelector?.('.form-ui-array-items');
        const addBtn = arrayUI.querySelector?.('.form-ui-array-add');
        if (Array.isArray(existing) && existing.length === 0 && itemsContainer && itemsContainer.children.length === 0 && addBtn) {
          try { addBtn.click(); } catch { /* noop */ }
        }
      }
      groupContainer.appendChild(groupContent);

      groupContainer.dataset.fieldPath = fullPath;
      return groupContainer;
    }

    // Special-case: nested object inside array items (or any object field) should render as its own inline group
    const isObjectType = !!(propSchema && (propSchema.type === 'object' || propSchema.properties));
    if (isObjectType && propSchema.properties) {
      // Optional object group gating: allow when renderAllGroups
      if (!isRequired) {
        const insideArrayItem = /\[\d+\]/.test(fullPath);
        const shouldGate = (!this.renderAllGroups || insideArrayItem);
        if (shouldGate && !this.isOptionalGroupActive(fullPath)) {
          const placeholder = document.createElement('div');
          placeholder.className = 'form-ui-placeholder-add';
          placeholder.dataset.path = fullPath;
          const title = this.getSchemaTitle(propSchema, key);
          placeholder.textContent = `+ Add ${title}`;
          placeholder.addEventListener('click', (e) => {
            e.preventDefault(); e.stopPropagation();
            this.commandActivateOptional(fullPath);
          });
          return placeholder;
        }
      }

      const groupContainer = document.createElement('div');
      groupContainer.className = 'form-ui-group';
      groupContainer.id = `form-group-${fullPath.replace(/[.\[\]]/g, '-')}`;
      groupContainer.dataset.groupPath = fullPath;

      const groupHeader = document.createElement('div');
      groupHeader.className = 'form-ui-group-header';
      const sep = document.createElement('div');
      sep.className = 'form-ui-separator-text';
      const label = document.createElement('div');
      label.className = 'form-ui-separator-label';
      const titleSpan = document.createElement('span');
      titleSpan.className = 'form-ui-group-title';
      titleSpan.textContent = propSchema.title || this.formatLabel(key);
      label.appendChild(titleSpan);
      sep.appendChild(label);
      groupHeader.appendChild(sep);
      groupContainer.appendChild(groupHeader);

      const groupContent = document.createElement('div');
      groupContent.className = 'form-ui-group-content';
      this.generateObjectFields(
        groupContent,
        propSchema.properties || {},
        propSchema.required || [],
        fullPath,
      );
      groupContainer.appendChild(groupContent);

      groupContainer.dataset.fieldPath = fullPath;
      return groupContainer;
    }

    const fieldContainer = document.createElement('div');
    fieldContainer.className = 'form-ui-field';
    fieldContainer.dataset.field = key;

    // Field label
    const label = document.createElement('label');
    label.className = 'form-ui-label';
    label.textContent = propSchema.title || this.formatLabel(key);
    if (isRequired) {
      label.classList.add('required');
      label.textContent += ' *';
    }
    fieldContainer.appendChild(label);

    // Field input
    const input = this.generateInput(fullPath, propSchema);
    if (input) {
      fieldContainer.appendChild(input);

      // If field is required, visually indicate on the input with a red border (not the label)
      if (isRequired) {
        let targetControl = null;
        // When input is a direct control element
        if (typeof input.matches === 'function' && input.matches('input, select, textarea')) {
          targetControl = input;
        } else if (typeof input.querySelector === 'function') {
          // For composed containers (e.g., checkbox/array containers)
          targetControl = input.querySelector('input, select, textarea');
        }
        if (targetControl) {
          targetControl.classList.add('required');
        }
      }

      // Track field schema and element for initial validation on load
      const controlEl = getControlElement(input);
      if (controlEl) {
        this.fieldSchemas.set(fullPath, propSchema);
        this.fieldElements.set(fullPath, controlEl);
      }

      // Field description (after input)
      if (propSchema.description) {
        const description = document.createElement('div');
        description.className = 'form-ui-description';
        description.textContent = propSchema.description;
        fieldContainer.appendChild(description);
      }

      // Store field path on container for mapping
      fieldContainer.dataset.fieldPath = fullPath;

      return fieldContainer;
    }

    // Return null if no input was generated (e.g., for objects handled as groups)
    return null;
  }

  /**
   * Generate input element based on property schema
   * @param {string} fieldPath - The full path for the field (e.g. "profile.settings.theme")
   * @param {object} propSchema - The JSON schema for this property
   */
  generateInput(fieldPath, propSchema) {
    // Special handling: arrays of objects render as repeatable object groups
    if (
      propSchema && propSchema.type === 'array'
      && (propSchema.items && (
        (propSchema.items.type === 'object')
        || (this.derefNode(propSchema.items)?.type === 'object')
        || !!propSchema.items.$ref
      ))
    ) {
      const itemsSchema = this.derefNode(propSchema.items) || propSchema.items;
      const normItemsSchema = this.normalizeSchema(itemsSchema) || itemsSchema || {};
      const container = document.createElement('div');
      container.className = 'form-ui-array-container';
      container.dataset.field = fieldPath;

      const itemsContainer = document.createElement('div');
      itemsContainer.className = 'form-ui-array-items';
      container.appendChild(itemsContainer);

      const baseTitle = this.getSchemaTitle(propSchema, fieldPath.split('.').pop());
      const addButton = document.createElement('button');
      addButton.type = 'button';
      addButton.className = 'form-ui-array-add form-ui-placeholder-add';
      addButton.innerHTML = `<span>+ Add '${baseTitle}' Item</span>`;
      const addItemAt = (index) => {
        const itemContainer = document.createElement('div');
        itemContainer.className = 'form-ui-array-item';
        // Assign a stable ID so navigation can point to specific items
        const itemId = `form-array-item-${fieldPath.replace(/[.\[\]]/g, '-')}-${index}`;
        itemContainer.id = itemId;
        // Header wrapper containing title separator and actions on one line
        const headerWrap = document.createElement('div');
        headerWrap.className = 'form-ui-array-item-header';
        const itemTitleSep = document.createElement('div');
        itemTitleSep.className = 'form-ui-separator-text';
        const itemTitleLabel = document.createElement('div');
        itemTitleLabel.className = 'form-ui-separator-label';
        itemTitleLabel.textContent = `${baseTitle} #${index + 1}`;
        itemTitleSep.appendChild(itemTitleLabel);
        headerWrap.appendChild(itemTitleSep);
        const groupContent = document.createElement('div');
        groupContent.className = 'form-ui-group-content';
        // Insert header row at the top of the content
        groupContent.appendChild(headerWrap);
        const pathPrefix = `${fieldPath}[${index}]`;
        this.generateObjectFields(
          groupContent,
          normItemsSchema.properties || {},
          normItemsSchema.required || [],
          pathPrefix,
        );
        itemContainer.appendChild(groupContent);
        // Actions container with delete + confirm flow
        const actions = document.createElement('div');
        actions.className = 'form-ui-array-item-actions';
        const removeButton = document.createElement('button');
        removeButton.type = 'button';
        removeButton.className = 'form-ui-remove';
        removeButton.title = 'Remove item';
        removeButton.innerHTML = FormIcons.getIconSvg('trash');
        removeButton.addEventListener('click', () => {
          if (removeButton.classList.contains('confirm-state')) {
            if (removeButton.dataset.confirmTimeoutId) {
              clearTimeout(Number(removeButton.dataset.confirmTimeoutId));
              delete removeButton.dataset.confirmTimeoutId;
            }
            // Use centralized command and rebuild
            this.commandRemoveArrayItem(fieldPath, index);
            requestAnimationFrame(() => this.validation.validateAllFields());
          } else {
            const originalHTML = removeButton.innerHTML;
            const originalTitle = removeButton.title;
            const originalClass = removeButton.className;
            removeButton.innerHTML = '✓';
            removeButton.title = 'Click to confirm removal';
            removeButton.classList.add('confirm-state');
            const timeout = setTimeout(() => {
              if (removeButton) {
                removeButton.innerHTML = originalHTML;
                removeButton.title = originalTitle;
                removeButton.className = originalClass;
                delete removeButton.dataset.confirmTimeoutId;
              }
            }, 3000);
            removeButton.dataset.confirmTimeoutId = String(timeout);
          }
        });

        actions.appendChild(removeButton);
        headerWrap.appendChild(actions);
        itemsContainer.appendChild(itemContainer);
        // Ensure registry includes the new item for scroll/hover sync
        this.ensureGroupRegistry();
      };

      addButton.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        // Centralized add
        this.commandAddArrayItem(fieldPath);
        // Navigate to the newly added item after rebuild
        requestAnimationFrame(() => {
          const arr = this.model.getNestedValue(this.data, fieldPath) || [];
          const newIndex = Math.max(0, arr.length - 1);
          const targetId = this.arrayItemId(fieldPath, newIndex);
          const el = this.container?.querySelector?.(`#${targetId}`);
          if (el && el.id) this.navigation.navigateToGroup(el.id);
          this.validation.validateAllFields();
        });
      });
      addButton.addEventListener('focus', (e) => this.navigation.highlightActiveGroup?.(e.target));
      container.appendChild(addButton);

      // Pre-populate items from existing data so rebuilds preserve entries
      const existing = this.model.getNestedValue(this.data, fieldPath);
      if (Array.isArray(existing)) {
        existing.forEach((_, idx) => addItemAt(idx));
      }

      return container;
    }

    // Delegate to factory (events are attached there)
    const input = this.inputFactory.create(fieldPath, propSchema);

    // On blur, factory already validates. We keep the delayed clear to preserve UX
    const controlEl = getControlElement(input);
    if (controlEl) {
      controlEl.addEventListener('blur', () => {
        setTimeout(() => {
          if (!this.navigation.isAnyInputFocusedInActiveGroup()) {
            this.navigation.clearActiveGroupHighlight();
          }
        }, 300);
      });
    }

    return input;
  }

  getInputValue(inputEl) {
    return this.model.getInputValue(inputEl);
  }

  // Legacy input creators were moved to InputFactory; intentionally removed to reduce duplication.

  /**
   * Create a default item for an array-of-objects based on its items schema
   */
  createDefaultObjectFromSchema(itemsSchema) {
    const node = this.normalizeSchema(this.derefNode(itemsSchema) || itemsSchema || {});
    if (!node || (node.type !== 'object' && !node.properties)) return {};

    const required = new Set(Array.isArray(node.required) ? node.required : []);
    const out = {};
    Object.entries(node.properties || {}).forEach(([key, prop]) => {
      const eff = this.normalizeSchema(this.derefNode(prop) || prop || {});
      const type = Array.isArray(eff.type) ? (eff.type.find((t) => t !== 'null') || eff.type[0]) : eff.type;
      switch (type) {
        case 'string':
          out[key] = eff.default || '';
          break;
        case 'number':
        case 'integer':
          out[key] = eff.default ?? 0;
          break;
        case 'boolean':
          out[key] = eff.default ?? false;
          break;
        case 'array':
          // safe to initialize as empty; UI won’t show array items until present
          out[key] = Array.isArray(eff.default) ? eff.default : [];
          break;
        case 'object':
        default: {
          const isObjectLike = eff && (eff.type === 'object' || eff.properties);
          if (isObjectLike) {
            if (required.has(key)) {
              // Include required nested objects recursively
              out[key] = this.createDefaultObjectFromSchema(eff);
            } else {
              // Skip optional nested objects so they are not auto-activated
              // Intentionally omit key
            }
          } else if (eff && eff.enum) {
            out[key] = eff.default || '';
          } else {
            out[key] = eff && Object.prototype.hasOwnProperty.call(eff, 'default') ? eff.default : null;
          }
        }
      }
    });
    return out;
  }

  // -----------------------------
  // Path/ID helpers (single source of truth)
  // -----------------------------
  hyphenatePath(path) {
    return String(path || '').replace(/[.\[\]]/g, '-');
  }
  pathToGroupId(path) {
    return `form-group-${this.hyphenatePath(path)}`;
  }
  arrayItemId(arrayPath, index) {
    return `form-array-item-${this.hyphenatePath(arrayPath)}-${index}`;
  }

  // -----------------------------
  // Schema resolve + command API
  // -----------------------------
  resolveSchemaByPath(dottedPath) {
    const tokens = String(dottedPath || '').split('.');
    let current = this.schema;
    for (const token of tokens) {
      const normalized = this.normalizeSchema(this.derefNode(current) || current);
      if (!normalized) return null;
      const match = token.match(/^([^\[]+)(?:\[(\d+)\])?$/);
      const key = match ? match[1] : token;
      current = normalized?.properties?.[key];
      if (!current) return null;
      const idxPresent = match && typeof match[2] !== 'undefined';
      if (idxPresent) {
        const curNorm = this.normalizeSchema(this.derefNode(current) || current);
        if (!curNorm || curNorm.type !== 'array') return null;
        current = this.derefNode(curNorm.items) || curNorm.items;
        if (!current) return null;
      }
    }
    return current;
  }

  commandActivateOptional(path) {
    const node = this.resolveSchemaByPath(path);
    if (!node) return;
    this.onActivateOptionalGroup(path, node);
    const normalized = this.normalizeSchema(node);
    if (normalized && normalized.type === 'array') {
      // Auto-add first item if empty per agreed rule
      this.updateData();
      let arr = this.model.getNestedValue(this.data, path);
      if (!Array.isArray(arr) || arr.length === 0) {
        if (!Array.isArray(arr)) arr = [];
        const baseItem = this.createDefaultObjectFromSchema(this.derefNode(normalized.items) || normalized.items || {});
        this.model.pushArrayItem(this.data, path, baseItem);
        this.rebuildBody();
        this.validation.validateAllFields();
      }
    }
  }

  commandAddArrayItem(arrayPath) {
    this.updateData();
    const node = this.resolveSchemaByPath(arrayPath);
    const normalized = this.normalizeSchema(node);
    if (!normalized || normalized.type !== 'array') return;
    const baseItem = this.createDefaultObjectFromSchema(this.derefNode(normalized.items) || normalized.items || {});
    this.model.pushArrayItem(this.data, arrayPath, baseItem);
    this.rebuildBody();
    this.validation.validateAllFields();
  }

  commandRemoveArrayItem(arrayPath, index) {
    this.updateData();
    this.model.removeArrayItem(this.data, arrayPath, index);
    this.rebuildBody();
    this.validation.validateAllFields();
  }

  commandReorderArrayItem(arrayPath, fromIndex, toIndex) {
    this.reorderArrayItem(arrayPath, fromIndex, toIndex);
  }

  commandResetAll() {
    const base = this.renderAllGroups
      ? this.generateBaseJSON(this.schema)
      : this.model.generateBaseJSON(this.schema);
    this.data = base;
    this.activeOptionalGroups = new Set();
    this.rebuildBody();
    this.validation.validateAllFields();
  }

  /**
   * Format field name as label
   */
  formatLabel(name) {
    return name
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, (str) => str.toUpperCase())
      .replace(/_/g, ' ');
  }

  /**
   * Update data from form
   */
  updateData() {
    const { container } = this;
    if (!container) return;

    // Start with previous data merged over base structure to keep optional branches
    const baseStructure = this.renderAllGroups
      ? this.generateBaseJSON(this.schema)
      : this.model.generateBaseJSON(this.schema);
    this.data = this.model.deepMerge(baseStructure, this.data || {});

    // Collect all form inputs and organize them into nested structure
    const inputs = container.querySelectorAll('input[name], select[name], textarea[name]');

    inputs.forEach((input) => {
      const fieldName = input.name;
      let value;

      // Get the appropriate value based on input type
      if (input.type === 'checkbox') {
        value = input.checked;
      } else if (input.type === 'number') {
        value = input.value === '' ? 0 : parseFloat(input.value) || 0;
      } else {
        value = input.value;
      }

      // Ignore synthetic array helper names like field[]; normalize to plain path
      const normalizedName = fieldName;
      // Set the value in the nested data structure
      this.model.setNestedValue(this.data, normalizedName, value);
    });

    // Post-process: prune empty placeholders from arrays of primitives (e.g., strings)
    const primitiveArrayPaths = [];
    const walkSchema = (node, prefix = '') => {
      const s = this.normalizeSchema(this.derefNode(node) || node || {});
      if (!s || s.type !== 'object' || !s.properties) return;
      Object.entries(s.properties).forEach(([key, child]) => {
        const eff = this.normalizeSchema(this.derefNode(child) || child || {});
        const path = prefix ? `${prefix}.${key}` : key;
        if (eff && eff.type === 'array') {
          const itemEff = this.normalizeSchema(this.derefNode(eff.items) || eff.items || {});
          const isObjectItems = !!(itemEff && (itemEff.type === 'object' || itemEff.properties));
          if (!isObjectItems) primitiveArrayPaths.push({ path, itemType: itemEff?.type || 'string' });
        } else if (eff && (eff.type === 'object' || eff.properties)) {
          walkSchema(eff, path);
        }
      });
    };
    walkSchema(this.schema);
    primitiveArrayPaths.forEach(({ path, itemType }) => {
      const arr = this.model.getNestedValue(this.data, path);
      if (!Array.isArray(arr)) return;
      if (itemType === 'string') {
        const filtered = arr.filter((v) => typeof v === 'string' && v !== '');
        this.model.setNestedValue(this.data, path, filtered);
      }
    });

    // Notify listeners
    this.listeners.forEach((listener) => listener(this.data));
  }

  /**
   * Set a value in a nested object structure using dot notation
   */
  setNestedValue(obj, path, value) {
    this.model.setNestedValue(obj, path, value);
  }

  /**
   * Deep merge objects, preserving the base structure
   */
  deepMerge(base, incoming) {
    return this.model.deepMerge(base, incoming);
  }

  /**
   * Load data into form
   */
  loadData(data) {
    // Merge incoming data with base structure to ensure all fields are present
    const baseStructure = this.renderAllGroups
      ? this.generateBaseJSON(this.schema)
      : this.model.generateBaseJSON(this.schema);
    this.data = this.deepMerge(baseStructure, data || {});

    if (!this.container) return;

    // Populate form fields recursively
    this.populateFormFields(this.data, '');
  }

  /**
   * Recursively populate form fields
   */
  populateFormFields(data, prefix = '') {
    if (data == null) return;

    // Handle arrays of primitives/objects
    if (Array.isArray(data)) {
      data.forEach((item, idx) => {
        const itemPrefix = `${prefix}[${idx}]`;
        if (item && typeof item === 'object') {
          this.populateFormFields(item, itemPrefix);
        } else {
          const field = this.container.querySelector(`[name="${itemPrefix}"]`);
          if (field) {
            if (field.type === 'checkbox') field.checked = Boolean(item);
            else field.value = item || '';
          }
        }
      });
      return;
    }

    // Handle plain primitives bound directly to a name
    if (typeof data !== 'object') {
      if (prefix) {
        const field = this.container.querySelector(`[name="${prefix}"]`);
        if (field) {
          if (field.type === 'checkbox') field.checked = Boolean(data);
          else field.value = data || '';
        }
      }
      return;
    }

    // Handle objects and recurse into arrays/objects
    Object.entries(data).forEach(([key, value]) => {
      const fieldName = prefix ? `${prefix}.${key}` : key;
      const field = this.container.querySelector(`[name="${fieldName}"]`);

      if (field && (value == null || typeof value !== 'object')) {
        if (field.type === 'checkbox') field.checked = Boolean(value);
        else field.value = value || '';
        return;
      }

      if (Array.isArray(value) || (value && typeof value === 'object')) {
        this.populateFormFields(value, fieldName);
      }
    });
  }

  /**
   * Add data change listener
   */
  onChange(listener) {
    this.listeners.add(listener);
  }

  /**
   * Remove data change listener
   */
  offChange(listener) {
    this.listeners.delete(listener);
  }

  /**
   * Get current form data as JSON string
   */
  getDataAsJSON() {
    return JSON.stringify(this.data, null, 2);
  }

  /**
   * Set form data from JSON string
   */
  setDataFromJSON(jsonString) {
    try {
      const data = JSON.parse(jsonString);
      this.loadData(data);
      // Ensure internal data is updated for listeners
      const base = this.renderAllGroups
        ? this.generateBaseJSON(this.schema)
        : this.model.generateBaseJSON(this.schema);
      this.data = this.model.deepMerge(base, data || {});
      return true;
    } catch (error) {
      // Keep behavior but avoid noisy console in lints; consumers can handle return value
      return false;
    }
  }

  /**
   * Generate nested groups recursively with flat layout
   */
  generateNestedGroups(container, schema, breadcrumbPath = [], schemaPath = []) {
    if (schema.type !== 'object' || !schema.properties) {
      return;
    }

    const groupTitle = schema.title || (breadcrumbPath.length > 0 ? breadcrumbPath[breadcrumbPath.length - 1] : 'Root');
    const currentPath = [...breadcrumbPath];

    // Separate object properties from primitive fields
    const primitiveFields = {};
    const nestedGroups = {};

    Object.entries(schema.properties).forEach(([key, propSchema]) => {
      if (propSchema.type === 'object' && propSchema.properties) {
        nestedGroups[key] = propSchema;
      } else {
        primitiveFields[key] = propSchema;
      }
    });

    // Only create a group if there are primitive fields to display
    if (Object.keys(primitiveFields).length > 0) {
      // Create group container
      const groupPath = schemaPath.length > 0 ? schemaPath.join('.') : 'root';
      const groupId = `form-group-${groupPath.replace(/\./g, '-')}`;
      const groupContainer = document.createElement('div');
      groupContainer.className = 'form-ui-group';
      groupContainer.id = groupId;
      groupContainer.dataset.groupPath = currentPath.join(' > ');

      // Create group header with title
      if (currentPath.length > 0) {
        const groupHeader = document.createElement('div');
        groupHeader.className = 'form-ui-group-header';

        const groupTitleElement = document.createElement('h3');
        groupTitleElement.className = 'form-ui-group-title';
        groupTitleElement.textContent = groupTitle;

        groupHeader.appendChild(groupTitleElement);
        groupContainer.appendChild(groupHeader);
      }

      // Create group content
      const groupContent = document.createElement('div');
      groupContent.className = 'form-ui-group-content';

      // Add primitive fields to current group
      const pathPrefix = schemaPath.length > 0 ? schemaPath.join('.') : '';
      this.generateObjectFields(groupContent, primitiveFields, schema.required || [], pathPrefix);

      groupContainer.appendChild(groupContent);
      container.appendChild(groupContainer);

      // Store reference for navigation
      this.groupElements.set(groupId, {
        element: groupContainer,
        path: currentPath,
        title: groupTitle,
      });
    }

    // Recursively generate nested groups as separate containers
    Object.entries(nestedGroups).forEach(([key, propSchema]) => {
      const nestedBreadcrumbPath = [...currentPath, propSchema.title || this.formatLabel(key)];
      const nestedSchemaPath = [...schemaPath, key];

      // If this nested group has no direct primitive fields, add a section title
      const hasPrimitives = this.hasPrimitiveFields(propSchema);
      const hasChildren = Object.keys(propSchema.properties || {}).length > 0;
      if (!hasPrimitives && hasChildren) {
        const sectionPath = nestedSchemaPath.join('.');
        const sectionId = `form-section-${sectionPath.replace(/\./g, '-')}`;
        const sectionContainer = document.createElement('div');
        sectionContainer.className = 'form-ui-section';
        sectionContainer.id = sectionId;
        sectionContainer.dataset.sectionPath = nestedBreadcrumbPath.join(' > ');

        const sectionHeader = document.createElement('div');
        sectionHeader.className = 'form-ui-section-header';

        const sectionTitle = document.createElement('h2');
        sectionTitle.className = 'form-ui-section-title';
        sectionTitle.textContent = propSchema.title || this.formatLabel(key);

        sectionHeader.appendChild(sectionTitle);
        sectionContainer.appendChild(sectionHeader);
        container.appendChild(sectionContainer);

        // Store reference for navigation (as a section)
        this.groupElements.set(sectionId, {
          element: sectionContainer,
          path: nestedBreadcrumbPath,
          title: propSchema.title || this.formatLabel(key),
          isSection: true,
        });
      }

      this.generateNestedGroups(container, propSchema, nestedBreadcrumbPath, nestedSchemaPath);
    });
  }

  /**
   * Setup form change listeners to update data in real-time
   */
  setupFormChangeListeners() {
    // Event listeners are now added directly when inputs are created
    // This method is kept for any additional setup needed
  }

  /**
   * Check if a schema has primitive fields (non-object properties)
   */
  hasPrimitiveFields(schema) {
    if (!schema || !schema.properties) return false;

    return Object.values(schema.properties).some((propSchema) => {
      const isObjectType = propSchema && (propSchema.type === 'object' || (Array.isArray(propSchema.type) && propSchema.type.includes('object')));
      return !isObjectType || !propSchema.properties;
    });
  }

  /**
   * Normalize schema node: deref if needed and coerce type arrays
   */
  normalizeSchema(node) {
    const s = this.derefNode(node) || node;
    if (!s || typeof s !== 'object') return s;
    const out = { ...s };
    if (Array.isArray(out.type)) {
      const primary = out.type.find((t) => t !== 'null') || out.type[0];
      out.type = primary;
    }
    return out;
  }

  /**
   * Highlight a form group and update navigation
   */
  highlightFormGroup(groupId) {
    // Remove existing highlights
    this.container.querySelectorAll('.form-ui-group, .form-ui-array-item[id]').forEach((group) => {
      group.classList.remove('highlighted');
    });

    // Remove existing overlay
    this.highlightOverlay.clear();

    // Clear all navigation active states more thoroughly
    if (this.navigationTree) {
      // Force remove active class from ALL navigation items
      this.navigationTree.querySelectorAll('.form-ui-nav-item').forEach((item) => {
        if (item.classList.contains('active')) {
          item.classList.remove('active');
        }
      });
    }

    // Add highlight to selected group
    const targetGroup = this.container.querySelector(`#${groupId}`);
    if (targetGroup) {
      targetGroup.classList.add('highlighted');

      // Create blue overlay positioned on the form body's border
      this.createBlueOverlay(targetGroup);
    }

    // Add active state to navigation item
    if (this.navigationTree) {
      const navItem = this.navigationTree.querySelector(`[data-group-id="${groupId}"]`);
      if (navItem) {
        navItem.classList.add('active');
        // Scroll the navigation item into view if it's not visible
        navItem.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
        });
      }
    }
  }

  /**
   * Create blue overlay for highlighted group
   */
  createBlueOverlay(targetGroup) {
    this.highlightOverlay.showFor(targetGroup);
  }

  /**
   * Scroll to a form group
   */
  scrollToFormGroup(groupId) {
    const targetGroup = this.container.querySelector(`#${groupId}`);
    if (!targetGroup) return;

    const bodyEl = this.container.querySelector('.form-ui-body');
    const scrollPadding = 8; // small padding from the top

    const isScrollable = (el) => !!el && el.scrollHeight > el.clientHeight;
    if (isScrollable(bodyEl)) {
      // Compute offset of the group within the scrollable body
      const getOffsetTopWithinContainer = (element, containerEl) => {
        let top = 0;
        let node = element;
        while (node && node !== containerEl) {
          top += node.offsetTop;
          node = node.offsetParent;
        }
        return top;
      };
      const top = Math.max(0, getOffsetTopWithinContainer(targetGroup, bodyEl) - scrollPadding);
      bodyEl.scrollTo({ top, behavior: 'smooth' });
      return;
    }

    // Fallback to window scroll
    const rect = targetGroup.getBoundingClientRect();
    const absoluteTop = window.pageYOffset + rect.top - scrollPadding;
    window.scrollTo({ top: absoluteTop, behavior: 'smooth' });
  }

  /**
   * Cleanup resources
   */
  destroy() {
    this.groupElements.clear();
    this.listeners.clear();
  }

  /**
   * Reorder an item inside an array-of-objects group and reindex inputs/ids.
   * @param {string} arrayPath dot path to the array field (e.g., "tutorialList")
   * @param {number} fromIndex current index of the item
   * @param {number} toIndex desired index of the item within the same array
   */
  reorderArrayItem(arrayPath, fromIndex, toIndex) {
    if (!this.container || typeof fromIndex !== 'number' || typeof toIndex !== 'number') return;
    if (fromIndex === toIndex) return;

    // Persist current edits first
    this.updateData();

    // Data-first: reorder JSON array
    this.model.reorderArray(this.data, arrayPath, fromIndex, toIndex);

    // Clear stale activation paths under this array. Presence in data will drive activation.
    const subtreePrefix = new RegExp(`^${arrayPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\[`);
    const filtered = new Set();
    this.activeOptionalGroups.forEach((p) => { if (!subtreePrefix.test(p)) filtered.add(p); });
    this.activeOptionalGroups = filtered;

    // Rebuild from data/schema so DOM and navigation reflect the new order consistently
    const hyphenPath = arrayPath.replace(/[.\[\]]/g, '-');
    const movedItemId = `form-array-item-${hyphenPath}-${toIndex}`;
    this.rebuildBody();
    requestAnimationFrame(() => {
      const el = this.container?.querySelector?.(`#${movedItemId}`);
      if (el && el.id) this.navigation.navigateToGroup(el.id);
      this.validation.validateAllFields();
    });
  }
}
