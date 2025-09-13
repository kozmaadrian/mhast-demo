/**
 * Form Commands (core)
 *
 * Factory returning high-level commands that mutate the data model and then
 * rebuild the UI, keeping validation and navigation in sync.
 * Exposes: activateOptional, addArrayItem, removeArrayItem, reorderArrayItem, resetAll.
 */

/**
 * @param {import('../form-generator.js').default} generator
 * @returns {{
 *  activateOptional(path:string):void,
 *  addArrayItem(arrayPath:string):void,
 *  removeArrayItem(arrayPath:string,index:number):void,
 *  reorderArrayItem(arrayPath:string,fromIndex:number,toIndex:number):void,
 *  resetAll():void
 * }}
 */
export default function createFormCommands(generator) {
  return {
    activateOptional(path) {
      const node = generator.model.resolveSchemaByPath(path);
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
      const node = generator.model.resolveSchemaByPath(arrayPath);
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
      const base = generator.generateBaseJSON(generator.schema);
      generator.data = base;
      generator.rebuildBody();
      generator.validation.validateAllFields();
    },
  };
}


