/**
 * FormModel
 * Encapsulates data-shape helpers used by the form generator.
 * This module extracts pure data concerns (base JSON, deepMerge, nested set, value coercion).
 */

export default class FormModel {
  constructor(schema) {
    this.schema = schema;
  }

  /**
   * Generate base JSON structure from schema with default values
   */
  generateBaseJSON(schema = this.schema) {
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
          baseData[key] = this.generateBaseJSON(propSchema);
          break;
        default:
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
   * Get a value from an input element with the same coercion used previously
   */
  getInputValue(inputEl) {
    if (!inputEl) return '';
    if (inputEl.type === 'checkbox') return inputEl.checked;
    return inputEl.value ?? '';
  }

  /**
   * Set a value in a nested object structure using dot notation
   */
  setNestedValue(obj, path, value) {
    const keys = path.split('.');
    let current = obj;

    for (let i = 0; i < keys.length - 1; i += 1) {
      const key = keys[i];
      if (!(key in current) || typeof current[key] !== 'object' || current[key] === null) {
        current[key] = {};
      }
      current = current[key];
    }

    const finalKey = keys[keys.length - 1];
    current[finalKey] = value;
  }

  /**
   * Deep merge objects, preserving the base structure
   */
  deepMerge(base, incoming) {
    const result = { ...base };

    if (!incoming || typeof incoming !== 'object') {
      return result;
    }

    Object.entries(incoming).forEach(([key, value]) => {
      if (key in result) {
        if (
          typeof result[key] === 'object' &&
          result[key] !== null &&
          !Array.isArray(result[key]) &&
          typeof value === 'object' &&
          value !== null &&
          !Array.isArray(value)
        ) {
          result[key] = this.deepMerge(result[key], value);
        } else {
          result[key] = value;
        }
      }
    });

    return result;
  }
}


