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

export default class FormGenerator {
  constructor(schema) {
    this.schema = schema;
    // Data model
    this.model = new FormModel(schema);
    this.data = this.model.generateBaseJSON(schema);
    this.listeners = new Set();
    this.groupCounter = 0;
    this.groupElements = new Map();
    this.navigationTree = null;
    this.fieldErrors = new Map();
    this.fieldSchemas = new Map();
    this.fieldElements = new Map();
    this.fieldToGroup = new Map();

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
    });

    // Group builder delegates DOM structuring
    this.groupBuilder = new GroupBuilder({
      inputFactory: this.inputFactory,
      formatLabel: this.formatLabel.bind(this),
      hasPrimitiveFields: this.hasPrimitiveFields.bind(this),
      generateObjectFields: this.generateObjectFields.bind(this),
    });

    // Visual overlay
    this.highlightOverlay = new HighlightOverlay();
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
          baseData[key] = propSchema.default || [];
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

    if (this.schema.type === 'object' && this.schema.properties) {
      // Build groups/sections via GroupBuilder to keep DOM identical
      this.groupElements = this.groupBuilder.build(
        body,
        this.schema,
        [this.schema.title || 'Form'],
        [],
        new Map(),
      );
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
      // Initial validation pass once in DOM
      this.validation.validateAllFields();
    }, 100);

    // Setup form change listeners (kept for future extensions)
    this.setupFormChangeListeners(container);

    return container;
  }

  /**
   * Generate fields for object properties
   */
  generateObjectFields(container, properties, required = [], pathPrefix = '') {
    Object.entries(properties).forEach(([key, propSchema]) => {
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
    const fullPath = pathPrefix ? `${pathPrefix}.${key}` : key;
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

    // Start with base structure
    const baseStructure = this.model.generateBaseJSON(this.schema);
    this.data = { ...baseStructure };

    // Collect all form inputs and organize them into nested structure
    const inputs = container.querySelectorAll('input, select, textarea');

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

      // Set the value in the nested data structure
      this.model.setNestedValue(this.data, fieldName, value);
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
    if (!schema.properties) return false;

    return Object.values(schema.properties).some((propSchema) => propSchema.type !== 'object' || !propSchema.properties);
  }

  /**
   * Highlight a form group and update navigation
   */
  highlightFormGroup(groupId) {
    // Remove existing highlights
    this.container.querySelectorAll('.form-ui-group').forEach((group) => {
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
    if (targetGroup) {
      // Use center positioning with negative scroll margin
      targetGroup.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }

  /**
   * Cleanup resources
   */
  destroy() {
    this.groupElements.clear();
    this.listeners.clear();
  }
}
