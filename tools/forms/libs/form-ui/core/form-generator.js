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
  constructor(schema) {
    // Use schema as-is; resolve only parts on-demand to avoid deep recursion on large graphs
    this.schema = schema;
    // Data model
    this.model = new FormModel(this.schema);
    this.data = this.model.generateBaseJSON(this.schema);
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
    const keys = path.split('.');
    let cur = this.data;
    for (const k of keys) {
      if (!cur || typeof cur !== 'object' || !(k in cur)) return false;
      cur = cur[k];
    }
    // Consider arrays active only if they have elements
    if (Array.isArray(cur)) return cur.length > 0;
    // Consider existing objects active
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
        baseValue = this.model.generateBaseJSON(schemaNode);
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
  generateBaseJSON(schema) {
    if (!schema || schema.type !== 'object' || !schema.properties) {
      return {};
    }

    const baseData = {};

    Object.entries(schema.properties).forEach(([key, propSchema]) => {
      switch (propSchema.type) {
        case 'string':
          baseData[key] = propSchema.default || '';
          break;
        case 'number':
        case 'integer':
          baseData[key] = propSchema.default || 0;
          break;
        case 'boolean':
          baseData[key] = propSchema.default || false;
          break;
        case 'array':
          // Always initialize arrays to [] even if optional; multifields should serialize as empty arrays
          baseData[key] = Array.isArray(propSchema.default) ? propSchema.default : [];
          break;
        case 'object':
          // Recursively generate base structure for nested objects
          baseData[key] = this.generateBaseJSON(propSchema);
          break;
        default:
          // For unknown types or when no type is specified
          if (propSchema.enum) {
            baseData[key] = propSchema.default || '';
          } else {
            baseData[key] = propSchema.default || null;
          }
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
      const groupContainer = document.createElement('div');
      groupContainer.className = 'form-ui-group';
      groupContainer.id = `form-group-${fullPath.replace(/\./g, '-')}`;
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
      const arrayUI = this.generateInput(fullPath, propSchema);
      if (arrayUI) groupContent.appendChild(arrayUI);
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
      const container = document.createElement('div');
      container.className = 'form-ui-array-container';
      container.dataset.field = fieldPath;

      const itemsContainer = document.createElement('div');
      itemsContainer.className = 'form-ui-array-items';
      container.appendChild(itemsContainer);

      const baseTitle = this.getSchemaTitle(propSchema, fieldPath.split('.').pop());
      const addButton = document.createElement('button');
      addButton.type = 'button';
      addButton.className = 'form-ui-array-add';
      addButton.innerHTML = `${FormIcons.getIconSvg('plus')}<span>Add '${baseTitle}' Item</span>`;
      const addItemAt = (index) => {
        const itemContainer = document.createElement('div');
        itemContainer.className = 'form-ui-array-item';
        // Assign a stable ID so navigation can point to specific items
        const itemId = `form-array-item-${fieldPath.replace(/\./g, '-')}-${index}`;
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
          itemsSchema.properties || {},
          itemsSchema.required || [],
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
            itemContainer.remove();
            // Reindex remaining items' names to keep continuous indices
            Array.from(itemsContainer.querySelectorAll('.form-ui-array-item')).forEach((el, newIdx) => {
              el.querySelectorAll('[name]').forEach((inputEl) => {
                inputEl.name = inputEl.name.replace(/\[[0-9]+\]/, `[${newIdx}]`);
              });
              // Update IDs to reflect new indices
              el.id = `form-array-item-${fieldPath.replace(/\./g, '-')}-${newIdx}`;
              // Update per-item title labels to match new index
              const lbl = el.querySelector('.form-ui-separator-text .form-ui-separator-label');
              if (lbl) lbl.textContent = `${baseTitle} #${newIdx + 1}`;
            });
            this.updateData();
            // Refresh group registry and navigation to reflect item changes
            this.ensureGroupRegistry();
            if (this.navigationTree) {
              this.navigation.generateNavigationTree();
            }
            // Re-validate due to potential required fields in items
            this.validation.validateAllFields();
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

      addButton.addEventListener('click', () => {
        const index = itemsContainer.children.length;
        addItemAt(index);
        this.updateData();
        // Refresh navigation to add a child nav item for the new array entry
        if (this.navigationTree) {
          this.navigation.generateNavigationTree();
        }
        this.validation.validateAllFields();
        // After add, refresh per-item labels to maintain continuous numbering
        const baseTitle = this.getSchemaTitle(propSchema, fieldPath.split('.').pop());
        Array.from(itemsContainer.querySelectorAll('.form-ui-array-item')).forEach((el, i) => {
          const lbl = el.querySelector('.form-ui-separator-text .form-ui-separator-label');
          if (lbl) lbl.textContent = `${baseTitle} #${i + 1}`;
        });
      });
      addButton.addEventListener('focus', (e) => this.navigation.onTreeClick?.(e));
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
    const baseStructure = this.model.generateBaseJSON(this.schema);
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
    const baseStructure = this.model.generateBaseJSON(this.schema);
    this.data = this.deepMerge(baseStructure, data || {});

    if (!this.container) return;

    // Populate form fields recursively
    this.populateFormFields(this.data, '');
  }

  /**
   * Recursively populate form fields
   */
  populateFormFields(data, prefix = '') {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return;
    }

    Object.entries(data).forEach(([key, value]) => {
      const fieldName = prefix ? `${prefix}.${key}` : key;
      const field = this.container.querySelector(`[name="${fieldName}"]`);

      if (field) {
        if (field.type === 'checkbox') {
          field.checked = Boolean(value);
        } else {
          field.value = value || '';
        }
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        // Recursively populate nested objects
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
      this.data = this.model.deepMerge(this.model.generateBaseJSON(this.schema), data || {});
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

    const hyphenPath = arrayPath.replace(/\./g, '-');
    const groupId = `form-group-${hyphenPath}`;

    const itemsContainer = this.container.querySelector(`#${groupId} .form-ui-array-items`) 
      || this.container.querySelector(`[data-field="${arrayPath}"] .form-ui-array-items`);
    if (!itemsContainer) return;

    const items = Array.from(itemsContainer.querySelectorAll('.form-ui-array-item'));
    if (fromIndex < 0 || fromIndex >= items.length || toIndex < 0 || toIndex >= items.length) return;

    const node = items[fromIndex];
    const reference = items[toIndex];
    if (!node || !reference) return;

    // Move DOM node to the new position
    if (toIndex > fromIndex) {
      itemsContainer.insertBefore(node, reference.nextSibling);
    } else {
      itemsContainer.insertBefore(node, reference);
    }

    // Reindex names and IDs to match new order
    Array.from(itemsContainer.querySelectorAll('.form-ui-array-item')).forEach((el, idx) => {
      el.id = `form-array-item-${hyphenPath}-${idx}`;
      el.querySelectorAll('[name]').forEach((inputEl) => {
        inputEl.name = inputEl.name.replace(/\[[0-9]+\]/, `[${idx}]`);
      });
      const lbl = el.querySelector('.form-ui-separator-text .form-ui-separator-label');
      if (lbl) {
        const baseTitle = this.getSchemaTitle({ title: '' }, arrayPath.split('.').pop());
        lbl.textContent = `${baseTitle} #${idx + 1}`;
      }
    });

    // Update internal maps/data and refresh nav/validation
    this.updateData();
    this.ensureGroupRegistry();
    if (this.navigationTree) {
      this.navigation.generateNavigationTree();
    }
    this.validation.validateAllFields();
  }
}
