import "https://da.live/nx/public/sl/components.js";
import getStyle from "https://da.live/nx/utils/styles.js";
import { LitElement, html, nothing } from "da-lit";
import { readDocument } from "./actions.js";
// Form UI library (standalone mounting API)
import mountFormUI from "./libs/form-ui/core/form-mount.js";
import schemaLoader from "./libs/form-ui/utils/schema-loader.js";
import { discoverSchemasPlain, loadSchemaWithDefaults } from "./libs/form-ui/commands/form-commands.js";
import DA_SDK from 'https://da.live/nx/utils/sdk.js';

const style = await getStyle(import.meta.url);

class FormsEditor extends LitElement {
  static properties = {
    documentData: { type: Object },
    loading: { type: Boolean },
    error: { type: String },
    schemas: { type: Array },
    selectedSchema: { type: String },
    loadingSchemas: { type: Boolean },
    schemaError: { type: String },
    showSchemaDialog: { type: Boolean },
  };

  constructor() {
    super();
    this.documentData = null;
    this.loading = false;
    this.error = null;
    // Form UI runtime refs
    this._formApi = null;
    this._formUiCssSheet = null;
    this._schemaLoaderConfigured = false;
    this.schemas = [];
    this.selectedSchema = '';
    this.loadingSchemas = false;
    this.schemaError = null;
    this.showSchemaDialog = false;
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
    // Prepare Form UI (styles + schema loader), and discover schemas for selection
    await this.ensureFormUICSS();
    await this.configureSchemaLoader();
    await this.discoverSchemas();
    // Open dialog when schemas are ready
    this.showSchemaDialog = true;
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

  async ensureFormUICSS() {
    if (this._formUiCssSheet) return;
    try {
      const cssUrl = new URL('./libs/form-ui/form-ui.css', import.meta.url);
      const res = await fetch(cssUrl);
      const cssText = await res.text();
      const sheet = new CSSStyleSheet();
      await sheet.replace(cssText);
      // Append to existing adopted sheets
      this.shadowRoot.adoptedStyleSheets = [...this.shadowRoot.adoptedStyleSheets, sheet];
      this._formUiCssSheet = sheet;
    } catch (e) {
      // Fallback: inline <style> if constructable stylesheets fail
      try {
        const cssUrl = new URL('./libs/form-ui/form-ui.css', import.meta.url);
        const res = await fetch(cssUrl);
        const cssText = await res.text();
        const styleTag = document.createElement('style');
        styleTag.textContent = cssText;
        this.shadowRoot.appendChild(styleTag);
      } catch {}
    }
  }

  async configureSchemaLoader() {
    if (this._schemaLoaderConfigured) return;
    try {
      const { context } = await DA_SDK;
      const { org, repo, ref } = context || {};
      const owner = org || 'kozmaadrian';
      const repository = repo || 'mhast-demo';
      const branch = ref || 'main';
      schemaLoader.configure({ owner, repo: repository, ref: branch, basePath: 'forms/' });
      this._schemaLoaderConfigured = true;
    } catch (e) {
      // Use defaults if DA SDK context is not available
      try {
        schemaLoader.configure({ owner: 'kozmaadrian', repo: 'mhast-demo', ref: 'main', basePath: 'forms/' });
        this._schemaLoaderConfigured = true;
      } catch {}
    }
  }

  async initializeFormUI() {
    try {
      const mountEl = this.renderRoot?.querySelector('#form-root');
      if (!mountEl) return;

      // Nothing to do here until user selects a schema
      // Optionally clear previous form instance
      if (this._formApi) {
        try { this._formApi.destroy(); } catch {}
        this._formApi = null;
        mountEl.innerHTML = '';
      }
    } catch (e) {
      console.error('[editor] Failed to initialize Form UI', e);
    }
  }

  async discoverSchemas() {
    try {
      this.loadingSchemas = true;
      this.schemaError = null;
      const items = await discoverSchemasPlain();
      this.schemas = Array.isArray(items) ? items : [];
      // Preselect first if available, but do not auto-load
      this.selectedSchema = this.schemas[0]?.id || '';
    } catch (e) {
      this.schemaError = e?.message || String(e);
      this.schemas = [];
      this.selectedSchema = '';
    } finally {
      this.loadingSchemas = false;
    }
  }

  async loadSelectedSchema() {
    const schemaId = this.selectedSchema;
    const mountEl = this.renderRoot?.querySelector('#form-root');
    if (!schemaId || !mountEl) return;
    try {
      const { schema, initialData } = await loadSchemaWithDefaults(schemaId);
      // Prefer existing form data from the loaded page if present
      const dataToUse = (this.documentData && this.documentData.formData)
        ? this.documentData.formData
        : initialData;
      if (!this._formApi) {
        this._formApi = mountFormUI({
          mount: mountEl,
          schema,
          data: dataToUse,
          onChange: (next) => {
            // Sync live changes back to pageData.formData
            if (!this.documentData) this.documentData = {};
            this.documentData.formData = next;
            this.requestUpdate('documentData');
          },
          onRemove: () => {
            try { this._formApi?.destroy(); } catch {}
            this._formApi = null;
            mountEl.innerHTML = '';
            if (this.documentData && 'formData' in this.documentData) {
              delete this.documentData.formData;
              this.requestUpdate('documentData');
            }
          },
        });
      } else {
        this._formApi.updateSchema(schema);
        this._formApi.updateData(dataToUse);
      }
      // Ensure the page data reflects the current form state immediately
      if (!this.documentData) this.documentData = {};
      this.documentData.formData = dataToUse;
      this.requestUpdate('documentData');
      // Close dialog after successful load
      this.showSchemaDialog = false;
    } catch (e) {
      this.schemaError = `Failed to load schema: ${e?.message || e}`;
    }
  }

  onSchemaChange(e) {
    this.selectedSchema = e.target?.value || '';
  }

  disconnectedCallback() {
    try { this._formApi?.destroy(); } catch {}
    this._formApi = null;
    super.disconnectedCallback();
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
        ${this.showSchemaDialog ? html`
          <div class="modal-overlay" role="dialog" aria-modal="true">
            <div class="modal-dialog">
              <div class="modal-header">Select a Form Schema</div>
              <div class="modal-body">
                <label for="schema-select" style="min-width:72px;">Schema</label>
                <select id="schema-select" style="flex:1;" @change=${(e) => this.onSchemaChange(e)}>
                  ${this.loadingSchemas ? html`<option value="">-- loading --</option>` : nothing}
                  ${!this.loadingSchemas && this.schemas.length === 0 ? html`<option value="">-- no schemas --</option>` : nothing}
                  ${this.schemas.map((it) => html`<option value=${it.id} ?selected=${it.id===this.selectedSchema}>${it.name}</option>`)}
                </select>
              </div>
              ${this.schemaError ? html`<div style="color:#b00020; margin: -4px 0 10px 0;">${this.schemaError}</div>` : nothing}
              <div class="modal-footer">
                <button class="btn btn-secondary" @click=${() => { this.showSchemaDialog = false; }}>Cancel</button>
                <button class="btn btn-primary" @click=${() => this.loadSelectedSchema()} ?disabled=${!this.selectedSchema}>Continue</button>
              </div>
            </div>
          </div>
        ` : nothing}

        <h2>Form UI</h2>
        <div id="form-root"></div>

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
