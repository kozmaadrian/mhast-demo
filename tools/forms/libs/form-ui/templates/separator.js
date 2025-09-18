import { html } from 'da-lit';
import { UI_CLASS as CLASS } from '../constants.js';
import { ICONS } from '../utils/icon-urls.js';

export const separatorTemplate = ({ title = '' } = {}) => html`
  <div class="${CLASS.separatorText}">
    <div class="${CLASS.separatorLabel}">
      <span class="${CLASS.groupTitle}"><img class="form-ui-icon" src=${ICONS.section} alt="" aria-hidden="true" /> ${title}</span>
    </div>
  </div>
`;

export default { separatorTemplate };


