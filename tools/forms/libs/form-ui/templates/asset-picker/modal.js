import { html } from 'da-lit';

export const assetPickerModalTemplate = () => html`
  <dialog class="da-dialog-asset">
    <div class="da-dialog-asset-inner" data-part="assets"></div>
    <div class="da-dialog-asset-inner" data-part="crops" style="display:none"></div>
  </dialog>
`;

export default { assetPickerModalTemplate };


