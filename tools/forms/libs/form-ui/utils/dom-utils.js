/**
 * DOM utilities for form-ui
 */

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
