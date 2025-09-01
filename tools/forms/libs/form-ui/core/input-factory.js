/**
 * InputFactory
 * Creates input elements based on JSON Schema property descriptors.
 * Event handlers are injected to keep this module UI-agnostic.
 */

import FormIcons from '../utils/icons.js';
import TextInput from './inputs/text-input.js';
import TextareaInput from './inputs/textarea-input.js';
import SelectInput from './inputs/select-input.js';
import NumberInput from './inputs/number-input.js';
import CheckboxInput from './inputs/checkbox-input.js';

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
    // Compose input classes with shared handlers
    this._textInput = new TextInput(handlers);
    this._textareaInput = new TextareaInput(handlers);
    this._selectInput = new SelectInput(handlers);
    this._numberInput = new NumberInput(handlers);
    this._checkboxInput = new CheckboxInput(handlers);
  }

  create(fieldPath, propSchema) {
    const primaryType = Array.isArray(propSchema.type) ? (propSchema.type.find((t) => t !== 'null') || propSchema.type[0]) : propSchema.type;
    const { format, enum: enumValues } = propSchema;
    switch (primaryType) {
      case 'string':
        if (enumValues) return this._selectInput.create(fieldPath, enumValues, propSchema);
        if (format === 'textarea') return this._textareaInput.create(fieldPath, propSchema);
        return this._textInput.create(fieldPath, propSchema, format);
      case 'number':
      case 'integer':
        return this._numberInput.create(fieldPath, propSchema);
      case 'boolean':
        return this._checkboxInput.create(fieldPath, propSchema);
      case 'array':
        return this.createArrayInput(fieldPath, propSchema);
      case 'object':
        return null;
      default:
        return this._textInput.create(fieldPath, propSchema);
    }
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

}


