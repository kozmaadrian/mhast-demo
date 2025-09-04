/**
 * Form Validation
 * Handles JSON Schema-based validation for form fields
 */

import { pathToGroupId } from '../core/form-generator/path-utils.js';

export default class FormValidation {
  constructor(formGenerator) {
    this.formGenerator = formGenerator;
  }

  /**
   * Scroll to the first invalid control within a given group using data-driven maps
   * (fieldErrors, fieldToGroup, fieldElements) rather than DOM queries.
   */
  scrollToFirstErrorInGroup(groupId) {
    if (!groupId) return;

    const rootGroupId = pathToGroupId('root');
    // During programmatic navigation, suppress scrollspy updates so active stays on clicked item
    try { this.formGenerator._programmaticScrollUntil = Date.now() + 1500; } catch {}
    // Special handling for root: jump to the first error among root-level primitive fields
    if (groupId === rootGroupId) {
      let targetFieldPath = null;
      for (const fieldPath of this.formGenerator.fieldElements.keys()) {
        if (!this.formGenerator.fieldErrors.has(fieldPath)) continue;
        const mapped = this.formGenerator.fieldToGroup.get(fieldPath);
        if (mapped === rootGroupId) { targetFieldPath = fieldPath; break; }
      }
      if (!targetFieldPath) return;
      try { this.formGenerator.navigation.navigateToGroup(rootGroupId); } catch {}
      const el = this.formGenerator.fieldElements.get(targetFieldPath)
        || this.formGenerator.container.querySelector(`[name="${targetFieldPath}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        try { el.focus({ preventScroll: true }); } catch {}
      }
      // Re-assert active selection and extend suppression window briefly
      try { this.formGenerator.navigation.updateActiveGroup(rootGroupId); } catch {}
      try { this.formGenerator._programmaticScrollUntil = Date.now() + 1500; } catch {}
      return;
    }

    // Determine the first field in insertion/render order that belongs to this group and has an error
    let targetFieldPath = null;
    for (const fieldPath of this.formGenerator.fieldElements.keys()) {
      if (!this.formGenerator.fieldErrors.has(fieldPath)) continue;
      const mapped = this.formGenerator.fieldToGroup.get(fieldPath);
      if (mapped === groupId) { targetFieldPath = fieldPath; break; }
    }

    // Navigate to group first (ensures section is visible)
    try { this.formGenerator.navigation.navigateToGroup(groupId); } catch {}

    if (targetFieldPath) {
      const el = this.formGenerator.fieldElements.get(targetFieldPath)
        || this.formGenerator.container.querySelector(`[name="${targetFieldPath}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        try { el.focus({ preventScroll: true }); } catch {}
        // Keep the clicked group's nav selection sticky during any ensuing scroll
        try { this.formGenerator.navigation.updateActiveGroup(groupId); } catch {}
        try { this.formGenerator._programmaticScrollUntil = Date.now() + 1500; } catch {}
        return;
      }
    }

    // If there are no field-level errors mapped to this group, but the group has a group-level error
    // (e.g., required empty array), simply keep the navigation at the group.
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
    const deref = (n) => this.formGenerator.derefNode(n) || n || {};
    const norm = (n) => this.formGenerator.normalizeSchema(deref(n)) || deref(n) || {};
    const scanRequiredEmptyArrays = (node, pathPrefix = '') => {
      const normalized = norm(node);
      if (!normalized || normalized.type !== 'object' || !normalized.properties) return;
      const requiredSet = new Set(normalized.required || []);
      Object.entries(normalized.properties).forEach(([key, child]) => {
        const childNorm = norm(child);
        const propPath = pathPrefix ? `${pathPrefix}.${key}` : key;
        const isRequired = requiredSet.has(key);
        const isArrayOfObjects = childNorm && childNorm.type === 'array' && (
          (childNorm.items && (childNorm.items.type === 'object' || childNorm.items.properties)) || !!childNorm.items?.$ref
        );
        if (isRequired && isArrayOfObjects) {
          const val = this.formGenerator.model.getNestedValue(this.formGenerator.data, propPath);
          if (!Array.isArray(val) || val.length === 0) this.formGenerator.fieldErrors.set(pathToGroupId(propPath), 'Required list is empty.');
          else this.formGenerator.fieldErrors.delete(pathToGroupId(propPath));
        }
        if (childNorm && childNorm.type === 'object' && childNorm.properties) {
          scanRequiredEmptyArrays(childNorm, propPath);
        }
      });
    };
    scanRequiredEmptyArrays(this.formGenerator.schema, '');
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

    // Build error counts per group id (do not color labels; show badge instead)
    const errorCountByGroupId = new Map();
    this.formGenerator.fieldErrors.forEach((_, key) => {
      const maybeGroupId = String(key);
      let groupId = null;
      if (maybeGroupId.startsWith('form-group-') || maybeGroupId.startsWith('form-array-item-')) {
        groupId = maybeGroupId;
      } else {
        groupId = this.formGenerator.fieldToGroup.get(maybeGroupId) || null;
      }
      if (groupId) {
        const prev = errorCountByGroupId.get(groupId) || 0;
        errorCountByGroupId.set(groupId, prev + 1);
      }
    });

    // Counts remain per-group; root shows only its own primitive-field errors

    this.formGenerator.navigationTree.querySelectorAll('.form-ui-nav-item').forEach((nav) => {
      // Skip non-group nav entries like "+ Add ..." items
      if (nav.classList.contains('form-ui-nav-item-add')) return;
      const navGroupId = nav.dataset?.groupId || '';
      // Only mark real groups or array-item entries; ignore activators like form-optional-*, form-add-*
      const isRealGroup = navGroupId.startsWith('form-group-') || navGroupId.startsWith('form-array-item-');
      if (!isRealGroup) return;
      const titleEl = nav.querySelector('.form-ui-nav-item-title');
      if (!titleEl) return;

      const count = errorCountByGroupId.get(navGroupId) || 0;
      const contentEl = nav.querySelector('.form-ui-nav-item-content');
      if (!contentEl) return;

      // Update badge based on count
      let badgeEl = contentEl.querySelector('.error-badge');
      if (count > 0) {
        nav.classList.add('has-error');
        if (!badgeEl) {
          badgeEl = document.createElement('span');
          badgeEl.className = 'error-badge';
          contentEl.appendChild(badgeEl);
        }
        badgeEl.textContent = String(count);
        badgeEl.setAttribute('aria-label', `${count} validation error${count === 1 ? '' : 's'}`);
        // Make badge interactive: click to jump to first error
        badgeEl.setAttribute('role', 'button');
        badgeEl.setAttribute('tabindex', '0');
        badgeEl.title = 'Jump to first error in this section';
        const onActivate = (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          this.scrollToFirstErrorInGroup(navGroupId);
        };
        badgeEl.onclick = onActivate;
        badgeEl.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') onActivate(e); };
      } else {
        nav.classList.remove('has-error');
        if (badgeEl) badgeEl.remove();
        // Also remove any legacy triangle icons if present
        const existingIcon = titleEl.querySelector('.error-indicator');
        if (existingIcon) existingIcon.remove();
      }
    });
  }
}
