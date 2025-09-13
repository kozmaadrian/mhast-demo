/**
 * Form Validation
 * Handles JSON Schema-based validation for form fields
 */

import { pathToGroupId } from '../form-generator/path-utils.js';

/**
 * FormValidation
 *
 * Schema-driven validation feature for the generated form.
 *
 * Responsibilities:
 * - Validate fields on input/blur using the injected `ValidationService`
 * - Maintain per-field and per-group error maps on the generator
 * - Provide UX helpers: inline error messages and nav error badges
 * - Support jumping to the first error in a group and batch validations
 */
export default class FormValidation {
  /**
   * Create a new FormValidation instance.
   * @param {object} context - Shared app context with services
   * @param {import('../form-generator.js').default} formGenerator - Owner generator
   */
  constructor(context, formGenerator) {
    this.context = context;
    this.formGenerator = formGenerator;
    this.validationService = context.services.validation;
  }

  /**
   * Scroll to and focus the first invalid control within a given group.
   * Uses generator maps to resolve the field element efficiently.
   * @param {string} groupId - Target group DOM id
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
   * Validate all fields currently rendered in the form.
   * Also computes group-level errors (e.g., empty required arrays)
   * and refreshes the navigation error markers.
   */
  validateAllFields() {
    // Validate visible inputs first
    this.formGenerator.fieldSchemas.forEach((schema, fieldPath) => {
      const inputEl = this.formGenerator.fieldElements.get(fieldPath) || this.formGenerator.container.querySelector(`[name="${fieldPath}"]`);
      if (inputEl) this.validateField(fieldPath, schema, inputEl, true); // Skip marker refresh during batch
    });

    // Data-driven: mark only required arrays-of-objects that are empty
    const paths = this.validationService.getEmptyRequiredArrayPaths(
      this.formGenerator.schema,
      this.formGenerator.data,
      {
        normalize: (node) => this.formGenerator.normalizeSchema(this.formGenerator.derefNode(node) || node || {}),
        getValue: (obj, path) => this.formGenerator.model.getNestedValue(obj, path),
      }
    );
    // Maintain group-level errors in a dedicated map
    this.formGenerator.groupErrors.clear();
    paths.forEach((p) => {
      this.formGenerator.groupErrors.set(pathToGroupId(p), 'Required list is empty.');
    });
    // Update sidebar markers after all validation is complete
    this.refreshNavigationErrorMarkers();
  }

  /**
   * Validate a single field against its property schema and update UI state.
   * @param {string} fieldPath - Dotted field path
   * @param {object} propSchema - Effective JSON Schema for this field
   * @param {HTMLElement} inputEl - Associated input element
   * @param {boolean} [skipMarkerRefresh=false] - If true, do not refresh nav markers immediately
   * @returns {boolean} True if valid, false if invalid
   */
  validateField(fieldPath, propSchema, inputEl, skipMarkerRefresh = false) {
    const value = this.formGenerator.getInputValue(inputEl);
    const error = this.validationService.getValidationError(value, propSchema, {
      required: inputEl?.classList?.contains('required'),
    });
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

  // Validation logic centralized in ValidationService

  /**
   * Set or clear inline error state for an input element.
   * @param {HTMLElement} inputEl - Input element
   * @param {string|null|undefined} message - Error message to show; falsy to clear
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
   * Update sidebar badges showing the number of errors per group.
   * Includes both field-level and group-level error counts.
   */
  refreshNavigationErrorMarkers() {
    if (!this.formGenerator.navigationTree) return;

    // Build error counts per group id (do not color labels; show badge instead)
    const errorCountByGroupId = new Map();
    // Include both field-level and group-level errors
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
    this.formGenerator.groupErrors.forEach((_, groupId) => {
      const prev = errorCountByGroupId.get(groupId) || 0;
      errorCountByGroupId.set(groupId, prev + 1);
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
        // Remove any previous error indicator icon if present
        const existingIcon = titleEl.querySelector('.error-indicator');
        if (existingIcon) existingIcon.remove();
      }
    });
  }
}
