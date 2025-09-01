import BaseInput from './base-input.js';

export default class CheckboxInput extends BaseInput {
  create(fieldPath, propSchema) {
    const container = document.createElement('div');
    container.className = 'form-ui-checkbox-container';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.name = fieldPath;
    input.className = 'form-ui-checkbox';
    input.checked = propSchema.default || false;

    const label = document.createElement('label');
    label.appendChild(input);
    const fieldName = fieldPath.split('.').pop();
    label.appendChild(document.createTextNode(` ${propSchema.title || this.formatLabel(fieldName)}`));

    container.appendChild(label);

    this.attachCommonEvents(input, fieldPath, propSchema);
    return container;
  }
}
