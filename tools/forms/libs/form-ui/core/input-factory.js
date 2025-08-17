/**
 * InputFactory
 * Creates input elements based on JSON Schema property descriptors.
 * Event handlers are injected to keep this module UI-agnostic.
 */

import FormIcons from '../utils/icons.js';

export default class InputFactory {
  constructor(handlers = {}) {
    const noop = () => {};
    this.onInputOrChange = handlers.onInputOrChange || noop;
    this.onBlur = handlers.onBlur || noop;
    this.onFocus = handlers.onFocus || noop;
  }

  create(fieldPath, propSchema) {
    const primaryType = Array.isArray(propSchema.type) ? (propSchema.type.find((t) => t !== 'null') || propSchema.type[0]) : propSchema.type;
    const { format, enum: enumValues } = propSchema;
    switch (primaryType) {
      case 'string':
        if (enumValues) return this.createSelectInput(fieldPath, enumValues, propSchema);
        if (format === 'textarea') return this.createTextareaInput(fieldPath, propSchema);
        return this.createTextInput(fieldPath, propSchema, format);
      case 'number':
      case 'integer':
        return this.createNumberInput(fieldPath, propSchema);
      case 'boolean':
        return this.createCheckboxInput(fieldPath, propSchema);
      case 'array':
        return this.createArrayInput(fieldPath, propSchema);
      case 'object':
        return null;
      default:
        return this.createTextInput(fieldPath, propSchema);
    }
  }

  attachCommonEvents(el, fieldPath, schema) {
    ['input', 'change'].forEach((evt) => {
      el.addEventListener(evt, () => this.onInputOrChange(fieldPath, schema, el));
    });
    el.addEventListener('blur', () => this.onBlur(fieldPath, schema, el));
    el.addEventListener('focus', (e) => this.onFocus(fieldPath, schema, e.target));
  }

  getInputType(format) {
    const formatMap = {
      email: 'email',
      uri: 'url',
      url: 'url',
      date: 'date',
      'date-time': 'datetime-local',
      time: 'time',
      password: 'password',
    };
    return formatMap[format] || 'text';
  }

  createTextInput(fieldPath, propSchema, format) {
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

  createTextareaInput(fieldPath, propSchema) {
    const textarea = document.createElement('textarea');
    textarea.name = fieldPath;
    textarea.className = 'form-ui-textarea';
    textarea.rows = 3;
    if (propSchema.default) textarea.value = propSchema.default;
    if (propSchema.placeholder) textarea.placeholder = propSchema.placeholder;

    this.attachCommonEvents(textarea, fieldPath, propSchema);
    return textarea;
  }

  createSelectInput(fieldPath, enumValues, propSchema) {
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

  createNumberInput(fieldPath, propSchema) {
    const input = document.createElement('input');
    input.type = 'number';
    input.name = fieldPath;
    input.className = 'form-ui-input';
    if (propSchema.default !== undefined) input.value = propSchema.default;
    if (propSchema.minimum !== undefined) input.min = propSchema.minimum;
    if (propSchema.maximum !== undefined) input.max = propSchema.maximum;
    if (propSchema.type === 'integer') input.step = '1';

    this.attachCommonEvents(input, fieldPath, propSchema);
    return input;
  }

  createCheckboxInput(fieldPath, propSchema) {
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

    // Attach to the actual input control
    this.attachCommonEvents(input, fieldPath, propSchema);
    return container;
  }

  createArrayInput(fieldPath, propSchema) {
    const container = document.createElement('div');
    container.className = 'form-ui-array-container';
    container.dataset.field = fieldPath;

    const itemsContainer = document.createElement('div');
    itemsContainer.className = 'form-ui-array-items';
    container.appendChild(itemsContainer);

    const addButton = document.createElement('button');
    addButton.type = 'button';
    addButton.className = 'form-ui-array-add';
    addButton.textContent = '+ Add Item';
    addButton.addEventListener('click', () => {
      const itemContainer = document.createElement('div');
      itemContainer.className = 'form-ui-array-item';
      const itemIndexName = `${fieldPath}[${itemsContainer.children.length}]`;
      const itemInput = this.create(itemIndexName, propSchema.items || { type: 'string' });
      const removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.className = 'form-ui-remove';
      removeButton.title = 'Remove item';
      removeButton.innerHTML = FormIcons.getIconSvg('trash');
      removeButton.addEventListener('click', () => {
        if (removeButton.classList.contains('confirm-state')) {
          if (removeButton.dataset.confirmTimeoutId) {
            clearTimeout(Number(removeButton.dataset.confirmTimeoutId));
            delete removeButton.dataset.confirmTimeoutId;
          }
          itemContainer.remove();
          // Reindex remaining inputs to keep continuous indices
          Array.from(itemsContainer.querySelectorAll('.form-ui-array-item')).forEach((el, idx) => {
            el.querySelectorAll('[name]').forEach((inputEl) => {
              inputEl.name = inputEl.name.replace(/\[[0-9]+\]/, `[${idx}]`);
            });
          });
          // Treat removal as a change
          this.onInputOrChange(fieldPath, propSchema, addButton);
        } else {
          const originalHTML = removeButton.innerHTML;
          const originalTitle = removeButton.title;
          const originalClass = removeButton.className;
          removeButton.innerHTML = '✓';
          removeButton.title = 'Click to confirm removal';
          removeButton.classList.add('confirm-state');
          const timeout = setTimeout(() => {
            if (removeButton) {
              removeButton.innerHTML = originalHTML;
              removeButton.title = originalTitle;
              removeButton.className = originalClass;
              delete removeButton.dataset.confirmTimeoutId;
            }
          }, 3000);
          removeButton.dataset.confirmTimeoutId = String(timeout);
        }
      });
      itemContainer.appendChild(itemInput);
      itemContainer.appendChild(removeButton);
      itemsContainer.appendChild(itemContainer);
    });

    addButton.addEventListener('focus', (e) => this.onFocus(fieldPath, propSchema, e.target));
    container.appendChild(addButton);

    // Initialize with default items
    if (propSchema.default && Array.isArray(propSchema.default)) {
      propSchema.default.forEach((value, idx) => {
        const itemContainer = document.createElement('div');
        itemContainer.className = 'form-ui-array-item';
        const itemInput = this.create(`${fieldPath}[${idx}]`, propSchema.items || { type: 'string' });
        const inputEl = itemInput.querySelector?.('input, select, textarea') || itemInput;
        if (inputEl) inputEl.value = value;
        const removeButton = document.createElement('button');
        removeButton.type = 'button';
        removeButton.className = 'form-ui-remove';
        removeButton.title = 'Remove item';
        removeButton.innerHTML = FormIcons.getIconSvg('trash');
        removeButton.addEventListener('click', () => {
          if (removeButton.classList.contains('confirm-state')) {
            if (removeButton.dataset.confirmTimeoutId) {
              clearTimeout(Number(removeButton.dataset.confirmTimeoutId));
              delete removeButton.dataset.confirmTimeoutId;
            }
            itemContainer.remove();
            Array.from(itemsContainer.querySelectorAll('.form-ui-array-item')).forEach((el, newIdx) => {
              el.querySelectorAll('[name]').forEach((inputEl) => {
                inputEl.name = inputEl.name.replace(/\[[0-9]+\]/, `[${newIdx}]`);
              });
            });
            this.onInputOrChange(fieldPath, propSchema, addButton);
          } else {
            const originalHTML = removeButton.innerHTML;
            const originalTitle = removeButton.title;
            const originalClass = removeButton.className;
            removeButton.innerHTML = '✓';
            removeButton.title = 'Click to confirm removal';
            removeButton.classList.add('confirm-state');
            const timeout = setTimeout(() => {
              if (removeButton) {
                removeButton.innerHTML = originalHTML;
                removeButton.title = originalTitle;
                removeButton.className = originalClass;
                delete removeButton.dataset.confirmTimeoutId;
              }
            }, 3000);
            removeButton.dataset.confirmTimeoutId = String(timeout);
          }
        });
        itemContainer.appendChild(itemInput);
        itemContainer.appendChild(removeButton);
        itemsContainer.appendChild(itemContainer);
      });
    }

    return container;
  }

  // Local label formatter to avoid coupling
  formatLabel(name) {
    return name
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, (str) => str.toUpperCase())
      .replace(/_/g, ' ');
  }
}


