import BaseInput from './base-input.js';

export default class TextInput extends BaseInput {
  getInputType(format) {
    const map = { email: 'email', uri: 'url', url: 'url', date: 'date', 'date-time': 'datetime-local', time: 'time', password: 'password' };
    return map[format] || 'text';
  }

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


