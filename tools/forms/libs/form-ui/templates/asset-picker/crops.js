import { html } from 'da-lit';

export const cropsToolbarTemplate = () => html`
  <div class="da-dialog-asset-crops-toolbar">
    <button class="cancel">Cancel</button>
    <button class="back">Back</button>
    <button class="insert">Insert</button>
  </div>
`;

export const cropsListTemplate = ({ items = [], originalSrc = '' } = {}) => html`
  <ul class="da-dialog-asset-crops">
    <li class="selected" data-name="original"><p>Original</p><img src="${originalSrc}"></li>
    ${items.map((it) => html`<li data-name="${it.name}"><p>${it.name}</p><img src="${it.src}"></li>`)}
  </ul>
`;

export const structureSelectTemplate = ({ configs = [] } = {}) => {
  if (!configs || configs.length === 0) return html``;
  return html`
    <h2>Insert Type</h2>
    <ul class="da-dialog-asset-structure-select">
      <li><input checked type="radio" id="single" name="da-dialog-asset-structure-select" value="single"><label for="single">Single, Manual</label></li>
      <li>${configs.map((config, i) => html`<input type="radio" id="da-dialog-asset-structure-select-${i}" name="da-dialog-asset-structure-select" value="${encodeURIComponent(JSON.stringify(config))}"><label for="da-dialog-asset-structure-select-${i}">${config.name}</label>`)}</li>
    </ul>
  `;
};

export default { cropsToolbarTemplate, cropsListTemplate, structureSelectTemplate };


