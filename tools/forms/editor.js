import "https://da.live/nx/public/sl/components.js";
import getStyle from "https://da.live/nx/utils/styles.js";
import { LitElement, html, nothing } from "da-lit";
import { readDocument } from "./actions.js";

const style = await getStyle(import.meta.url);

class FormsEditor extends LitElement {
  static properties = {
    documentData: { type: Object },
    loading: { type: Boolean },
    error: { type: String }
  };

  constructor() {
    super();
    this.documentData = null;
    this.loading = false;
    this.error = null;
  }

  async connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    
    // Get page path from URL query parameter
    const urlParams = new URLSearchParams(window.location.search);
    const pagePath = urlParams.get('page');
    
    if (!pagePath) {
      this.error = 'Missing required "page" query parameter. Please provide a page path.';
      return;
    }
    
    // Load document data before initial render
    await this.loadDocumentData(pagePath);
  }

  async loadDocumentData(pagePath) {
    try {
      this.loading = true;
      this.documentData = await readDocument(pagePath);
    } catch (error) {
      this.error = `Failed to load document: ${error.message}`;
      console.error('Error loading document:', error);
    } finally {
      this.loading = false;
    }
  }

  render() {
    if (this.error) {
      return html`
        <div style="color: red; padding: 20px; border: 1px solid red; border-radius: 4px;">
          <h3>Error</h3>
          <p>${this.error}</p>
          <p>Example URL: <code>?page=/forms/contact</code></p>
        </div>
      `;
    }

    if (this.loading) {
      return html`<div>Loading document data...</div>`;
    }

    if (!this.documentData) {
      return html`<div>No document data available</div>`;
    }

    return html`
      <div>
        <h2>Document Data</h2>
        <p><strong>Page Path:</strong> ${this.documentData.pagePath}</p>
        <textarea 
          readonly 
          rows="20" 
          cols="80" 
          style="width: 100%; font-family: monospace; padding: 10px;"
        >${JSON.stringify(this.documentData, null, 2)}</textarea>
      </div>
    `;
  }
}

customElements.define("da-forms-editor", FormsEditor);
