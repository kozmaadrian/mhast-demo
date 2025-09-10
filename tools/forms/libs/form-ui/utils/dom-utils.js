/**
 * DOM utilities for form-ui
 */
import FormIcons from './icons.js';

/**
 * Return the control element for a given input or container.
 * If the node itself is an input/select/textarea, it is returned.
 * Otherwise, the first descendant matching a control selector is returned.
 * @param {HTMLElement} node
 * @returns {HTMLElement|null}
 */
export default function getControlElement(node) {
  if (!node) return null;
  if (typeof node.matches === 'function' && node.matches('input, select, textarea')) return node;
  if (typeof node.querySelector === 'function') return node.querySelector('input, select, textarea');
  return null;
}

/**
 * Return the deepest active element, traversing into shadow roots if present.
 * Works across Shadow DOM boundaries so focus detection is reliable in Web Components.
 * @returns {Element|null}
 */
export function getDeepActiveElement() {
  let active = document.activeElement;
  try {
    while (active && active.shadowRoot && active.shadowRoot.activeElement) {
      active = active.shadowRoot.activeElement;
    }
  } catch {
    // Ignore cross-origin or unexpected errors; fall back to current active
  }
  return active;
}

/**
 * Create a standardized "Add" button used for placeholders and array adds.
 * @param {string} labelText - Visible label text (e.g., "Add Item")
 * @param {string} [path] - Optional data-path to set on the button
 * @returns {HTMLButtonElement}
 */
export function createAddButton(labelText, path) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'form-content-add';
  if (path) btn.dataset.path = path;
  btn.textContent = '';
  btn.appendChild(FormIcons.renderIcon('plus'));
  const span = document.createElement('span');
  span.textContent = labelText || 'Add';
  btn.appendChild(span);
  return btn;
}
