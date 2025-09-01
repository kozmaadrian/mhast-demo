export default class BaseInput {
  constructor(handlers = {}) {
    const noop = () => {};
    this.onInputOrChange = handlers.onInputOrChange || noop;
    this.onBlur = handlers.onBlur || noop;
    this.onFocus = handlers.onFocus || noop;
  }

  attachCommonEvents(el, fieldPath, schema) {
    ['input', 'change'].forEach((evt) => {
      el.addEventListener(evt, () => this.onInputOrChange(fieldPath, schema, el));
    });
    el.addEventListener('blur', () => this.onBlur(fieldPath, schema, el));
    el.addEventListener('focus', (e) => this.onFocus(fieldPath, schema, e.target));
  }

  formatLabel(name) {
    return name
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, (str) => str.toUpperCase())
      .replace(/_/g, ' ');
  }
}


