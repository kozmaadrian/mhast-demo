import DA_SDK from "https://da.live/nx/utils/sdk.js";
import { readBlockConfig } from "./utils.js";

const AEM_ORIGIN = 'https://admin.hlx.page';
const DA_ORIGIN = 'https://admin.da.live';

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
      throw new Error(
        `Failed to fetch page: ${response.status} ${response.statusText}`
      );
    }

    // Parse the HTML content to extract JSON and metadata
    const htmlContent = await response.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, 'text/html');

    // Extract page metadata and content
    const pageData = {
      pagePath: pagePath,
      title: doc.title || 'Untitled Page',
      description:
        doc
          .querySelector('meta[name="description"]')
          ?.getAttribute('content') || "",
      content: htmlContent,
      metadata: {
        fetched: new Date().toISOString(),
        contentType: response.headers.get('content-type') || 'text/html',
        contentLength: htmlContent.length,
        lastModified: response.headers.get('last-modified') || null,
      },
      // Extract any structured data or schema information
      formData: JSON.parse(doc.querySelector('div > pre > code')?.textContent || '{}'),
    };

    // extract metadata from metadata block
    const metadataBlock = doc.querySelector('div.metadata');
    if (metadataBlock) {
      const metadata = readBlockConfig(metadataBlock);
      pageData.title = metadata.title;
      pageData.schemaId = metadata.schema;
    }

    return pageData;
  } catch (error) {
    console.error('Error fetching document:', error);
    throw new Error(`Failed to read document at ${pagePath}: ${error.message}`);
  }
}

export async function saveDocument(details) {
  const { context, token } = await DA_SDK;
  const { org, repo } = context;
  const body = `
  <body>
    <header></header>
    <main>
    <div>
      <pre><code>${JSON.stringify(details.formData, null, 2)}</code></pre>
      <div class=\"metadata\">
        <div><div><p>title</p></div><div><p>Form</p></div></div>
        <div><div><p>schema</p></div><div><p>${details.schemaId}</p></div></div>
      </div>
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
