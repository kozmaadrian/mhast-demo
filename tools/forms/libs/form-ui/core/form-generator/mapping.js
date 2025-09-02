/**
 * Mapping utilities for generator refs.
 * mapFieldsToGroups: links field paths to group ids for nav/validation.
 * ensureGroupRegistry: registers groups in generator.groupElements.
 */
/**
 * Mapping utilities for FormGenerator
 * - fieldToGroup: map fields to group IDs
 * - ensureGroupRegistry: register groups into generator.groupElements
 */

export function mapFieldsToGroups(generator) {
  if (!generator?.container) return;
  generator.container.querySelectorAll('.form-ui-field[data-field-path]').forEach((field) => {
    const { fieldPath } = field.dataset;
    // Prefer mapping to the nearest array-item container when present so
    // per-item errors can be shown in the sidebar on the specific item.
    const arrayItemEl = field.closest('.form-ui-array-item[id]');
    const groupEl = arrayItemEl || field.closest('.form-ui-group');
    if (fieldPath && groupEl && groupEl.id) {
      generator.fieldToGroup.set(fieldPath, groupEl.id);
    }
  });
}

export function ensureGroupRegistry(generator) {
  if (!generator?.container) return;
  const groups = generator.container.querySelectorAll('.form-ui-group[id], .form-ui-array-item[id]');
  groups.forEach((el) => {
    const id = el.id;
    if (!generator.groupElements.has(id)) {
      // Titles for grouping (optional, can be empty; breadcrumb now schema-driven)
      const titlePath = [];
      const titleText = el.querySelector('.form-ui-group-title')?.textContent || el.querySelector('.form-ui-label')?.textContent || '';
      generator.groupElements.set(id, {
        element: el,
        path: titlePath,
        title: titleText,
        schemaPath: el.dataset?.schemaPath || '',
        isSection: false,
      });
    }
  });
}

export default { mapFieldsToGroups, ensureGroupRegistry };


