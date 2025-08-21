import DA_SDK from "https://da.live/nx/utils/sdk.js";
import { AEM_ORIGIN, DA_ORIGIN, readBlockConfig } from "../../utils.js";
import { htmlToJson, jsonToHtml } from "./storage.js";

/**
 * Reads document data using the DA SDK
 * @param {string} pagePath - The page path to read document for
 * @returns {Promise<Object>} Promise that resolves to document data
 */
export async function readDocument(pagePath) {
  try {
    const { context, token } = await DA_SDK;
    const { org, repo } = context;
    const opts = {
      headers: { Authorization: `Bearer ${token}` },
    };
    const fullpath = `${DA_ORIGIN}/source/${org}/${repo}${pagePath}.html`;
    const response = await fetch(fullpath, opts);

    if (!response.ok) {
      console.warn('Failed to fetch page:', response.status, response.statusText);
      return {
        pagePath: pagePath,
        title: 'Untitled Page',
        formData: {},
        schemaId: undefined
      };
    }

    // Parse the HTML content to extract JSON and metadata
    const htmlContent = await response.text();
    const {metadata, data} = htmlToJson(htmlContent);

    // Extract page metadata and content
    const pageData = {
      pagePath: pagePath,
      title: metadata.title || 'Untitled Page',
      formData: data,
      schemaId: metadata.schemaId
    };

    return pageData;
  } catch (error) {
    console.error('Error fetching document:', error);
    throw new Error(`Failed to read document at ${pagePath}: ${error.message}`);
  }
}

export async function saveDocument(details) {
  const { context, token } = await DA_SDK;
  const { org, repo } = context;

  const form = jsonToHtml(details.formMeta);
  const data = jsonToHtml(details.formData, details.formMeta.schemaId);

  const body = `
  <body>
    <header></header>
    <main>
    <div>
      ${form}
      ${data}
    </div>
    </main>
    <footer></footer>
  </body>
`;

  const blob = new Blob([body], { type: "text/html" });
  const formData = new FormData();
  formData.append('data', blob);

  const opts = {
    headers: { Authorization: `Bearer ${token}` },
    method: "PUT",
    body: formData,
  };

  const daPath = `/${org}/${repo}${details.pagePath}`;
  const fullpath = `${DA_ORIGIN}/source${daPath}.html`;

  try {
    const daResp = await fetch(fullpath, opts);
    return { daPath, daStatus: daResp.status, daResp, ok: daResp.ok };
  } catch (error) {
    console.error('Error fetching document:', error);
    return { error };
  }
}

export async function saveToAem(path, action) {
  const [owner, repo, ...parts] = path.slice(1).toLowerCase().split('/');
  const aemPath = parts.join('/');

  const url = `${AEM_ORIGIN}/${action}/${owner}/${repo}/main/${aemPath}`;
  const resp = await fetch(url, { method: 'POST' });
  // eslint-disable-next-line no-console
  if (!resp.ok) {
    const { status } = resp;
    const message = [401, 403].some((s) => s === status) ? 'Not authorized to' : 'Error during';
    return {
      error: {
        status,
        type: 'error',
        message,
      },
    };
  }
  return resp.json();
}

export async function saveDaVersion(path, ext = 'html') {
  const fullPath = `${DA_ORIGIN}/versionsource${path}.${ext}`;
  const { token } = await DA_SDK;
  
  const opts = {
    headers: { Authorization: `Bearer ${token}` },
    method: 'POST',
    body: JSON.stringify({ label: 'Published' }),
  };

  try {
    await fetch(fullPath, opts);
  } catch {
    // eslint-disable-next-line no-console
    console.log('Error creating auto version on publish.');
  }
}
