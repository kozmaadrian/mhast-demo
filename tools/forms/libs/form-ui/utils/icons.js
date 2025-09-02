/**
 * Form UI Icons
 * SVG icon definitions for form UI components
 */

export default class FormIcons {
  /**
   * Return inline SVG for a given icon name
   */
  static getIconSvg(name) {
    const common = 'width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
    switch (name) {
      case 'trash':
        return `<svg ${common}><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"></path></svg>`;
      case 'triangle-alert': // error/warning indicator
        return `<svg viewBox="0 0 36 36" class="error-indicator" focusable="false" aria-hidden="true" role="img">
          <path fill-rule="evenodd" d="M17.127,2.579.4,32.512A1,1,0,0,0,1.272,34H34.728a1,1,0,0,0,.872-1.488L18.873,2.579A1,1,0,0,0,17.127,2.579ZM20,29.5a.5.5,0,0,1-.5.5h-3a.5.5,0,0,1-.5-.5v-3a.5.5,0,0,1,.5-.5h3a.5.5,0,0,1,.5.5Zm0-6a.5.5,0,0,1-.5.5h-3a.5.5,0,0,1-.5-.5v-12a.5.5,0,0,1,.5-.5h3a.5.5,0,0,1,.5.5Z" fill="currentColor"/>
        </svg>`;
      case 'plus': // new plus icon
        return `<svg ${common}><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;
      case 'check':
        return `<svg ${common}><polyline points="20 6 9 17 4 12"></polyline></svg>`;
        default:
        return '';
    }
  }

  /**
   * Return a Node for the SVG icon to avoid using innerHTML directly
   */
  static renderIcon(name) {
    const svg = this.getIconSvg(name);
    const tpl = document.createElement('template');
    tpl.innerHTML = svg.trim();
    return tpl.content.firstChild ? tpl.content.firstChild.cloneNode(true) : document.createTextNode('');
  }
}
