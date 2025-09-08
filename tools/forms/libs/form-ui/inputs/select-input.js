import BaseInput from './base-input.js';

/**
 * SelectInput
 *
 * Renderer for string enums using a <select> control with an empty option.
 */
export default class SelectInput extends BaseInput {
  constructor(context, handlers = {}) { super(context, handlers); }
  /** Create a select control for `enumValues`, applying default selection. */
  create(fieldPath, enumValues, propSchema) {
    const select = document.createElement('select');
    select.name = fieldPath;
    select.className = 'form-ui-select';
    const emptyOption = document.createElement('option');
    emptyOption.value = '';
    emptyOption.textContent = '-- Select --';
    select.appendChild(emptyOption);
    enumValues.forEach((value) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      if (propSchema.default === value) option.selected = true;
      select.appendChild(option);
    });
    this.attachCommonEvents(select, fieldPath, propSchema);
    return select;
  }
}


