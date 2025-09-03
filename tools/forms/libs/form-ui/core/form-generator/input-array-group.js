import FormIcons from '../../utils/icons.js';

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
  const addButton = document.createElement('button');
  addButton.type = 'button';
  addButton.className = 'form-ui-array-add form-ui-placeholder-add';
  addButton.innerHTML = `<span>+ Add '${baseTitle}' Item</span>`;

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
    itemTitleLabel.textContent = `${baseTitle} #${index + 1}`;
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


