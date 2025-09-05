/*
 * ConfigService
 * Parses URL parameters and normalizes flags/config for the editor runtime.
 */

/**
 * ConfigService
 *
 * Parses editor URL query/hash parameters and normalizes runtime flags.
 */
export class ConfigService {
  /** Parse URL and return normalized config flags and paths. */
  parseUrl(urlString) {
    try {
      const url = new URL(urlString);
      const params = url.searchParams;
      const hashPath = url.hash?.replace('#/', '/') || '';
      let pagePath = params.get('page') || hashPath || '';
      // Normalize pagePath by stripping leading org/repo if present: /org/repo/... -> /...
      if (pagePath) {
        const parts = pagePath.split('/').filter(Boolean);
        if (parts.length > 2) {
          pagePath = '/' + parts.slice(2).join('/');
        } else if (!pagePath.startsWith('/')) {
          pagePath = '/' + pagePath;
        }
      }
      const schemaFromUrl = params.get('schema') || '';
      const storageVersion = params.get('storage') || '';
      
      const showNavConnectors = params.get('showNavConnectors') ? (params.get('showNavConnectors') !== 'false') : true;
      const allowLocalSchemas = params.get('allowLocalSchemas') === 'true';
      const localSchemasParam = params.get('localSchemas') || params.get('localSchema') || '';
      const localSchemas = localSchemasParam
        ? localSchemasParam.split(',').map((s) => s.trim()).filter(Boolean)
        : [];
      return {
        pagePath,
        schemaFromUrl,
        storageVersion,
        showNavConnectors,
        allowLocalSchemas,
        localSchemas,
      };
    } catch {
      return { pagePath: '', schemaFromUrl: '', storageVersion: '', showNavConnectors: false, allowLocalSchemas: false, localSchemas: [] };
    }
  }
}

export default ConfigService;


