import FormIcons from '../utils/icons.js';
import { UI_CLASS as CLASS } from '../constants.js';
import { createAddButton } from '../utils/dom-utils.js';

export default function createArrayGroupUI(generator, fieldPath, propSchema) {
  const itemsSchema = generator.derefNode(propSchema.items) || propSchema.items;
  const normItemsSchema = generator.normalizeSchema(itemsSchema) || itemsSchema || {};
  const container = document.createElement('div');
  container.className = 'form-ui-array-container';
  container.dataset.field = fieldPath;

  const itemsContainer = document.createElement('div');
  itemsContainer.className = 'form-ui-array-items';
  container.appendChild(itemsContainer);

  const baseTitle = generator.getSchemaTitle(propSchema, fieldPath.split('.').pop());
  const addButton = createAddButton(`Add '${baseTitle}' Item`, fieldPath);

  const addItemAt = (index) => {
    const itemContainer = document.createElement('div');
    itemContainer.className = 'form-ui-array-item';
    itemContainer.id = generator.arrayItemId(fieldPath, index);
    // Schema path for this array item (schema/data-driven breadcrumb)
    const pathPrefix = `${fieldPath}[${index}]`;
    itemContainer.dataset.schemaPath = pathPrefix;
    const headerWrap = document.createElement('div');
    headerWrap.className = 'form-ui-array-item-header';
    const itemTitleSep = document.createElement('div');
    itemTitleSep.className = 'form-ui-separator-text';
    const itemTitleLabel = document.createElement('div');
    itemTitleLabel.className = 'form-ui-separator-label';
    // Build: [icon] [title]
    const titleSpan = document.createElement('span');
    titleSpan.className = CLASS.groupTitle;
    const iconTpl = document.createElement('template');
    iconTpl.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" fill="#000000" viewBox="0 0 24 24" aria-hidden="true" role="img"><path fill-rule="evenodd" d="M3.81818182,11 L20.1818182,11 C21.1859723,11 22,11.8954305 22,13 L22,15 C22,16.1045695 21.1859723,17 20.1818182,17 L3.81818182,17 C2.81402773,17 2,16.1045695 2,15 L2,13 C2,11.8954305 2.81402773,11 3.81818182,11 Z M4,13 L4,15 L20,15 L20,13 L4,13 Z M3.81818182,3 L20.1818182,3 C21.1859723,3 22,3.8954305 22,5 L22,7 C22,8.1045695 21.1859723,9 20.1818182,9 L3.81818182,9 C2.81402773,9 2,8.1045695 2,7 L2,5 C2,3.8954305 2.81402773,3 3.81818182,3 Z M4,5 L4,7 L20,7 L20,5 L4,5 Z M2,19 L14,19 L14,21 L2,21 L2,19 Z"></path></svg>';
    const iconEl = iconTpl.content.firstChild;
    const textEl = document.createElement('span');
    textEl.textContent = `${baseTitle} #${index + 1}`;
    titleSpan.appendChild(iconEl);
    titleSpan.appendChild(document.createTextNode(' '));
    titleSpan.appendChild(textEl);
    itemTitleLabel.appendChild(titleSpan);
    itemTitleSep.appendChild(itemTitleLabel);
    headerWrap.appendChild(itemTitleSep);
    const groupContent = document.createElement('div');
    groupContent.className = 'form-ui-group-content';
    groupContent.appendChild(headerWrap);
    generator.generateObjectFields(
      groupContent,
      normItemsSchema.properties || {},
      normItemsSchema.required || [],
      pathPrefix,
    );
    itemContainer.appendChild(groupContent);
    const actions = document.createElement('div');
    actions.className = 'form-ui-array-item-actions';
    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'form-ui-remove';
    removeButton.title = 'Remove item';
    removeButton.textContent = '';
    removeButton.appendChild(FormIcons.renderIcon('trash'));
    removeButton.addEventListener('click', () => {
      if (removeButton.classList.contains('confirm-state')) {
        if (removeButton.dataset.confirmTimeoutId) {
          clearTimeout(Number(removeButton.dataset.confirmTimeoutId));
          delete removeButton.dataset.confirmTimeoutId;
        }
        generator.commandRemoveArrayItem(fieldPath, index);
        requestAnimationFrame(() => generator.validation.validateAllFields());
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
    actions.appendChild(removeButton);
    headerWrap.appendChild(actions);
    itemsContainer.appendChild(itemContainer);
    generator.ensureGroupRegistry();
    // Mapping is handled in lifecycle.rebuildBody → mapping.mapFieldsToGroups
  };

  addButton.addEventListener('click', (event) => {
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
  });
  addButton.addEventListener('focus', (e) => generator.navigation.highlightActiveGroup?.(e.target));
  container.appendChild(addButton);

  const existing = generator.model.getNestedValue(generator.data, fieldPath);
  if (Array.isArray(existing)) {
    existing.forEach((_, idx) => addItemAt(idx));
  }

  return container;
}


