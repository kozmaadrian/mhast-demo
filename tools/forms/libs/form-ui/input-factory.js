/**
 * InputFactory
 *
 * Thin facade over an input-type registry that creates controls based on JSON
 * Schema properties, and wires standardized events via injected handlers.
 */

import FormIcons from './utils/icons.js';
import { UI_CLASS as CLASS, DATA } from './constants.js';
import { registry as createRegistry } from './inputs/index.js';
import { createAddButton } from './utils/dom-utils.js';

export default class InputFactory {
  /**
   * @param {object} context - Shared context (services, etc.)
   * @param {{
   *   onInputOrChange?:Function,
   *   onBlur?:Function,
   *   onFocus?:Function,
   *   getArrayValue?:Function,
   *   onArrayAdd?:Function,
   *   onArrayRemove?:Function,
   * }} handlers
   */
  constructor(context, handlers = {}) {
    const noop = () => {};
    this.onInputOrChange = handlers.onInputOrChange || noop;
    this.onBlur = handlers.onBlur || noop;
    this.onFocus = handlers.onFocus || noop;
    // Data-driven helpers for arrays (primitive arrays)
    this.getArrayValue = handlers.getArrayValue || (() => undefined);
    this.onArrayAdd = handlers.onArrayAdd || noop;
    this.onArrayRemove = handlers.onArrayRemove || noop;
    this.services = context?.services;
    this._registry = createRegistry(context, handlers);
  }

  /** Create an input control appropriate for the property schema. */
  create(fieldPath, propSchema) {
    const primaryType = Array.isArray(propSchema.type) ? (propSchema.type.find((t) => t !== 'null') || propSchema.type[0]) : propSchema.type;
    const { format, enum: enumValues } = propSchema;
    // Semantic type override (optional, non-breaking)
    const semantic = propSchema['x-semantic-type'];
    if (semantic) {
      switch (semantic) {
        case 'long-text':
          return this._registry.get('textarea').create(fieldPath, propSchema);
        case 'date':
          return this._registry.get('string').create(fieldPath, propSchema, 'date');
        case 'date-time':
          return this._registry.get('string').create(fieldPath, propSchema, 'date-time');
        case 'time':
          return this._registry.get('string').create(fieldPath, propSchema, 'time');
        case 'file':
          return this._registry.get('asset').create(fieldPath, propSchema);
        case 'image':
        case 'picture':
          return this._registry.get('asset')?.create(fieldPath, propSchema);
        case 'color':
          return this._registry.get('string').create(fieldPath, propSchema, 'color');
        default:
          if (typeof semantic === 'string' && semantic.startsWith('reference:')) {
            // For now, treat references as plain string inputs (ids/urls)
            return this._registry.get('string').create(fieldPath, propSchema);
          }
          // Unknown semantic type → fall through to default inference
          break;
      }
    }
    if (primaryType === 'array') return this.createArrayInput(fieldPath, propSchema);
    if (primaryType === 'object') return null;
    if (enumValues && primaryType === 'string') {
      const selectCreator = this._registry.get('select');
      return selectCreator.create(fieldPath, enumValues, propSchema);
    }
    if (primaryType === 'string' && format === 'textarea') {
      return this._registry.get('textarea').create(fieldPath, propSchema);
    }
    const creator = this._registry.get(primaryType) || this._registry.get('string');
    return creator.create(fieldPath, propSchema, format);
  }


  /**
   * Create a UI for arrays of primitives, including inline add/remove controls.
   * Arrays-of-objects are handled elsewhere (as repeatable object groups).
   */
  createArrayInput(fieldPath, propSchema) {
    const container = document.createElement('div');
    container.className = CLASS.arrayContainer;
    container.dataset[DATA.fieldPath] = fieldPath;

    const itemsContainer = document.createElement('div');
    itemsContainer.className = CLASS.arrayItems;
    container.appendChild(itemsContainer);

    const addButton = createAddButton('Add', fieldPath);
    const lastToken = fieldPath.split('.').pop();
    const baseTitle = propSchema?.title || this.services.label.formatLabel(lastToken);
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
        itemContainer.className = CLASS.arrayItem;
        const itemIndexName = `${fieldPath}[${currentLength}]`;
        const itemInput = this.create(itemIndexName, propSchema.items || { type: 'string' });
        const removeButton = document.createElement('button');
        removeButton.type = 'button';
        removeButton.className = CLASS.remove;
        removeButton.title = 'Remove item';
        removeButton.textContent = '';
        removeButton.appendChild(FormIcons.renderIcon('trash'));
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
            removeButton.textContent = '';
            removeButton.appendChild(FormIcons.renderIcon('check'));
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
        // Per-item field actions layout
        const row = document.createElement('div');
        row.className = 'form-ui-field-row';
        const main = document.createElement('div');
        main.className = 'form-ui-field-main';
        const actions = document.createElement('div');
        actions.className = 'form-ui-field-actions';
        main.appendChild(itemInput);
        actions.appendChild(removeButton);
        row.appendChild(main);
        row.appendChild(actions);
        itemContainer.appendChild(row);
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
        itemContainer.className = CLASS.arrayItem;
        const itemInput = this.create(`${fieldPath}[${idx}]`, propSchema.items || { type: 'string' });
        const inputEl = itemInput.querySelector?.('input, select, textarea') || itemInput;
        if (inputEl && typeof value !== 'undefined' && value !== null) {
          if (inputEl.type === 'checkbox') inputEl.checked = Boolean(value);
          else inputEl.value = String(value);
        }
        const removeButton = document.createElement('button');
        removeButton.type = 'button';
        removeButton.className = CLASS.remove;
        removeButton.title = 'Remove item';
        removeButton.textContent = '';
        removeButton.appendChild(FormIcons.renderIcon('trash'));
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
            removeButton.textContent = '';
            removeButton.appendChild(FormIcons.renderIcon('check'));
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
        const row = document.createElement('div');
        row.className = 'form-ui-field-row';
        const main = document.createElement('div');
        main.className = 'form-ui-field-main';
        const actions = document.createElement('div');
        actions.className = 'form-ui-field-actions';
        main.appendChild(itemInput);
        actions.appendChild(removeButton);
        row.appendChild(main);
        row.appendChild(actions);
        itemContainer.appendChild(row);
        itemsContainer.appendChild(itemContainer);
        toggleRemoveVisibility();
      });
    } else {
      // Render one blank input item when empty
      const itemContainer = document.createElement('div');
      itemContainer.className = CLASS.arrayItem;
      const itemInput = this.create(`${fieldPath}[0]`, propSchema.items || { type: 'string' });
      const removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.className = CLASS.remove;
      removeButton.title = 'Remove item';
      removeButton.textContent = '';
      removeButton.appendChild(FormIcons.renderIcon('trash'));
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
          removeButton.textContent = '';
          removeButton.appendChild(FormIcons.renderIcon('check'));
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
      const row = document.createElement('div');
      row.className = 'form-ui-field-row';
      const main = document.createElement('div');
      main.className = 'form-ui-field-main';
      const actions = document.createElement('div');
      actions.className = 'form-ui-field-actions';
      main.appendChild(itemInput);
      actions.appendChild(removeButton);
      row.appendChild(main);
      row.appendChild(actions);
      itemContainer.appendChild(row);
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


