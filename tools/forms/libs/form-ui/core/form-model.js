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
      const isRequired = Array.isArray(schema.required) && schema.required.includes(key);
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
          // Always include array keys so multifields serialize as [] when empty
          baseData[key] = Array.isArray(propSchema.default) ? propSchema.default : [];
          break;
        case 'object':
          if (propSchema.properties) {
            if (isRequired) {
              baseData[key] = this.generateBaseJSON(propSchema);
            }
            // If optional object: do not pre-populate to avoid noise.
          } else {
            baseData[key] = {};
          }
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
   * Get a value from a nested object structure using dot/bracket notation
   */
  getNestedValue(obj, path) {
    if (!obj || !path) return undefined;
    const tokens = [];
    const regex = /[^.\[\]]+|\[(\d+)\]/g;
    let match;
    while ((match = regex.exec(path)) !== null) {
      if (match[1] !== undefined) tokens.push(Number(match[1]));
      else tokens.push(match[0]);
    }
    let current = obj;
    for (const key of tokens) {
      if (current == null) return undefined;
      current = current[key];
    }
    return current;
  }

  /**
   * Set a value in a nested object structure using dot notation
   */
  setNestedValue(obj, path, value) {
    if (!path) return;
    // Support bracket notation for array indices: field[0].sub → ['field', 0, 'sub']
    const tokens = [];
    const regex = /[^.\[\]]+|\[(\d+)\]/g;
    let match;
    while ((match = regex.exec(path)) !== null) {
      if (match[1] !== undefined) {
        tokens.push(Number(match[1]));
      } else {
        tokens.push(match[0]);
      }
    }

    let current = obj;
    for (let i = 0; i < tokens.length - 1; i += 1) {
      const key = tokens[i];
      const nextKey = tokens[i + 1];
      if (typeof key === 'number') {
        if (!Array.isArray(current)) {
          // Convert current to array if not already
          // eslint-disable-next-line no-param-reassign
          current = [];
        }
        if (current[key] == null) current[key] = (typeof nextKey === 'number' ? [] : {});
        current = current[key];
      } else {
        if (!(key in current) || current[key] == null || typeof current[key] !== 'object') {
          current[key] = (typeof nextKey === 'number' ? [] : {});
        }
        current = current[key];
      }
    }
    const finalKey = tokens[tokens.length - 1];
    if (typeof finalKey === 'number') {
      if (!Array.isArray(current)) current = []; // best-effort
      current[finalKey] = value;
    } else {
      current[finalKey] = value;
    }
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
      } else {
        // Include keys that are not part of base structure (e.g., newly activated optional groups)
        result[key] = value;
      }
    });

    return result;
  }
}


