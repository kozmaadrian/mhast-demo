/**
 * Form Validation
 * Handles JSON Schema-based validation for form fields
 */

import FormIcons from '../utils/icons.js';
import { pathToGroupId } from '../core/form-generator/path-utils.js';

export default class FormValidation {
  constructor(formGenerator) {
    this.formGenerator = formGenerator;
  }

  /**
   * After form render, validate all fields once so required/invalid states are visible on load
   */
  validateAllFields() {
    // Validate visible inputs first
    this.formGenerator.fieldSchemas.forEach((schema, fieldPath) => {
      const inputEl = this.formGenerator.fieldElements.get(fieldPath) || this.formGenerator.container.querySelector(`[name="${fieldPath}"]`);
      if (inputEl) this.validateField(fieldPath, schema, inputEl, true); // Skip marker refresh during batch
    });

    // Data-driven: mark only required arrays-of-objects that are empty
    const markRequiredEmptyArrays = (node, pathPrefix = '') => {
      const normalized = this.formGenerator.normalizeSchema(this.formGenerator.derefNode(node) || node || {});
      if (!normalized || normalized.type !== 'object' || !normalized.properties) return;
      const requiredSet = new Set(normalized.required || []);
      Object.entries(normalized.properties).forEach(([key, child]) => {
        const childNode = this.formGenerator.derefNode(child) || child || {};
        const childNorm = this.formGenerator.normalizeSchema(childNode) || childNode || {};
        const propPath = pathPrefix ? `${pathPrefix}.${key}` : key;
        const isRequired = requiredSet.has(key);
        if (childNorm && childNorm.type === 'array' && isRequired) {
          const val = this.formGenerator.model.getNestedValue(this.formGenerator.data, propPath);
          if (!Array.isArray(val) || val.length === 0) {
            this.formGenerator.fieldErrors.set(pathToGroupId(propPath), 'Required list is empty.');
          } else {
            this.formGenerator.fieldErrors.delete(pathToGroupId(propPath));
          }
        }
        if (childNorm && childNorm.type === 'object' && childNorm.properties) {
          markRequiredEmptyArrays(childNorm, propPath);
        }
      });
    };
    markRequiredEmptyArrays(this.formGenerator.schema, '');
    // Update sidebar markers after all validation is complete
    this.refreshNavigationErrorMarkers();
  }

  /**
   * Validate a single field against its schema and show inline error
   */
  validateField(fieldPath, propSchema, inputEl, skipMarkerRefresh = false) {
    const value = this.formGenerator.getInputValue(inputEl);
    const error = this.getValidationError(value, propSchema, inputEl);
    this.setFieldError(inputEl, error);

    if (error) {
      this.formGenerator.fieldErrors.set(fieldPath, error);
    } else {
      this.formGenerator.fieldErrors.delete(fieldPath);
    }

    // Update sidebar error markers when field validation changes (unless batch validation)
    if (!skipMarkerRefresh) {
      this.refreshNavigationErrorMarkers();
    }

    return !error;
  }

  /**
   * Basic JSON Schema validations
   */
  getValidationError(value, schema, inputEl) {
    const isEmpty = (v) => v === '' || v === null || v === undefined;

    // required is enforced at the object level; if input has required class, treat empty as error
    const isRequired = inputEl?.classList?.contains('required');
    if (isRequired && isEmpty(value)) return 'This field is required.';

    if (isEmpty(value)) return null; // nothing else to validate

    // Type validations
    if (schema.type === 'number' || schema.type === 'integer') {
      const num = Number(value);
      if (Number.isNaN(num)) return 'Please enter a valid number.';
      if (schema.type === 'integer' && !Number.isInteger(num)) return 'Please enter a whole number.';
      if (typeof schema.minimum === 'number' && num < schema.minimum) return `Must be at least ${schema.minimum}.`;
      if (typeof schema.maximum === 'number' && num > schema.maximum) return `Must be at most ${schema.maximum}.`;
    }

    // String validations
    if (schema.type === 'string') {
      if (typeof schema.minLength === 'number' && String(value).length < schema.minLength) {
        return `Must be at least ${schema.minLength} characters.`;
      }
      if (typeof schema.maxLength === 'number' && String(value).length > schema.maxLength) {
        return `Must be at most ${schema.maxLength} characters.`;
      }
      if (schema.pattern) {
        try {
          const re = new RegExp(schema.pattern);
          if (!re.test(String(value))) return 'Invalid format.';
        } catch {
          // ignore invalid regex
        }
      }
      if (schema.format === 'email') {
        const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRe.test(String(value))) return 'Please enter a valid email address.';
      }
      if (schema.format === 'uri' || schema.format === 'url') {
        try { new URL(String(value)); } catch { return 'Please enter a valid URL.'; }
      }
    }

    // Enum validation
    if (Array.isArray(schema.enum) && schema.enum.length > 0) {
      if (!schema.enum.includes(value)) return 'Invalid value.';
    }

    return null; // no errors
  }

  /**
   * Set error state on field element
   */
  setFieldError(inputEl, message) {
    if (!inputEl) return;
    let errorEl = inputEl.parentElement?.querySelector('.form-ui-error');
    if (!errorEl) {
      errorEl = document.createElement('div');
      errorEl.className = 'form-ui-error';
      // place after input
      inputEl.insertAdjacentElement('afterend', errorEl);
    }
    if (message) {
      inputEl.classList.add('invalid');
      inputEl.setAttribute('aria-invalid', 'true');
      errorEl.textContent = message;
      errorEl.style.display = 'block';
    } else {
      inputEl.classList.remove('invalid');
      inputEl.removeAttribute('aria-invalid');
      errorEl.textContent = '';
      errorEl.style.display = 'none';
    }
  }

  /**
   * Update sidebar navigation error markers
   */
  refreshNavigationErrorMarkers() {
    if (!this.formGenerator.navigationTree) return;

    const groupIdsWithErrors = new Set();
    this.formGenerator.fieldErrors.forEach((_, key) => {
      // Keys can be either field paths or direct group IDs (e.g., from required empty groups)
      const maybeGroupId = String(key);
      if (maybeGroupId.startsWith('form-group-') || maybeGroupId.startsWith('form-array-item-')) {
        groupIdsWithErrors.add(maybeGroupId);
        return;
      }
      const mappedGroupId = this.formGenerator.fieldToGroup.get(maybeGroupId);
      if (mappedGroupId) groupIdsWithErrors.add(mappedGroupId);
    });

    this.formGenerator.navigationTree.querySelectorAll('.form-ui-nav-item').forEach((nav) => {
      // Skip non-group nav entries like "+ Add ..." items
      if (nav.classList.contains('form-ui-nav-item-add')) return;
      const navGroupId = nav.dataset?.groupId || '';
      // Only mark real groups or array-item entries; ignore activators like form-optional-*, form-add-*
      const isRealGroup = navGroupId.startsWith('form-group-') || navGroupId.startsWith('form-array-item-');
      if (!isRealGroup) return;
      const titleEl = nav.querySelector('.form-ui-nav-item-title');
      if (!titleEl) return;

      if (groupIdsWithErrors.has(navGroupId)) {
        nav.classList.add('has-error');

        // Add error indicator SVG if not already present
        if (!titleEl.querySelector('.error-indicator')) {
          const errorIcon = FormIcons.getIconSvg('triangle-alert');
          titleEl.insertAdjacentHTML('afterbegin', errorIcon);

          // Set the nav level for proper positioning
          const errorIndicator = titleEl.querySelector('.error-indicator');
          if (errorIndicator) {
            errorIndicator.style.setProperty('--nav-level', nav.dataset.level || 0);
          }
        }
      } else {
        nav.classList.remove('has-error');

        // Remove error indicator SVG if present
        const existingIcon = titleEl.querySelector('.error-indicator');
        if (existingIcon) {
          existingIcon.remove();
        }
      }
    });
  }
}
