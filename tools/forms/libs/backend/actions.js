import DA_SDK from "https://da.live/nx/utils/sdk.js";
import { AEM_ORIGIN, DA_ORIGIN } from "../../utils.js";
import { parseDocument, serializeDocument } from "./storage.js";

/**
 * Reads document data using the DA SDK
 * @param {string} pagePath - The page path to read document for
 * @returns {Promise<Object>} Promise that resolves to document data
 */
export async function readDocument(pagePath, { storageVersion } = {}) {
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

    // Parse the HTML content to extract JSON and metadata (strategy selectable)
    const htmlContent = await response.text();
    const { metadata, data } = parseDocument(htmlContent, { storageVersion });

    // Extract page metadata and content
    const pageData = {
      pagePath: pagePath,
      title: metadata.title || 'Untitled Page',
      formData: data,
      schemaId: metadata.schemaId
    };
    console.log('readDocument', {storageVersion, pageData});
    return pageData;
  } catch (error) {
    console.error('Error fetching document:', error);
    throw new Error(`Failed to read document at ${pagePath}: ${error.message}`);
  }
}

export async function saveDocument(details, { storageVersion, ext = 'html' } = {}) {
  console.log('saveDocument', {storageVersion, details});
  const { context, token } = await DA_SDK;
  const { org, repo } = context;

  const content = serializeDocument({ formMeta: details.formMeta, formData: details.formData }, { storageVersion });

  const body = `
  <body>
    <header></header>
    <main>
      <div>
        ${content}
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
  const fullpath = `${DA_ORIGIN}/source${daPath}.${ext}`;

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
    console.warn('Error creating auto version on publish.');
  }
}
