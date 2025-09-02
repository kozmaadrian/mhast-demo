/**
 * field-renderer
 * Renders a single field (primitive/object/array-of-objects group placeholder),
 * delegating input creation to InputFactory and applying UI_CLASS constants.
 */
import getControlElement from '../../utils/dom-utils.js';
import { UI_CLASS as CLASS } from '../constants.js';
import { pathToGroupId, hyphenatePath } from '../form-generator/path-utils.js';

export function renderField(formGenerator, key, propSchema, isRequired = false, pathPrefix = '') {
  const fullPath = pathPrefix ? `${pathPrefix}.${key}` : key;

  // Special-case: arrays of objects should render as a sub-group, not a simple field
  const itemSchema = formGenerator.derefNode(propSchema?.items) || propSchema?.items;
  const isArrayOfObjects = propSchema && propSchema.type === 'array' && (
    (itemSchema && (itemSchema.type === 'object' || itemSchema.properties)) || !!propSchema.items?.$ref
  );
  if (isArrayOfObjects) {
    // Optional gating for arrays-of-objects (including nested within array items)
    if (!isRequired) {
      const insideArrayItem = /\[\d+\]/.test(fullPath);
      const shouldGate = (!formGenerator.renderAllGroups || insideArrayItem);
      if (shouldGate && !formGenerator.isOptionalGroupActive(fullPath)) {
        const placeholder = document.createElement('div');
        placeholder.className = 'form-ui-placeholder-add';
        placeholder.dataset.path = fullPath;
        const title = formGenerator.getSchemaTitle(propSchema, key);
        placeholder.textContent = `+ Add ${title}`;
        placeholder.addEventListener('click', (e) => {
          e.preventDefault(); e.stopPropagation();
          formGenerator.commandActivateOptional(fullPath);
        });
        return placeholder;
      }
    }
    const groupContainer = document.createElement('div');
    groupContainer.className = CLASS.group;
    groupContainer.id = pathToGroupId(fullPath);
    groupContainer.dataset.groupPath = fullPath;
    groupContainer.dataset.schemaPath = fullPath;
    groupContainer.dataset.fieldPath = fullPath;
    groupContainer.dataset.required = isRequired ? 'true' : 'false';

    const groupHeader = document.createElement('div');
    groupHeader.className = CLASS.groupHeader;
    const sep = document.createElement('div');
    sep.className = CLASS.separatorText;
    const label = document.createElement('div');
    label.className = CLASS.separatorLabel;
    const titleSpan = document.createElement('span');
    titleSpan.className = CLASS.groupTitle;
    titleSpan.textContent = propSchema.title || formGenerator.formatLabel(key);
    label.appendChild(titleSpan);
    sep.appendChild(label);
    groupHeader.appendChild(sep);
    groupContainer.appendChild(groupHeader);

    const groupContent = document.createElement('div');
    groupContent.className = CLASS.groupContent;
    const arrayUI = formGenerator.generateInput(fullPath, propSchema);
    const existingArr = formGenerator.model.getNestedValue(formGenerator.data, fullPath);
    const isEmpty = Array.isArray(existingArr) && existingArr.length === 0;
    if (arrayUI && !isEmpty) {
      groupContent.appendChild(arrayUI);
    } else if (isEmpty) {
      const placeholder = document.createElement('div');
      placeholder.className = CLASS.placeholderAdd;
      placeholder.dataset.path = fullPath;
      const title = formGenerator.getSchemaTitle(propSchema, key);
      placeholder.textContent = `+ Add ${title} Item`;
      placeholder.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        formGenerator.commandAddArrayItem(fullPath);
      });
      groupContent.appendChild(placeholder);
    }
    
    // If rendering all groups and the array is required, ensure one item is present by default
    if (formGenerator.renderAllGroups && isRequired && arrayUI) {
      const existing = formGenerator.model.getNestedValue(formGenerator.data, fullPath);
      const itemsContainer = arrayUI.querySelector?.('.form-ui-array-items');
      const addBtn = arrayUI.querySelector?.('.form-ui-array-add');
      if (Array.isArray(existing) && existing.length === 0 && itemsContainer && itemsContainer.children.length === 0 && addBtn) {
        try { addBtn.click(); } catch { /* noop */ }
      }
    }
    groupContainer.appendChild(groupContent);

    groupContainer.dataset.fieldPath = fullPath;
    return groupContainer;
  }

  // Special-case: nested object inside array items (or any object field) should render as its own inline group
  const isObjectType = !!(propSchema && (propSchema.type === 'object' || propSchema.properties));
  if (isObjectType && propSchema.properties) {
    // Optional object group gating: allow when renderAllGroups
    if (!isRequired) {
      const insideArrayItem = /\[\d+\]/.test(pathPrefix || '');
      const isDirectChildOfArrayItem = /\[\d+\]$/.test(pathPrefix || '');
      const shouldGate = (!formGenerator.renderAllGroups || insideArrayItem) && !isDirectChildOfArrayItem;
      if (shouldGate && !formGenerator.isOptionalGroupActive(fullPath)) {
        const placeholder = document.createElement('div');
        placeholder.className = CLASS.placeholderAdd;
        placeholder.dataset.path = fullPath;
        const title = formGenerator.getSchemaTitle(propSchema, key);
        placeholder.textContent = `+ Add ${title}`;
        placeholder.addEventListener('click', (e) => {
          e.preventDefault(); e.stopPropagation();
          formGenerator.commandActivateOptional(fullPath);
        });
        return placeholder;
      }
    }

    const groupContainer = document.createElement('div');
    groupContainer.className = CLASS.group;
    groupContainer.id = pathToGroupId(fullPath);
    groupContainer.dataset.groupPath = fullPath;
    groupContainer.dataset.schemaPath = fullPath;

    const groupHeader = document.createElement('div');
    groupHeader.className = CLASS.groupHeader;
    const sep = document.createElement('div');
    sep.className = CLASS.separatorText;
    const label = document.createElement('div');
    label.className = CLASS.separatorLabel;
    const titleSpan = document.createElement('span');
    titleSpan.className = CLASS.groupTitle;
    titleSpan.textContent = propSchema.title || formGenerator.formatLabel(key);
    label.appendChild(titleSpan);
    sep.appendChild(label);
    groupHeader.appendChild(sep);
    groupContainer.appendChild(groupHeader);

    const groupContent = document.createElement('div');
    groupContent.className = CLASS.groupContent;
    formGenerator.generateObjectFields(
      groupContent,
      propSchema.properties || {},
      propSchema.required || [],
      fullPath,
    );
    groupContainer.appendChild(groupContent);

    groupContainer.dataset.fieldPath = fullPath;
    return groupContainer;
  }

  const fieldContainer = document.createElement('div');
  fieldContainer.className = 'form-ui-field';
  fieldContainer.dataset.field = key;
  fieldContainer.dataset.fieldPath = fullPath;

  // Field label
  const label = document.createElement('label');
  label.className = 'form-ui-label';
  label.textContent = propSchema.title || formGenerator.formatLabel(key);
  if (isRequired) {
    label.classList.add('required');
    label.textContent += ' *';
  }
  fieldContainer.appendChild(label);

  // Field input
  const input = formGenerator.generateInput(fullPath, propSchema);
  if (input) {
    fieldContainer.appendChild(input);

    // If field is required, visually indicate on the input with a red border (not the label)
    if (isRequired) {
      let targetControl = null;
      // When input is a direct control element
      if (typeof input.matches === 'function' && input.matches('input, select, textarea')) {
        targetControl = input;
      } else if (typeof input.querySelector === 'function') {
        // For composed containers (e.g., checkbox/array containers)
        targetControl = input.querySelector('input, select, textarea');
      }
      if (targetControl) {
        targetControl.classList.add('required');
      }
    }

    // Track field schema and element for initial validation on load
    const controlEl = getControlElement(input);
    if (controlEl) {
      formGenerator.fieldSchemas.set(fullPath, propSchema);
      formGenerator.fieldElements.set(fullPath, controlEl);
    }

    // Field description (after input)
    if (propSchema.description) {
      const desc = document.createElement('div');
      desc.className = 'form-ui-description';
      desc.textContent = propSchema.description;
      fieldContainer.appendChild(desc);
    }
  }

  return fieldContainer;
}

export default { renderField };


