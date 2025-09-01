import BaseInput from './base-input.js';

export default class NumberInput extends BaseInput {
  create(fieldPath, propSchema) {
    const input = document.createElement('input');
    input.type = (propSchema.type === 'integer') ? 'number' : 'number';
    input.name = fieldPath;
    input.className = 'form-ui-input';
    if (propSchema.default !== undefined) input.value = propSchema.default;
    if (propSchema.minimum !== undefined) input.min = propSchema.minimum;
    if (propSchema.maximum !== undefined) input.max = propSchema.maximum;
    if (propSchema.type === 'integer') input.step = '1';
    this.attachCommonEvents(input, fieldPath, propSchema);
    return input;
  }
}


