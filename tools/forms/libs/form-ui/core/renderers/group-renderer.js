import { UI_CLASS as CLASS } from '../constants.js';
import { pathToGroupId } from '../form-generator/path-utils.js';

/**
 * group-renderer
 * Creates group containers (header + content) and supports rendering primitives
 * and array-of-objects sections. Returns elements; caller appends to DOM.
 */
export function renderGroupContainer({
  container,
  title,
  breadcrumbPath = [],
  schemaPath = [],
  addHeader = true,
}) {
  const groupPath = schemaPath.length > 0 ? schemaPath.join('.') : 'root';
  const groupId = pathToGroupId(groupPath);
  const frag = document.createDocumentFragment();
  const groupContainer = document.createElement('div');
  groupContainer.className = CLASS.group;
  groupContainer.id = groupId;
  groupContainer.dataset.groupPath = breadcrumbPath.join(' > ');

  if (addHeader && breadcrumbPath.length > 0) {
    const groupHeader = document.createElement('div');
    groupHeader.className = CLASS.groupHeader;
    const sep = document.createElement('div');
    sep.className = CLASS.separatorText;
    const label = document.createElement('div');
    label.className = CLASS.separatorLabel;
    const titleSpan = document.createElement('span');
    titleSpan.className = CLASS.groupTitle;
    titleSpan.textContent = title || (breadcrumbPath[breadcrumbPath.length - 1] || '');
    label.appendChild(titleSpan);
    sep.appendChild(label);
    groupHeader.appendChild(sep);
    groupContainer.appendChild(groupHeader);
  }

  const groupContent = document.createElement('div');
  groupContent.className = CLASS.groupContent;
  groupContainer.appendChild(groupContent);
  frag.appendChild(groupContainer);
  container.appendChild(frag);

  return { groupId, element: groupContainer, contentEl: groupContent };
}

export function renderPrimitivesIntoGroup({
  contentEl,
  properties,
  required = [],
  pathPrefix = '',
  generateObjectFields,
}) {
  if (!contentEl || !generateObjectFields || !properties) return;
  generateObjectFields(contentEl, properties, required, pathPrefix);
}

/**
 * Render an array-of-objects group section (header + array UI from generateInput)
 */
export function renderArrayGroup({
  container,
  title,
  breadcrumbPath,
  schemaPath,
  generateInput,
}) {
  const { element, contentEl, groupId } = renderGroupContainer({
    container,
    title,
    breadcrumbPath,
    schemaPath,
    addHeader: true,
  });
  const pathPrefix = schemaPath.join('.');
  const arrayUI = generateInput(pathPrefix, { type: 'array' });
  if (arrayUI) contentEl.appendChild(arrayUI);
  element.dataset.fieldPath = pathPrefix;
  return { groupId, element, contentEl };
}

export default { renderGroupContainer, renderPrimitivesIntoGroup, renderArrayGroup };


