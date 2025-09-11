import { html, nothing } from 'da-lit';
import { ICONS } from '../utils/icon-urls.js';
import { UI_CLASS as CLASS } from '../constants.js';

/**
 * groupTemplate
 * Declarative template for a form group container (optional header + content).
 * Note: `content` can be an HTMLElement, a lit TemplateResult, or nothing.
 */
export const groupTemplate = ({ id, breadcrumbPath = [], schemaPath = [], title, addHeader = true, content }) => {
  const groupPath = (Array.isArray(schemaPath) && schemaPath.length > 0) ? schemaPath.join('.') : 'root';
  const labelText = title || ((Array.isArray(breadcrumbPath) && breadcrumbPath[breadcrumbPath.length - 1]) || '');
  return html`
    <div class="${CLASS.group}" id=${id}
         data-group-path=${Array.isArray(breadcrumbPath) ? breadcrumbPath.join(' > ') : ''}
         data-schema-path=${groupPath}>
      ${addHeader && Array.isArray(breadcrumbPath) && breadcrumbPath.length > 0 ? html`
        <div class="${CLASS.groupHeader}">
          <div class="${CLASS.separatorText}">
            <div class="${CLASS.separatorLabel}">
              <span class="${CLASS.groupTitle}"><img class="form-ui-icon" src=${ICONS.section} alt="" aria-hidden="true" /> ${labelText}</span>
            </div>
          </div>
        </div>
      ` : nothing}
      <div class="${CLASS.groupContent}">${content || nothing}</div>
    </div>
  `;
};

export default { groupTemplate };


