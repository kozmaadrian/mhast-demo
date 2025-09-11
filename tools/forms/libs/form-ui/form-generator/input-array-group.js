import { render } from 'da-lit';
import { UI_CLASS as CLASS } from '../constants.js';
import { arrayContainerTemplate, arrayItemTemplate, arrayAddButtonTemplate, removeButtonTemplate } from '../templates/array.js';

export default function createArrayGroupUI(generator, fieldPath, propSchema) {
  const itemsSchema = generator.derefNode(propSchema.items) || propSchema.items;
  const normItemsSchema = generator.normalizeSchema(itemsSchema) || itemsSchema || {};

  // Create container using template
  const containerMount = document.createElement('div');
  render(arrayContainerTemplate({ fieldPath, items: '' }), containerMount);
  const container = containerMount.firstElementChild;
  const itemsContainer = container.querySelector(`.${CLASS.arrayItems}`) || container.querySelector('.form-ui-array-items');

  const baseTitle = generator.getSchemaTitle(propSchema, fieldPath.split('.').pop());
  // Create add button via template to simplify DOM assembly
  const addBtnMount = document.createElement('div');
  const onAddClick = (event) => {
    event.preventDefault();
    event.stopPropagation();
    generator.commandAddArrayItem(fieldPath);
    requestAnimationFrame(() => {
      const arr = generator.model.getNestedValue(generator.data, fieldPath) || [];
      const newIndex = Math.max(0, arr.length - 1);
      const targetId = generator.arrayItemId(fieldPath, newIndex);
      const el = generator.container?.querySelector?.(`#${targetId}`);
      if (el && el.id) generator.navigation.navigateToGroup(el.id);
      generator.validation.validateAllFields();
    });
  };
  const onAddFocus = (e) => generator.navigation.highlightActiveGroup?.(e.target);
  render(arrayAddButtonTemplate({ label: `Add '${baseTitle}' Item`, path: fieldPath, onClick: onAddClick, onFocus: onAddFocus }), addBtnMount);
  const addButton = addBtnMount.firstElementChild;

  const addItemAt = (index) => {
    const itemId = generator.arrayItemId(fieldPath, index);
    const pathPrefix = `${fieldPath}[${index}]`;

    // Build inner content DOM for this item (fields) without extra wrapper div
    const contentHost = document.createDocumentFragment();
    generator.generateObjectFields(
      contentHost,
      normItemsSchema.properties || {},
      normItemsSchema.required || [],
      pathPrefix,
    );

    // Remove button state managed locally per-item
    let confirmState = false;
    const removeMount = document.createElement('div');
    const reRenderRemove = () => {
      render(removeButtonTemplate({ confirm: confirmState, onClick: (ev) => {
        ev?.preventDefault?.();
        ev?.stopPropagation?.();
        if (confirmState) {
          generator.commandRemoveArrayItem(fieldPath, index);
          requestAnimationFrame(() => generator.validation.validateAllFields());
        } else {
          confirmState = true;
          reRenderRemove();
          setTimeout(() => { confirmState = false; reRenderRemove(); }, 3000);
        }
      }}), removeMount);
    };
    reRenderRemove();

    const mount = document.createElement('div');
    render(arrayItemTemplate({ id: itemId, title: `${baseTitle} #${index + 1}`, content: contentHost, removeButton: removeMount.firstElementChild }), mount);
    const itemContainer = mount.firstElementChild;
    itemContainer.dataset.schemaPath = pathPrefix;

    itemsContainer.appendChild(itemContainer);
    generator.ensureGroupRegistry();
    // Mapping is handled in lifecycle.rebuildBody → mapping.mapFieldsToGroups
  };

  container.appendChild(addButton);

  const existing = generator.model.getNestedValue(generator.data, fieldPath);
  if (Array.isArray(existing)) {
    existing.forEach((_, idx) => addItemAt(idx));
  }

  return container;
}

