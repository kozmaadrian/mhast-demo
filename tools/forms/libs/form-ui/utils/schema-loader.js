/**
 * Schema Loader for Form UI
 * Loads JSON schemas from GitHub repository
 */
/* eslint-disable no-console */

let SCHEMA_CONFIG = {
  owner: 'kozmaadrian',
  repo: 'mhast-demo',
  ref: 'main',
  basePath: 'forms/',
};

function buildBaseUrl() {
  const { owner, repo, basePath } = SCHEMA_CONFIG;
  const { ref } = SCHEMA_CONFIG;
  const refSegment = `refs/heads/${ref}`;

  const normalizedBase = basePath?.replace(/^\/+/, '').replace(/\/+/g, '/');
  const baseWithSlash = normalizedBase.endsWith('/') ? normalizedBase : `${normalizedBase}/`;
  const url = `https://raw.githubusercontent.com/${owner}/${repo}/${refSegment}/${baseWithSlash}`;
  return url;
}

class SchemaLoader {
  constructor() {
    this.cache = new Map();
    this.availableSchemas = new Set();
  }

  /**
   * Configure repository for schema loading
   * @param {{owner:string, repo:string, ref?:string, basePath?:string}} cfg
   */
  configure(cfg = {}) {
    // Normalize ref: "local" is not a real branch on GitHub raw
    const incomingRef = (cfg.ref || SCHEMA_CONFIG.ref || 'main');
    const normalizedRef = incomingRef === 'local' ? 'main' : incomingRef;

    SCHEMA_CONFIG = {
      ...SCHEMA_CONFIG,
      ...cfg,
      ref: normalizedRef,
      basePath: cfg.basePath ?? SCHEMA_CONFIG.basePath ?? 'forms/',
    };
    // Clear cache when switching sources
    this.clearCache();
  }

  /**
   * Load a schema by name from the GitHub repository
   * @param {string} schemaName - Name of the schema (without .schema.json extension)
   * @returns {Promise<object>} The loaded schema
   */
  async loadSchema(schemaName) {
    // Check cache first
    if (this.cache.has(schemaName)) {
      return this.cache.get(schemaName);
    }

    try {
      const url = `${buildBaseUrl()}${schemaName}.schema.json`;

      const response = await fetch(url);
      if (!response.ok) {
        console.warn('[schema-loader] fetch failed', response.status, response.statusText);
        throw new Error(`Failed to load schema ${schemaName}: ${response.status} ${response.statusText}`);
      }

      const schema = await response.json();

      // Validate that it's a usable JSON schema root
      // Accept either:
      // - object with properties
      // - root $ref to an object definition
      // - composition keywords present (allOf/oneOf/anyOf) which imply structure
      const hasProps = schema && schema.type === 'object' && typeof schema.properties === 'object';
      const hasRef = schema && typeof schema.$ref === 'string' && schema.$ref.length > 0;
      const hasComposition = schema && (Array.isArray(schema.allOf) || Array.isArray(schema.oneOf) || Array.isArray(schema.anyOf));
      if (!hasProps && !hasRef && !hasComposition) {
        throw new Error(`Invalid schema format for ${schemaName}`);
      }

      // Cache the schema
      this.cache.set(schemaName, schema);
      this.availableSchemas.add(schemaName);

      return schema;
    } catch (error) {
      // Only log errors that aren't 404s during discovery
      console.error(`[schema-loader] Error loading schema ${schemaName}:`, error);
      throw error;
    }
  }

  /**
   * Discover available schemas by trying to load a manifest or common schema names
   * @returns {Promise<string[]>} Array of available schema names
   */
  async discoverSchemas() {
    // Try to load a manifest file first
    try {
      const manifestUrl = `${buildBaseUrl()}manifest.json`;
      const response = await fetch(manifestUrl);
      if (response.ok) {
        const manifest = await response.json();
        if (manifest.schemas && Array.isArray(manifest.schemas)) {
          // Validate that each schema in manifest can be loaded
          const validSchemas = [];
          for (const schemaName of manifest.schemas) {
            try {
              await this.loadSchema(schemaName);
              validSchemas.push(schemaName);
            } catch (error) {
              // Schema in manifest doesn't exist, skip it
              console.warn('[schema-loader] manifest entry failed:', schemaName, error?.message || error);
            }
          }
          return validSchemas;
        }
        // Manifest loaded but doesn't have valid schemas array
        console.warn('[schema-loader] Manifest loaded but invalid format:', manifest);
      }
    } catch (error) {
      // Manifest loading or parsing failed
      console.warn('[schema-loader] Failed to load or parse manifest:', error?.message || error);
    }

    // No fallback schemas - return empty array if manifest is not available
    return [];
  }

  /**
   * Get list of cached schema names
   * @returns {string[]} Array of cached schema names
   */
  getCachedSchemas() {
    return Array.from(this.availableSchemas);
  }

  /**
   * Clear the schema cache
   */
  clearCache() {
    this.cache.clear();
    this.availableSchemas.clear();
  }

  /**
   * Format schema name for display
   * @param {string} schemaName - Raw schema name
   * @returns {string} Formatted display name
   */
  formatSchemaName(schemaName) {
    return `${schemaName
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')} Form`;
  }
}

// Create singleton instance
const schemaLoader = new SchemaLoader();

export default schemaLoader;
