import BaseInput from './base-input.js';

export default class TextareaInput extends BaseInput {
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


