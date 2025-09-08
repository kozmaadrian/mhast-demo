import BaseInput from './base-input.js';

/**
 * NumberInput
 *
 * Renderer for numeric and integer properties using an <input type="number">.
 */
export default class NumberInput extends BaseInput {
  constructor(context, handlers = {}) { super(context, handlers); }
  /** Create a numeric input honoring min/max/step schema constraints. */
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


