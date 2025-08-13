import DA_SDK from 'https://da.live/nx/utils/sdk.js';

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
      headers: { Authorization: `Bearer ${token}` }
    };
    const fullpath = `https://admin.da.live/source/${org}/${repo}${pagePath}.html`;
    const response = await fetch(fullpath, opts);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch page: ${response.status} ${response.statusText}`);
    }
    
    const htmlContent = await response.text();
    
    // Parse the HTML content to extract useful information
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, 'text/html');
    
    // Extract page metadata and content
    const pageData = {
      pagePath: pagePath,
      title: doc.title || 'Untitled Page',
      description: doc.querySelector('meta[name="description"]')?.getAttribute('content') || '',
      content: htmlContent,
      metadata: {
        fetched: new Date().toISOString(),
        contentType: response.headers.get('content-type') || 'text/html',
        contentLength: htmlContent.length,
        lastModified: response.headers.get('last-modified') || null
      },
      // Extract any structured data or schema information
      schemas: Array.from(doc.querySelectorAll('script[type="application/ld+json"]'))
        .map(script => {
          try {
            return JSON.parse(script.textContent);
          } catch (e) {
            return null;
          }
        })
        .filter(Boolean),
      // Extract form-related elements
      forms: Array.from(doc.querySelectorAll('form')).map((form, index) => ({
        id: form.id || `form-${index}`,
        action: form.action || '',
        method: form.method || 'get',
        fields: Array.from(form.querySelectorAll('input, select, textarea')).map(field => ({
          id: field.id || field.name || '',
          name: field.name || '',
          type: field.type || field.tagName.toLowerCase(),
          required: field.required || false,
          placeholder: field.placeholder || '',
          value: field.value || ''
        }))
      }))
    };
    
    return pageData;
    
  } catch (error) {
    console.error('Error fetching document:', error);
    throw new Error(`Failed to read document at ${pagePath}: ${error.message}`);
  }
}
