import { hyphenatePath } from './path-utils.js';
import { UI_CLASS as CLASS } from '../constants.js';

/**
 * Section builder
 * Creates a section container with title and returns its id and element.
 */
export function createSection(childrenHost, titleText, schemaPathDot, breadcrumbPath) {
  const sectionId = `form-section-${hyphenatePath(schemaPathDot)}`;
  const sectionContainer = document.createElement('div');
  sectionContainer.className = CLASS.section || 'form-ui-section';
  sectionContainer.id = sectionId;
  sectionContainer.dataset.sectionPath = (breadcrumbPath || []).join(' > ');

  const sectionHeader = document.createElement('div');
  sectionHeader.className = CLASS.sectionHeader || 'form-ui-section-header';
  const sectionTitle = document.createElement('h2');
  sectionTitle.className = CLASS.sectionTitle || 'form-ui-section-title';
  sectionTitle.textContent = titleText || '';
  sectionHeader.appendChild(sectionTitle);
  sectionContainer.appendChild(sectionHeader);
  childrenHost.appendChild(sectionContainer);

  return { sectionId, element: sectionContainer };
}

export default { createSection };


