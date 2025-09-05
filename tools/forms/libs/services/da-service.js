/*
 * Copyright 2025 Adobe
 */

import DA_SDK from "https://da.live/nx/utils/sdk.js";
import { AEM_ORIGIN, DA_ORIGIN } from "../../utils.js";

/**
 * DaService
 *
 * Thin client for Digital Asset (DA) backend and AEM bridge operations.
 * Handles reading/writing HTML documents via DA APIs and triggering AEM flows.
 */
export class DaService {
  /** @param {object} context - Must include `services.storage` for parse/serialize */
  constructor(context = {}) {
    this._context = context || {};
    this._storage = this._context?.services?.storage;
  }

  /**
   * Read a source HTML document from DA, parse into metadata and data via storage.
   * @returns {Promise<{pagePath:string,title:string,formData:object,schemaId?:string}>}
   */
  async readDocument(pagePath, { storageVersion } = {}) {
    const { context, token } = await DA_SDK;
    const { org, repo } = context;
    const opts = { headers: { Authorization: `Bearer ${token}` } };
    const fullpath = `${DA_ORIGIN}/source/${org}/${repo}${pagePath}.html`;
    const response = await fetch(fullpath, opts);
    if (!response.ok) {
      return { pagePath, title: 'Untitled Page', formData: {}, schemaId: undefined };
    }
    const htmlContent = await response.text();
    const { metadata, data } = await this._storage.parseDocument(htmlContent, { storageVersion });
    const result = { pagePath, title: metadata.title || 'Untitled Page', formData: data, schemaId: metadata.schemaId };
    console.log('readDocument', result);
    return result;
  }

  /**
   * Serialize form details to HTML and PUT to DA source. Returns status info.
   */
  async saveDocument(details, { storageVersion, ext = 'html' } = {}) {
    console.log('saveDocument', { storageVersion, details });
    const { context, token } = await DA_SDK;
    const { org, repo } = context;
    const content = this._storage.serializeDocument({ formMeta: details.formMeta, formData: details.formData }, { storageVersion });
    const body = `\n  <body>\n    <header></header>\n    <main>\n      <div>\n        ${content}\n      </div>\n    </main>\n    <footer></footer>\n  </body>\n`;
    const blob = new Blob([body], { type: "text/html" });
    const formData = new FormData();
    formData.append('data', blob);
    const opts = { headers: { Authorization: `Bearer ${token}` }, method: 'PUT', body: formData };
    const daPath = `/${org}/${repo}${details.pagePath}`;
    const fullpath = `${DA_ORIGIN}/source${daPath}.${ext}`;
    try {
      const daResp = await fetch(fullpath, opts);
      return { daPath, daStatus: daResp.status, daResp, ok: daResp.ok };
    } catch (error) {
      return { error };
    }
  }

  /**
   * Trigger an AEM-side action (e.g., preview/publish) for the given DA path.
   */
  async saveToAem(path, action) {
    const [owner, repo, ...parts] = path.slice(1).toLowerCase().split('/');
    const aemPath = parts.join('/');
    const url = `${AEM_ORIGIN}/${action}/${owner}/${repo}/main/${aemPath}`;
    const resp = await fetch(url, { method: 'POST' });
    if (!resp.ok) {
      const { status } = resp;
      const message = [401, 403].some((s) => s === status) ? 'Not authorized to' : 'Error during';
      return { error: { status, type: 'error', message } };
    }
    return resp.json();
  }

  /** Create a DA version label entry for the saved resource. */
  async saveDaVersion(path, ext = 'html') {
    const fullPath = `${DA_ORIGIN}/versionsource${path}.${ext}`;
    const { token } = await DA_SDK;
    const opts = { headers: { Authorization: `Bearer ${token}` }, method: 'POST', body: JSON.stringify({ label: 'Published' }) };
    try { await fetch(fullPath, opts); } catch {}
  }
}

export default DaService;


