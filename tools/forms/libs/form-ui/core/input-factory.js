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
    // Data-driven helpers for arrays (primitive arrays)
    this.getArrayValue = handlers.getArrayValue || (() => undefined);
    this.onArrayAdd = handlers.onArrayAdd || noop;
    this.onArrayRemove = handlers.onArrayRemove || noop;
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
    const baseTitle = propSchema?.title || this.formatLabel(fieldPath.split('.').pop());
    addButton.innerHTML = `${FormIcons.getIconSvg('plus')}<span>Add '${baseTitle}' Item</span>`;
    // Determine if items are primitives (vs objects)
    const itemsSchema = propSchema.items || {};
    const isPrimitiveItems = !(itemsSchema && (itemsSchema.type === 'object' || (Array.isArray(itemsSchema.type) && itemsSchema.type.includes('object'))));

    addButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (isPrimitiveItems) {
        // Render one pending blank item (UI-only) and disable add until it is filled
        const currentLength = itemsContainer.querySelectorAll('.form-ui-array-item').length;
        const itemContainer = document.createElement('div');
        itemContainer.className = 'form-ui-array-item';
        const itemIndexName = `${fieldPath}[${currentLength}]`;
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
            addButton.disabled = false;
            // Reindex names after removal of pending; keep existing stable
            Array.from(itemsContainer.querySelectorAll('.form-ui-array-item')).forEach((el, idx) => {
              el.querySelectorAll('[name]').forEach((inputEl) => {
                inputEl.name = inputEl.name.replace(/\[[0-9]+\]$/, `[${idx}]`);
              });
            });
            this.onInputOrChange(fieldPath, propSchema, addButton);
          } else {
            const originalHTML = removeButton.innerHTML;
            const originalTitle = removeButton.title;
            const originalClass = removeButton.className;
            removeButton.innerHTML = FormIcons.getIconSvg('check');
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

        // Disable add until value is provided
        addButton.disabled = true;
        const ctrl = itemContainer.querySelector('input, select, textarea');
        const updateAddDisabled = () => {
          let isEmpty = true;
          if (ctrl) {
            if (ctrl.tagName === 'SELECT') isEmpty = (ctrl.value === '' || ctrl.value == null);
            else if (ctrl.type === 'checkbox') isEmpty = !ctrl.checked;
            else isEmpty = (ctrl.value === '' || ctrl.value == null);
          }
          addButton.disabled = isEmpty;
        };
        if (ctrl) ['input', 'change'].forEach((evt) => ctrl.addEventListener(evt, updateAddDisabled));
        updateAddDisabled();
      } else {
        // Arrays of objects: delegate to central command so JSON is source of truth
        this.onArrayAdd(fieldPath, propSchema);
      }
    });

    addButton.addEventListener('focus', (e) => this.onFocus(fieldPath, propSchema, e.target));
    container.appendChild(addButton);

    // Mark as primitive array when items are not objects
    if (isPrimitiveItems) container.dataset.primitive = 'true';

    // Render existing values; when none, render one blank item input
    const arr = this.getArrayValue(fieldPath);
    if (Array.isArray(arr) && arr.length > 0) {
      arr.forEach((value, idx) => {
        const itemContainer = document.createElement('div');
        itemContainer.className = 'form-ui-array-item';
        const itemInput = this.create(`${fieldPath}[${idx}]`, propSchema.items || { type: 'string' });
        const inputEl = itemInput.querySelector?.('input, select, textarea') || itemInput;
        if (inputEl && typeof value !== 'undefined' && value !== null) {
          if (inputEl.type === 'checkbox') inputEl.checked = Boolean(value);
          else inputEl.value = String(value);
        }
        const removeButton = document.createElement('button');
        removeButton.type = 'button';
        removeButton.className = 'form-ui-remove';
        removeButton.title = 'Remove item';
        removeButton.innerHTML = FormIcons.getIconSvg('trash');
        const toggleRemoveVisibility = () => {
          const total = itemsContainer.querySelectorAll('.form-ui-array-item').length;
          const ctrl = itemContainer.querySelector('input, select, textarea');
          let isBlank = true;
          if (ctrl) {
            if (ctrl.tagName === 'SELECT') isBlank = (ctrl.value === '' || ctrl.value == null);
            else if (ctrl.type === 'checkbox') isBlank = !ctrl.checked;
            else isBlank = (ctrl.value === '' || ctrl.value == null);
          }
          if (total <= 1 && isBlank) removeButton.style.visibility = 'hidden';
          else removeButton.style.visibility = 'visible';
        };
        if (inputEl && inputEl.addEventListener) {
          ['input', 'change'].forEach((evt) => inputEl.addEventListener(evt, toggleRemoveVisibility));
        }
        removeButton.addEventListener('click', () => {
          if (removeButton.classList.contains('confirm-state')) {
            if (removeButton.dataset.confirmTimeoutId) {
              clearTimeout(Number(removeButton.dataset.confirmTimeoutId));
              delete removeButton.dataset.confirmTimeoutId;
            }
            // Delegate removal to central command which rebuilds UI
            const idx = Array.from(itemsContainer.querySelectorAll('.form-ui-array-item')).indexOf(itemContainer);
            this.onArrayRemove(fieldPath, idx < 0 ? 0 : idx);
          } else {
            const originalHTML = removeButton.innerHTML;
            const originalTitle = removeButton.title;
            const originalClass = removeButton.className;
            removeButton.innerHTML = FormIcons.getIconSvg('check');
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
        toggleRemoveVisibility();
      });
    } else {
      // Render one blank input item when empty
      const itemContainer = document.createElement('div');
      itemContainer.className = 'form-ui-array-item';
      const itemInput = this.create(`${fieldPath}[0]`, propSchema.items || { type: 'string' });
      const removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.className = 'form-ui-remove';
      removeButton.title = 'Remove item';
      removeButton.innerHTML = FormIcons.getIconSvg('trash');
      const toggleRemoveVisibility = () => {
        const total = itemsContainer.querySelectorAll('.form-ui-array-item').length;
        const ctrl = itemContainer.querySelector('input, select, textarea');
        let isBlank = true;
        if (ctrl) {
          if (ctrl.tagName === 'SELECT') isBlank = (ctrl.value === '' || ctrl.value == null);
          else if (ctrl.type === 'checkbox') isBlank = !ctrl.checked;
          else isBlank = (ctrl.value === '' || ctrl.value == null);
        }
        if (total <= 1 && isBlank) removeButton.style.visibility = 'hidden';
        else removeButton.style.visibility = 'visible';
      };
      removeButton.addEventListener('click', () => {
        // Confirm, then delegate to central remove so JSON becomes [] and UI rebuilds
        if (removeButton.classList.contains('confirm-state')) {
          if (removeButton.dataset.confirmTimeoutId) {
            clearTimeout(Number(removeButton.dataset.confirmTimeoutId));
            delete removeButton.dataset.confirmTimeoutId;
          }
          this.onArrayRemove(fieldPath, 0);
        } else {
          const originalHTML = removeButton.innerHTML;
          const originalTitle = removeButton.title;
          const originalClass = removeButton.className;
          removeButton.innerHTML = FormIcons.getIconSvg('check');
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
      const ctrl = itemContainer.querySelector('input, select, textarea');
      if (ctrl && ctrl.addEventListener) {
        ['input', 'change'].forEach((evt) => ctrl.addEventListener(evt, toggleRemoveVisibility));
      }
      toggleRemoveVisibility();

      // Disable Add button until the initial blank is filled
      const updateAddDisabled = () => {
        let isEmpty = true;
        if (ctrl) {
          if (ctrl.tagName === 'SELECT') isEmpty = (ctrl.value === '' || ctrl.value == null);
          else if (ctrl.type === 'checkbox') isEmpty = !ctrl.checked;
          else isEmpty = (ctrl.value === '' || ctrl.value == null);
        }
        addButton.disabled = isEmpty;
      };
      if (ctrl && ctrl.addEventListener) {
        ['input', 'change'].forEach((evt) => ctrl.addEventListener(evt, updateAddDisabled));
      }
      updateAddDisabled();
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


