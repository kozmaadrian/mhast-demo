import mountFormUI from '../../core/form-mount.js';
import { discoverSchemasPlain, loadSchemaWithDefaults } from '../../commands/form-commands.js';
import schemaLoader from '../../utils/schema-loader.js';

const mount = document.getElementById('form-root');
// Simplified demo: no live output panel

// Use static defaults (same as schema-loader defaults)
const defaultSource = { owner: 'kozmaadrian', repo: 'mhast-demo', ref: 'main', basePath: 'forms/' };
try { schemaLoader.configure(defaultSource); } catch {}

let api = null;
let currentInitialData = null;

function ensureMounted(schemaObj, initialData) {
  if (!api) {
    console.log('[form-ui example] mountFormUI', schemaObj?.title || schemaObj);
    api = mountFormUI({
      mount,
      schema: schemaObj,
      data: initialData,
      onChange(next) { console.log('[form-ui example] onChange', next); },
      onRemove() {
        console.log('[form-ui example] remove requested');
        try { api?.destroy(); } catch {}
        api = null;
        currentInitialData = null;
        // Clear the rendered form root
        mount.innerHTML = '';
        // Optionally re-populate schemas so user can pick another
        populateSchemas().catch(() => {});
      },
    });
  } else {
    console.log('[form-ui example] updateSchema + updateData', schemaObj?.title || schemaObj);
    api.updateSchema(schemaObj);
    api.updateData(initialData);
  }
  currentInitialData = initialData;
  // no output rendering
}

// Controls removed for a cleaner demo (toggle/log/reset)

// Populate schema selector from manifest (if available)
async function populateSchemas() {
  try {
    console.log('[form-ui example] discoverSchemasPlain ...');
    const items = await discoverSchemasPlain();
    console.log('[form-ui example] discovered', items);
    const sel = document.getElementById('schema-select');
    sel.innerHTML = `<option value="">-- Select --</option>${items.map((it) => `<option value="${it.id}">${it.name}</option>`).join('')}`;
  } catch (e) {
    console.log('[form-ui example] discoverSchemasPlain failed', e);
    document.getElementById('schema-select').innerHTML = '<option value="">-- No manifest --</option>';
  }
}
await populateSchemas();

document.getElementById('load-selected').addEventListener('click', async () => {
  const sel = document.getElementById('schema-select');
  const name = sel.value; if (!name) return;
  try {
    console.log('[form-ui example] loadSchemaWithDefaults (selected):', name);
    const { schema, initialData } = await loadSchemaWithDefaults(name);
    console.log('[form-ui example] loaded', schema?.title || schema);
    ensureMounted(schema, initialData);
  } catch (e) {
    console.log('[form-ui example] loadSchemaWithDefaults failed', e);
    alert(`Failed to load schema: ${e?.message || e}`);
  }
});
