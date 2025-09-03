/**
 * FormGenerator
 * Orchestrates schema→DOM rendering, data collection/mutation, and feature hooks.
 * Responsibilities:
 * - Build form structure (via GroupBuilder and renderers) from JSON Schema
 * - Create inputs (via InputFactory) and wire standard events
 * - Maintain maps/refs (groupElements, fieldSchemas, fieldElements, fieldToGroup)
 * - Own the current data object; expose command API for structural changes
 * - Delegate lifecycle steps to core/form-generator/lifecycle.js
 */
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
import GroupBuilder from './form-generator/group-builder.js';
import HighlightOverlay from '../features/highlight-overlay.js';
import getControlElement from '../utils/dom-utils.js';
import { renderField } from './renderers/field-renderer.js';
import FormIcons from '../utils/icons.js';
import { generateForm as lifecycleGenerateForm, rebuildBody as lifecycleRebuildBody } from './form-generator/lifecycle.js';
import createFormCommands from './commands/form-commands.js';
import { hyphenatePath as utilHyphenatePath, pathToGroupId as utilPathToGroupId, arrayItemId as utilArrayItemId } from './form-generator/path-utils.js';
import { derefNode as derefUtil, normalizeSchema as normalizeUtil, getSchemaTitle as getTitleUtil, generateBaseJSON as genBaseJsonUtil } from './form-generator/schema-utils.js';
import { createAddPlaceholder } from './form-generator/placeholders.js';
import createArrayGroupUI from './form-generator/input-array-group.js';

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
    this.activeSchemaPath = '';
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

    // Compose command API
    this.commands = createFormCommands(this);
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
    return lifecycleRebuildBody(this);
  }

  /**
   * Ensure any groups created via generateField (arrays-of-objects) are registered in groupElements
   */
  ensureGroupRegistry() {
    // Kept for backward compatibility; lifecycle uses mapping.ensureGroupRegistry
    if (!this.container) return;
    const groups = this.container.querySelectorAll('.form-ui-group[id], .form-ui-array-item[id]');
    groups.forEach((el) => {
      const id = el.id;
      if (!this.groupElements.has(id)) {
        this.groupElements.set(id, {
          element: el,
          path: [],
          title: el.querySelector('.form-ui-group-title')?.textContent || el.querySelector('.form-ui-label')?.textContent || '',
          schemaPath: el.dataset?.schemaPath || '',
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
    return getTitleUtil(this.schema, propSchema, fallbackKey || '');
  }

  /**
   * Generate base JSON structure from schema with default values
   */
  generateBaseJSON(schema, seenRefs = new Set()) { return genBaseJsonUtil(this.schema, schema, seenRefs); }

  /**
   * Generate form HTML from JSON schema
   */
  generateForm() {
    
    return lifecycleGenerateForm(this);
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
    return renderField(this, key, propSchema, isRequired, pathPrefix);
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
      return createArrayGroupUI(this, fieldPath, propSchema);
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
  hyphenatePath(path) { return utilHyphenatePath(path); }
  pathToGroupId(path) { return utilPathToGroupId(path); }
  arrayItemId(arrayPath, index) { return utilArrayItemId(arrayPath, index); }

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

  commandActivateOptional(path) { this.commands.activateOptional(path); }

  commandAddArrayItem(arrayPath) { this.commands.addArrayItem(arrayPath); }

  commandRemoveArrayItem(arrayPath, index) { this.commands.removeArrayItem(arrayPath, index); }

  commandReorderArrayItem(arrayPath, fromIndex, toIndex) { this.commands.reorderArrayItem(arrayPath, fromIndex, toIndex); }

  commandResetAll() { this.commands.resetAll(); }

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

    // Post-process: prune empty entries from primitive arrays at any depth, including
    // arrays nested within arrays-of-objects. This keeps JSON free of empty strings.
    const prunePrimitiveArrays = (schemaNode, pathPrefix = '') => {
      const s = this.normalizeSchema(this.derefNode(schemaNode) || schemaNode || {});
      if (!s) return;
      if (s.type === 'object' && s.properties) {
        Object.entries(s.properties).forEach(([key, child]) => {
          const eff = this.normalizeSchema(this.derefNode(child) || child || {});
          const childPath = pathPrefix ? `${pathPrefix}.${key}` : key;
          if (!eff) return;
          if (eff.type === 'array') {
            const itemEff = this.normalizeSchema(this.derefNode(eff.items) || eff.items || {});
            const dataArr = this.model.getNestedValue(this.data, childPath);
            if (Array.isArray(dataArr)) {
              const isObjectItems = !!(itemEff && (itemEff.type === 'object' || itemEff.properties));
              if (isObjectItems) {
                // Recurse for each object in array
                for (let i = 0; i < dataArr.length; i += 1) {
                  prunePrimitiveArrays(itemEff, `${childPath}[${i}]`);
                }
              } else {
                // Primitive array: remove empty-string entries
                const itemType = itemEff?.type || 'string';
                if (itemType === 'string') {
                  const filtered = dataArr.filter((v) => !(v == null || v === ''));
                  this.model.setNestedValue(this.data, childPath, filtered);
                }
              }
            }
          } else if (eff.type === 'object' || eff.properties) {
            prunePrimitiveArrays(eff, childPath);
          }
        });
      } else if (s.type === 'array') {
        const itemEff = this.normalizeSchema(this.derefNode(s.items) || s.items || {});
        const dataArr = this.model.getNestedValue(this.data, pathPrefix);
        if (Array.isArray(dataArr)) {
          const isObjectItems = !!(itemEff && (itemEff.type === 'object' || itemEff.properties));
          if (isObjectItems) {
            for (let i = 0; i < dataArr.length; i += 1) {
              prunePrimitiveArrays(itemEff, `${pathPrefix}[${i}]`);
            }
          } else {
            const itemType = itemEff?.type || 'string';
            if (itemType === 'string') {
              const filtered = dataArr.filter((v) => !(v == null || v === ''));
              this.model.setNestedValue(this.data, pathPrefix, filtered);
            }
          }
        }
      }
    };
    prunePrimitiveArrays(this.schema, '');

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


  // setupFormChangeListeners removed; input listeners are attached in factories

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
    return normalizeUtil(this.schema, node);
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
    const scrollPadding = (this._headerOffset || 0); // account for sticky header/breadcrumb

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
    try { this.navigation?.destroy?.(); } catch { /* noop */ }
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
    const movedItemId = this.arrayItemId(arrayPath, toIndex);
    this.rebuildBody();
    requestAnimationFrame(() => {
      const el = this.container?.querySelector?.(`#${movedItemId}`);
      if (el && el.id) this.navigation.navigateToGroup(el.id);
      this.validation.validateAllFields();
    });
  }
}
