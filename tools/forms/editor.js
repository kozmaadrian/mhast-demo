import "https://da.live/nx/public/sl/components.js";
import getStyle from "https://da.live/nx/utils/styles.js";
import { LitElement, html, nothing } from "da-lit";

const style = await getStyle(import.meta.url);

class FormsEditor extends LitElement {
  async connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
  }

  render() {
    return html` <h1>Forms Editor</h1> `;
  }
}

customElements.define("da-forms-editor", FormsEditor);
