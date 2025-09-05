import BaseInput from './base-input.js';

/**
 * TextInput
 *
 * Renderer for string properties, mapping common JSON Schema `format` values
 * to appropriate HTML input types (email, url, date, etc.).
 */
export default class TextInput extends BaseInput {
  /** Map JSON Schema `format` to an HTML input type. */
  getInputType(format) {
    const map = { email: 'email', uri: 'url', url: 'url', date: 'date', 'date-time': 'datetime-local', time: 'time', password: 'password', color: 'color' };
    return map[format] || 'text';
  }

  /** Create a text-like input bound to `fieldPath` with schema hints. */
  create(fieldPath, propSchema, format) {
    const input = document.createElement('input');
    input.type = this.getInputType(format);
    input.name = fieldPath;
    input.className = 'form-ui-input';
    if (propSchema.default) input.value = propSchema.default;
    if (propSchema.placeholder) input.placeholder = propSchema.placeholder;
    if (propSchema.pattern) input.pattern = propSchema.pattern;
    if (propSchema.minLength) input.minLength = propSchema.minLength;
    if (propSchema.maxLength) input.maxLength = propSchema.maxLength;
    this.attachCommonEvents(input, fieldPath, propSchema);
    return input;
  }
}


