/**
 * BaseInput
 *
 * Minimal base class for input wrappers. It wires common input/change/blur/focus
 * event handling to delegate back to the provided handlers from the generator.
 */
export default class BaseInput {
  /**
   * @param {any} contextOrHandlers - Backward-compat: some callers pass handlers as first arg
   * @param {{onInputOrChange?:Function,onBlur?:Function,onFocus?:Function}} [handlers]
   */
  constructor(contextOrHandlers, handlers = {}) {
    const noop = () => {};
    // Support legacy signature where only a single handlers object was passed
    const resolvedHandlers = (handlers && (handlers.onInputOrChange || handlers.onBlur || handlers.onFocus))
      ? handlers
      : (contextOrHandlers || {});
    this.onInputOrChange = resolvedHandlers.onInputOrChange || noop;
    this.onBlur = resolvedHandlers.onBlur || noop;
    this.onFocus = resolvedHandlers.onFocus || noop;
  }

  /** Attach standard input/change/blur/focus events to an element. */
  attachCommonEvents(el, fieldPath, schema) {
    ['input', 'change'].forEach((evt) => {
      el.addEventListener(evt, () => this.onInputOrChange(fieldPath, schema, el));
    });
    el.addEventListener('blur', () => this.onBlur(fieldPath, schema, el));
    el.addEventListener('focus', (e) => this.onFocus(fieldPath, schema, e.target));
  }

  /** Convert a camelCase/snake_case name to a human-friendly label. */
  formatLabel(name) {
    return name
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, (str) => str.toUpperCase())
      .replace(/_/g, ' ');
  }
}


