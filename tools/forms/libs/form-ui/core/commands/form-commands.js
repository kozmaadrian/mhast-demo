/**
 * createFormCommands(generator)
 * Returns a set of high-level commands that mutate data first, then rebuild UI.
 * Exposes: activateOptional, addArrayItem, removeArrayItem, reorderArrayItem, resetAll.
 */
/**
 * Form Commands (core)
 * Centralizes data-mutating actions for the FormGenerator orchestrator.
 */

export default function createFormCommands(generator) {
  return {
    activateOptional(path) {
      const node = generator.resolveSchemaByPath(path);
      if (!node) return;
      generator.onActivateOptionalGroup(path, node);
      const normalized = generator.normalizeSchema(node);
      if (normalized && normalized.type === 'array') {
        generator.updateData();
        let arr = generator.model.getNestedValue(generator.data, path);
        if (!Array.isArray(arr) || arr.length === 0) {
          if (!Array.isArray(arr)) arr = [];
          const baseItem = generator.createDefaultObjectFromSchema(
            generator.derefNode(normalized.items) || normalized.items || {},
          );
          generator.model.pushArrayItem(generator.data, path, baseItem);
          generator.rebuildBody();
          generator.validation.validateAllFields();
        }
      }
    },

    addArrayItem(arrayPath) {
      generator.updateData();
      const node = generator.resolveSchemaByPath(arrayPath);
      const normalized = generator.normalizeSchema(node);
      if (!normalized || normalized.type !== 'array') return;
      const baseItem = generator.createDefaultObjectFromSchema(
        generator.derefNode(normalized.items) || normalized.items || {},
      );
      generator.model.pushArrayItem(generator.data, arrayPath, baseItem);
      generator.rebuildBody();
      generator.validation.validateAllFields();
    },

    removeArrayItem(arrayPath, index) {
      generator.updateData();
      generator.model.removeArrayItem(generator.data, arrayPath, index);
      generator.rebuildBody();
      generator.validation.validateAllFields();
    },

    reorderArrayItem(arrayPath, fromIndex, toIndex) {
      generator.reorderArrayItem(arrayPath, fromIndex, toIndex);
    },

    resetAll() {
      const base = generator.renderAllGroups
        ? generator.generateBaseJSON(generator.schema)
        : generator.model.generateBaseJSON(generator.schema);
      generator.data = base;
      generator.activeOptionalGroups = new Set();
      generator.rebuildBody();
      generator.validation.validateAllFields();
    },
  };
}


