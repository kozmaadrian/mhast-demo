import { LitElement, html, nothing } from "da-lit";
import "https://da.live/nx/public/sl/components.js";
import getStyle from "https://da.live/nx/utils/styles.js";
import { readDocument, saveDaVersion, saveDocument, saveToAem } from "./libs/backend/actions.js";
import "./libs/form-ui/components/title/title.js";
// Form UI library (standalone mounting API)
// mountFormUI is lazily imported on demand to reduce initial load
import schemaLoader from "./libs/form-ui/utils/schema-loader.js";
import { discoverSchemasPlain, loadSchemaWithDefaults } from "./libs/form-ui/commands/form-commands.js";
import DA_SDK from 'https://da.live/nx/utils/sdk.js';
import { DA_LIVE, MHAST_LIVE } from "./utils.js";

const style = await getStyle(import.meta.url);
const formStyles = await getStyle((new URL('./libs/form-ui/form-ui.css', import.meta.url)).href);

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
    context: { type: Object },
  };

  constructor() {
    super();
    this.documentData = null;
    this.loading = false;
    this.error = null;
    // Form UI runtime refs
    this._formApi = null;
    this._schemaLoaderConfigured = false;
    this.schemas = [];
    this.selectedSchema = '';
    this.loadingSchemas = false;
    this.schemaError = null;
    this.showSchemaDialog = false;
    this._previouslyFocused = null;
    this._onFormChangeDebounced = null;
    this._pagePath = '';
    this._selectedSchemaName = '';
  }

  async connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style, formStyles];

    // init DA SDK context
    const { context } = await DA_SDK;
    this.context = { ...context };
    
    // Get page path from URL query parameter
    const urlParams = new URLSearchParams(window.location.search);
    let pagePath = window.location.hash?.replace('#/', '/') || urlParams.get('page');
    let schemaFromUrl = urlParams.get('schema');
    
    if (!pagePath) {
      this.error = 'Missing required "page" query parameter. Please provide a page path.';
      return;
    }

    // Remove org and site from the start of the pagePath, so only the path remains
    const parts = pagePath.split('/');
    if (parts.length > 3) {
      pagePath = '/' + parts.slice(3).join('/');
    }
    
    // Load document data before initial render
    await this.loadDocumentData(pagePath);
    this._pagePath = pagePath;
    schemaFromUrl = this.documentData?.schemaId || schemaFromUrl;
    
    // Prepare Form UI (styles + schema loader), and discover schemas for selection
    await this.configureSchemaLoader();
    await this.discoverSchemas();
    // If schema provided in URL and is valid, auto-load and skip dialog
    if (schemaFromUrl && this.schemas.some((s) => s.id === schemaFromUrl)) {
      this.selectedSchema = schemaFromUrl;
      await this.loadSelectedSchema();
      this.showSchemaDialog = false;
    } else {
      // Open dialog when schemas are ready
      this.showSchemaDialog = true;
    }

    this.addEventListener('editor-save', this._handleSave);
    this.addEventListener('editor-preview-publish', this._handlePreviewPublish);
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

  async configureSchemaLoader() {
    if (this._schemaLoaderConfigured) return;
    try {
      const { org, repo, ref } = this.context || {};
      const owner = org || 'kozmaadrian';
      const repository = repo || 'mhast-demo';
      const branch = ref || 'main';
      schemaLoader.configure({ owner, repo: repository, ref: branch, basePath: 'forms/' });
      this._schemaLoaderConfigured = true;
    } catch (e) {
      // Use defaults if DA SDK context is not available
      try {
        schemaLoader.configure({ owner, repo: repository, ref: 'storage', basePath: 'forms/' });
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
      // Try cache first
      const cacheKey = 'forms.schemas.manifest';
      const cached = sessionStorage.getItem(cacheKey);
      let items = [];
      if (cached) {
        try { items = JSON.parse(cached) || []; } catch {}
      }
      if (!items || items.length === 0) {
        const discovered = await discoverSchemasPlain();
        items = Array.isArray(discovered) ? discovered : [];
        try { sessionStorage.setItem(cacheKey, JSON.stringify(items)); } catch {}
      }
      // Append local schemas (from tools/forms/local-schema/manifest.json if available)
      const localSchemas = await this._discoverLocalSchemas().catch(() => []);
      const combined = Array.isArray(items) ? [...items] : [];
      // Ensure unique ids by prefixing local entries
      for (const ls of localSchemas) {
        const id = `local:${ls.id || ls.name || ls.url}`;
        combined.push({ id, name: `${ls.name || ls.id || 'Local Schema'} (local)`, url: ls.url, _source: 'local' });
      }
      this.schemas = combined;
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
      const selected = this.schemas.find((s) => s.id === schemaId) || {};
      let schema;
      let initialData = {};
      if (selected.url) {
        // Load local schema directly by URL
        const res = await fetch(new URL(selected.url, window.location.origin), { cache: 'no-store' });
        if (!res.ok) throw new Error(`Failed to fetch local schema (${res.status})`);
        schema = await res.json();
      } else {
        // Load from default manifest-backed source
        const loaded = await loadSchemaWithDefaults(schemaId);
        schema = loaded.schema; initialData = loaded.initialData;
      }
      this._selectedSchemaName = selected.name || schema?.title || schemaId;
      // Prefer existing form data from the loaded page if present
      const dataToUse = (this.documentData && this.documentData.formData)
        ? this.documentData.formData
        : initialData;
      if (!this._formApi) {
        // Lazy-load the form mount API
        const { default: mountFormUI } = await import('./libs/form-ui/core/form-mount.js');
        // Debounced sync function
        if (!this._onFormChangeDebounced) {
          this._onFormChangeDebounced = this._debounce((next) => {
            const updated = { ...(this.documentData || {}), formData: next, schemaId };
            this.documentData = updated;
          }, 200);
        }
        this._formApi = mountFormUI({
          mount: mountEl,
          schema,
          data: dataToUse,
          ui: { showRemove: false, fixedSidebar: true, renderAllGroups: true },
          onChange: (next) => {
            // Sync live changes back to pageData.formData (debounced)
            this._onFormChangeDebounced(next);
          },
          onRemove: () => {
            try { this._formApi?.destroy(); } catch {}
            this._formApi = null;
            if (this.documentData) {
              const { formData, ...rest } = this.documentData;
              this.documentData = { ...rest };
            }
          },
        });
      } else {
        this._formApi.updateSchema(schema);
        this._formApi.updateData(dataToUse);
      }
      // Ensure the page data reflects the current form state immediately
      this.documentData = { ...(this.documentData || {}), formData: dataToUse, schemaId };
      // Close dialog after successful load
      this.showSchemaDialog = false;
      // Update URL with selected schema without reloading
      try {
        const url = new URL(window.location.href);
        url.searchParams.set('schema', schemaId);
        window.history.replaceState({}, '', url);
      } catch {}
    } catch (e) {
      this.schemaError = `Failed to load schema: ${e?.message || e}`;
    }
  }

  async _discoverLocalSchemas() {
    const found = [];
    const base = new URL('./local-schema/', import.meta.url);
    const tryAdd = async (relPath, nameHint) => {
      try {
        const url = new URL(relPath, base);
        const res = await fetch(url, { cache: 'no-store', method: 'HEAD' });
        if (!res.ok) return;
        found.push({ id: relPath, name: nameHint || relPath, url: url.pathname });
      } catch {}
    };

    // 1) Conventional default: llrc.schema.json
    await tryAdd('llrc.schema.json', 'LLRC (local)');

    // 2) Allow query param overrides: ?localSchemas=a.json,b.json
    try {
      const url = new URL(window.location.href);
      const list = url.searchParams.get('localSchemas') || url.searchParams.get('localSchema');
      if (list) {
        const parts = list.split(',').map((s) => s.trim()).filter(Boolean);
        // Fetch with GET to ensure JSON is valid
        for (const p of parts) {
          try {
            const u = new URL(p, base);
            const r = await fetch(u, { cache: 'no-store' });
            if (!r.ok) continue;
            // Validate JSON shape quickly
            await r.json();
            found.push({ id: p, name: `${p} (local)`, url: u.pathname });
          } catch {}
        }
      }
    } catch {}

    return found;
  }

  onSchemaChange(e) {
    this.selectedSchema = e.target?.value || '';
  }

  disconnectedCallback() {
    try { this._formApi?.destroy(); } catch {}
    this._formApi = null;
    this._disableDialogFocusTrap();
    window.removeEventListener('keydown', this._onGlobalKeydown);
    super.disconnectedCallback();
  }

  firstUpdated() {
    // Global shortcuts
    this._onGlobalKeydown = (e) => {
      const isMac = navigator.platform.toUpperCase().includes('MAC');
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        this._emitSave();
      }
    };
    window.addEventListener('keydown', this._onGlobalKeydown);
  }

  updated(changed) {
    if (changed.has('showSchemaDialog')) {
      if (this.showSchemaDialog) {
        this._previouslyFocused = this.shadowRoot.activeElement || document.activeElement;
        const dialog = this.renderRoot?.querySelector('.modal-dialog');
        const select = this.renderRoot?.querySelector('#schema-select');
        if (select) select.focus();
        this._enableDialogFocusTrap(dialog);
      } else {
        this._disableDialogFocusTrap();
        if (this._previouslyFocused && typeof this._previouslyFocused.focus === 'function') {
          try { this._previouslyFocused.focus(); } catch {}
        }
      }
    }
  }

  _enableDialogFocusTrap(dialog) {
    if (!dialog) return;
    const overlay = this.renderRoot?.querySelector('.modal-overlay');
    const focusable = () => Array.from(dialog.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
      .filter((el) => !el.hasAttribute('disabled'));
    const keyHandler = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        this.showSchemaDialog = false;
        return;
      }
      if (e.key === 'Enter') {
        if (document.activeElement && document.activeElement.tagName === 'SELECT') {
          e.preventDefault();
          this.loadSelectedSchema();
          return;
        }
      }
      if (e.key === 'Tab') {
        const nodes = focusable();
        if (!nodes.length) return;
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault(); last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault(); first.focus();
        }
      }
    };
    this._dialogKeyHandler = keyHandler;
    overlay?.addEventListener('keydown', keyHandler);
  }

  _disableDialogFocusTrap() {
    const overlay = this.renderRoot?.querySelector('.modal-overlay');
    if (overlay && this._dialogKeyHandler) {
      overlay.removeEventListener('keydown', this._dialogKeyHandler);
      this._dialogKeyHandler = null;
    }
  }

  _debounce(fn, wait) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  }

  _emitSave() {
    const formMeta = {
      title: this.documentData?.title || '',
      schemaId: this.documentData?.schemaId || this.selectedSchema || '',
    };
    const detail = {
      pagePath: this._pagePath,
      formMeta,
      formData: this.documentData?.formData || null,
    };
    this.dispatchEvent(new CustomEvent('editor-save', { detail }));
  }

  _getPathDetails() {
    const { org, repo, ref } = this.context || {};
    const parentPath = this._pagePath.split('/').slice(0, -1).join('/');
    const parentName = parentPath.split('/').pop();
    const name = this._pagePath.split('/').pop();
    return {
      owner: org,
      repo,
      ref: ref,
      parent: `${DA_LIVE}/#/${org}/${repo}${parentPath}`,
      parentName,
      name
    }
  }

  async _handleSave(e) {
    const resp = await saveDocument(e.detail);
    console.log('editor-save', resp);
  }

  async _handlePreviewPublish(e) {
    const { action, location } = e.detail;
    const { org, repo } = this.context;

    location.classList.add("is-sending");

    if (action === "preview" || action === "publish") {
      const formMeta = {
        title: this.documentData?.title || '',
        schemaId: this.documentData?.schemaId || this.selectedSchema || '',
      };
      const detail = {
        pagePath: this._pagePath,
        formMeta,
        formData: this.documentData?.formData || null,
      };
      const daResp = await saveDocument(detail);
      if (daResp.error) {
        this.handleError(daResp, action);
        return;
      }

      const aemPath = `/${org}/${repo}${this._pagePath}`;
      let json = await saveToAem(aemPath, "preview");
      if (json.error) {
        this.handleError(json, action, sendBtn);
        return;
      }
      if (action === "publish") {
        json = await saveToAem(aemPath, "live");
        if (json.error) {
          this.handleError(json, action, sendBtn);
          return;
        }
        saveDaVersion(aemPath);
      } 
     
      // const { url: href } = action === "publish" ? json.live : json.preview;
      // const toOpenInAem = href.replace(".hlx.", ".aem.");
      const toOpenInAem = `${MHAST_LIVE}${aemPath}?head=false&schema=true`;
      window.open(toOpenInAem, '_blank');
    }
    location.classList.remove("is-sending");
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
      <da-title details=${JSON.stringify(this._getPathDetails())}></da-title>
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

        ${!this.showSchemaDialog && this._selectedSchemaName ? html`
          <div class="schema-banner">
            <span class="schema-label">Schema:</span>
            <span class="schema-name">${this._selectedSchemaName}</span>
          </div>
        ` : nothing}
        <div id="form-root"></div>

        <h2>Document Data</h2>
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
