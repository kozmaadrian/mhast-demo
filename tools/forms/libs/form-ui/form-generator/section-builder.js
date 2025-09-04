import { hyphenatePath } from './path-utils.js';
import { UI_CLASS as CLASS } from '../constants.js';

/**
 * Section builder
 *
 * Create a titled section container and append it to the `childrenHost`.
 * Used for schema nodes that have only nested groups and no primitives.
 *
 * @param {HTMLElement} childrenHost - Where to append the section container
 * @param {string} titleText - Section title
 * @param {string} schemaPathDot - Dotted schema path used to derive id
 * @param {string[]} breadcrumbPath - Human-readable parent path tokens
 * @returns {{sectionId:string, element:HTMLElement}}
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


