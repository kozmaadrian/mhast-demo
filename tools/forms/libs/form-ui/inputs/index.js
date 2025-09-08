import TextInput from './text-input.js';
import TextareaInput from './textarea-input.js';
import SelectInput from './select-input.js';
import NumberInput from './number-input.js';
import CheckboxInput from './checkbox-input.js';
import PictureInput from './picture-input.js';

export function registry(handlers) {
  return new Map([
    ['string', new TextInput(handlers)],
    ['textarea', new TextareaInput(handlers)],
    ['select', new SelectInput(handlers)],
    ['number', new NumberInput(handlers)],
    ['integer', new NumberInput(handlers)],
    ['boolean', new CheckboxInput(handlers)],
    ['picture', new PictureInput(handlers)],
  ]);
}

export default { registry };


