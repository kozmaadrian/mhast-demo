/**
 * Form UI Icons
 * SVG icon definitions for form UI components
 */

export default class FormIcons {
  /**
   * Return inline SVG for a given icon name
   */
  static getIconSvg(name) {
    const common = 'width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
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
      case 'file':
        // Use thinner stroke for large 60x60 rendering
        return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>`;
      case 'replace':
        // Chain-style replace icon
        return `<svg viewBox="0 0 36 36" width="16" height="16" fill="currentColor" aria-hidden="true" role="img"><path fill-rule="evenodd" d="M31.7,4.3a7.176,7.176,0,0,0-10.148,0c-.385.386-4.264,4.222-5.351,5.309a8.307,8.307,0,0,1,3.743.607c.519-.52,3.568-3.526,3.783-3.741a4.1,4.1,0,0,1,5.8,5.8L22.408,19.39a4.617,4.617,0,0,1-3.372,1.3,3.953,3.953,0,0,1-2.7-1.109,4.154,4.154,0,0,1-1.241-1.626,2.067,2.067,0,0,0-.428.318l-1.635,1.712a7.144,7.144,0,0,0,1.226,1.673c2.8,2.8,7.875,2.364,10.677-.438L31.7,14.452A7.174,7.174,0,0,0,31.7,4.3Z"></path><path fill-rule="evenodd" d="M15.926,25.824c-.52.52-3.5,3.547-3.713,3.762a4.1,4.1,0,1,1-5.8-5.8L13.6,16.6a4.58,4.58,0,0,1,3.366-1.292A4.2,4.2,0,0,1,20.75,18.09a2.067,2.067,0,0,0,.428-.318l1.734-1.721a7.165,7.165,0,0,0-1.226-1.673,7.311,7.311,0,0,0-10.26.048L4.239,21.612A7.176,7.176,0,0,0,14.387,31.761c.386-.386,4.194-4.243,5.281-5.33A8.3,8.3,0,0,1,15.926,25.824Z"></path></svg>`;
      case 'section':
        // Section/group title icon (bars)
        return `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" role="img"><path fill-rule="evenodd" d="M3.81818182,11 L20.1818182,11 C21.1859723,11 22,11.8954305 22,13 L22,15 C22,16.1045695 21.1859723,17 20.1818182,17 L3.81818182,17 C2.81402773,17 2,16.1045695 2,15 L2,13 C2,11.8954305 2.81402773,11 3.81818182,11 Z M4,13 L4,15 L20,15 L20,13 L4,13 Z M3.81818182,3 L20.1818182,3 C21.1859723,3 22,3.8954305 22,5 L22,7 C22,8.1045695 21.1859723,9 20.1818182,9 L3.81818182,9 C2.81402773,9 2,8.1045695 2,7 L2,5 C2,3.8954305 2.81402773,3 3.81818182,3 Z M4,5 L4,7 L20,7 L20,5 L4,5 Z M2,19 L14,19 L14,21 L2,21 L2,19 Z"></path></svg>`;
      case 'list':
        return `<svg viewBox="0 0 16 16" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:cc="http://creativecommons.org/ns#" xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://www.w3.org/2000/svg" version="1.1" id="svg3049" fill="#000000"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"> <metadata id="metadata3054"> <rdf:rdf> <cc:work> <dc:format>image/svg+xml</dc:format> <dc:type rdf:resource="http://purl.org/dc/dcmitype/StillImage"></dc:type> <dc:title></dc:title> <dc:date>2021</dc:date> <dc:creator> <cc:agent> <dc:title>Timothée Giet</dc:title> </cc:agent> </dc:creator> <cc:license rdf:resource="http://creativecommons.org/licenses/by-sa/4.0/"></cc:license> </cc:work> <cc:license rdf:about="http://creativecommons.org/licenses/by-sa/4.0/"> <cc:permits rdf:resource="http://creativecommons.org/ns#Reproduction"></cc:permits> <cc:permits rdf:resource="http://creativecommons.org/ns#Distribution"></cc:permits> <cc:requires rdf:resource="http://creativecommons.org/ns#Notice"></cc:requires> <cc:requires rdf:resource="http://creativecommons.org/ns#Attribution"></cc:requires> <cc:permits rdf:resource="http://creativecommons.org/ns#DerivativeWorks"></cc:permits> <cc:requires rdf:resource="http://creativecommons.org/ns#ShareAlike"></cc:requires> </cc:license> </rdf:rdf> </metadata> <g transform="translate(-421.714 -531.79)" id="layer1"> <path id="rect4094" d="M422.714 532.79v6h6v-6zm1 1h4v4h-4z" style="fill:#373737;fill-opacity:1;stroke:none;stroke-width:.87499952"></path> <rect transform="scale(1 -1)" style="fill:#373737;fill-opacity:1;stroke:none;stroke-width:.87499952" id="rect4098" width="5.9999957" height="5.9999704" x="422.71429" y="-546.79071"></rect> <rect y="533.79071" x="430.71429" height="1.0000296" width="5.9999957" id="rect4163" style="fill:#373737;fill-opacity:1;stroke:none;stroke-width:.87499952"></rect> <rect y="541.79071" x="430.71429" height="1.0000296" width="3.9999955" id="rect4165" style="fill:#373737;fill-opacity:1;stroke:none;stroke-width:.87499952"></rect> <rect y="544.79071" x="430.71429" height="0.99999994" width="3.9999955" id="rect4167" style="fill:#373737;fill-opacity:1;stroke:none;stroke-width:.87499952"></rect> <rect y="536.79071" x="430.71429" height="1.0000296" width="5.9999957" id="rect4169" style="fill:#373737;fill-opacity:1;stroke:none;stroke-width:.87499952"></rect> </g> </g></svg>`
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
