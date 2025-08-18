/**
 * Form UI Commands for ProseMirror
 * Commands to insert and manage form UI elements
 */

// Minimal helper to create the code-block content that the nodeview understands
import schemaLoader from '../utils/schema-loader.js';

// Editor-agnostic: useful in standalone contexts too
export function createFormCodeBlock(schema, data = {}, schemaId = null) {
  const formBlock = {
    schema: schemaId || 'inline',
    data,
  };

  return JSON.stringify(formBlock, null, 2);
}

/**
 * Insert a form code block with the specified schema
 */
export function insertFormBlock(schema, data = {}) {
  return (state, dispatch) => {
    const { code_block } = state.schema.nodes;
    if (!code_block) return false;

    const content = createFormCodeBlock(schema, data);
    const node = code_block.create({}, state.schema.text(content));

    if (dispatch) {
      const tr = state.tr.replaceSelectionWith(node).scrollIntoView();
      dispatch(tr);
    }

    return true;
  };
}

/**
 * Remove the form block at the current selection if it's a form code block
 */
export function removeFormBlockCommand() {
  return (state, dispatch) => {
    const { $from } = state.selection;
    const node = $from.node($from.depth);
    if (!node || node.type.name !== 'code_block') return false;

    // Simple heuristic: treat any code_block containing __schema as a form block
    const textContent = node.textContent || '';
    if (!textContent.includes('__schema')) return false;

    if (dispatch) {
      const pos = $from.before($from.depth);
      const tr = state.tr.delete(pos, pos + node.nodeSize).scrollIntoView();
      dispatch(tr);
    }
    return true;
  };
}

/**
 * Insert a form block with a dynamically loaded schema from GitHub
 */
export function insertDynamicForm(schemaName) {
  return async (state, dispatch) => {
    try {
      const schema = await schemaLoader.loadSchema(schemaName);

      if (!schema) {
        return false;
      }

      // Create initial data structure based on schema
      const formGenerator = new (await import('../core/form-generator.js')).default(schema);
      const initialData = formGenerator.generateBaseJSON(schema);

      // Insert with schema ID reference
      const { code_block } = state.schema.nodes;
      if (!code_block) return false;

      const content = createFormCodeBlock(schema, initialData, schemaName);
      const node = code_block.create({}, state.schema.text(content));

      if (dispatch) {
        const tr = state.tr.replaceSelectionWith(node).scrollIntoView();
        dispatch(tr);
      }

      return true;
    } catch (error) {
      // Loading failed; do not insert a fallback
      return false;
    }
  };
}

/**
 * Editor-agnostic helpers (for reuse outside ProseMirror)
 */

// Load a schema by name and build initial data based on defaults and types
export async function loadSchemaWithDefaults(schemaName) {
  const schema = await schemaLoader.loadSchema(schemaName);
  const FormGenerator = (await import('../core/form-generator.js')).default;
  const generator = new FormGenerator(schema);
  const initialData = generator.generateBaseJSON(schema);
  return { schema, initialData };
}

// Get list of discoverable schemas without binding to PM commands
export async function discoverSchemasPlain() {
  const names = await schemaLoader.discoverSchemas();
  return names.map((id) => ({ id, name: schemaLoader.formatSchemaName(id) }));
}

/**
 * Get available schemas (only remote schemas now)
 */
export async function getAvailableSchemas() {
  try {
    const remoteSchemas = await schemaLoader.discoverSchemas();
    const remoteSchemaItems = remoteSchemas.map((schemaName) => ({
      id: schemaName,
      name: schemaLoader.formatSchemaName(schemaName),
      type: 'remote',
      command: insertDynamicForm(schemaName),
    }));

    return {
      predefined: [],
      remote: remoteSchemaItems,
      all: remoteSchemaItems,
    };
  } catch (error) {
    return {
      predefined: [],
      remote: [],
      all: [],
    };
  }
}
