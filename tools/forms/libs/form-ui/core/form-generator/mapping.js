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
    if (!fieldPath) return;

    // Strategy:
    // 1) If the field is inside an array item AND also inside a concrete group under that item,
    //    map to that inner group (e.g., GPS Coordinates).
    // 2) Else if inside an array item, map to the array item container (e.g., Address #1).
    // 3) Else map to the nearest group container.
    const arrayItemEl = field.closest('.form-ui-array-item[id]');
    const nearestGroupEl = field.closest('.form-ui-group[id]');

    let targetId = '';
    if (arrayItemEl) {
      // Find a group within this array item specifically
      const innerGroupEl = field.closest('.form-ui-group[id]');
      const innerGroupIsWithinItem = innerGroupEl && arrayItemEl.contains(innerGroupEl) && innerGroupEl.id !== 'form-group-root';
      if (innerGroupIsWithinItem) {
        targetId = innerGroupEl.id;
      } else {
        targetId = arrayItemEl.id;
      }
    } else if (nearestGroupEl) {
      targetId = nearestGroupEl.id;
    }

    if (targetId) {
      generator.fieldToGroup.set(fieldPath, targetId);
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


