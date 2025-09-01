import TextInput from './text-input.js';
import TextareaInput from './textarea-input.js';
import SelectInput from './select-input.js';
import NumberInput from './number-input.js';
import CheckboxInput from './checkbox-input.js';

export function registry(context) {
  return new Map([
    ['string', new TextInput(context)],
    ['textarea', new TextareaInput(context)],
    ['select', new SelectInput(context)],
    ['number', new NumberInput(context)],
    ['integer', new NumberInput(context)],
    ['boolean', new CheckboxInput(context)],
  ]);
}

export default { registry };


