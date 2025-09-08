import BaseInput from './base-input.js';

/**
 * TextareaInput
 *
 * Renderer for long string content using a <textarea> element.
 */
export default class TextareaInput extends BaseInput {
  constructor(context, handlers = {}) { super(context, handlers); }
  /** Create a textarea with optional placeholder/default. */
  create(fieldPath, propSchema) {
    const textarea = document.createElement('textarea');
    textarea.name = fieldPath;
    textarea.className = 'form-ui-textarea';
    textarea.rows = 3;
    if (propSchema.default) textarea.value = propSchema.default;
    if (propSchema.placeholder) textarea.placeholder = propSchema.placeholder;
    this.attachCommonEvents(textarea, fieldPath, propSchema);
    return textarea;
  }
}


