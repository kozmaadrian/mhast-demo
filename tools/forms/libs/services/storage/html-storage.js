/**
 * HtmlTableStorage
 * Strategy to store form meta/data as semantic HTML (DIV tables via HAST)
 */

import { h } from "https://esm.sh/hastscript@9";
import { fromHtml } from "https://esm.sh/hast-util-from-html@2";
import { toHtml } from "https://esm.sh/hast-util-to-html@9";
import { selectAll } from "https://esm.sh/hast-util-select@6";
import { toString } from "https://esm.sh/hast-util-to-string@3";
import { toClassName } from "../../../utils.js";

const DEFAULT_ROOT_NAME = "Form";

// -----------------------------
// HTML tables helpers (scoped to this module)
// -----------------------------

export function jsonToHtml(jsonData, rootName = DEFAULT_ROOT_NAME) {
  const processedObjects = new Set();
  const objectQueue = [];
  const tables = [];

  function generateRefId(name, number = 0) {
    return `${toClassName(name)}-${number}`;
  }

  function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function createTable(name, data, refId = null) {
    const tableHeader = refId ? `${name} ${refId}` : name;
    const rows = [];
    for (const [key, value] of Object.entries(data)) {
      const childRefId = generateRefId(key, objectQueue.length);
      const combinedRefId = refId ? `${refId}/${childRefId}` : childRefId;
      if (Array.isArray(value)) {
        const arrayRefs = [];
        value.forEach((item, index) => {
          const itemRefId = `${combinedRefId}-${index}`;
          arrayRefs.push(`#${itemRefId}`);
          if (isObject(item)) {
            if (!processedObjects.has(itemRefId)) {
              objectQueue.push({ name: key, data: item, refId: itemRefId });
              processedObjects.add(itemRefId);
            }
          } else {
            if (!processedObjects.has(itemRefId)) {
              objectQueue.push({ name: key, data: { value: item }, refId: itemRefId });
              processedObjects.add(itemRefId);
            }
          }
        });
        rows.push(h("div", {}, [h("div", {}, key), h("div", {}, arrayRefs.join(", "))]));
      } else if (isObject(value)) {
        rows.push(h("div", {}, [h("div", {}, key), h("div", {}, `#${combinedRefId}`)]));
        if (!processedObjects.has(combinedRefId)) {
          objectQueue.push({ name: key, data: value, refId: combinedRefId });
          processedObjects.add(combinedRefId);
        }
      } else {
        rows.push(h("div", {}, [h("div", {}, key), h("div", {}, String(value))]));
      }
    }
    return h("div", { class: tableHeader }, rows);
  }

  tables.push(createTable(rootName, jsonData));
  processedObjects.add(generateRefId(rootName));
  while (objectQueue.length > 0) {
    const { name, data, refId } = objectQueue.shift();
    tables.push(createTable(name, data, refId));
  }
  const rootNode = { type: "root", children: tables };
  return toHtml(rootNode);
}

export async function htmlToJson(htmlString, { schema, schemaId, context, services } = {}) {
  const blocks = {};
  const references = {};
  let metadata = {};
  const hastTree = fromHtml(htmlString);
  const tableDivs = selectAll("main > div > div", hastTree);

  function parseRowsToBlockData(rows) {
    const data = {};
    for (let i = 0; i < rows.length; i++) {
      const cells = rows[i].children.filter((child) => child.type === "element");
      if (cells.length >= 2) {
        const key = toString(cells[0]).trim();
        const value = toString(cells[1]).trim();
        if (value.startsWith("#")) data[key] = value; else data[key] = parseValue(value);
      }
    }
    return data;
  }

  function parseValue(value) {
    if (value === "") return "";
    if (value === "true") return true;
    if (value === "false") return false;
    if (!Number.isNaN(value) && !Number.isNaN(parseFloat(value)) && value !== "") return parseFloat(value);
    return value;
  }

  function getPropertySchema(parentSchema, key) {
    if (!parentSchema) return undefined;
    if (parentSchema.type === "object" && parentSchema.properties && parentSchema.properties[key]) {
      return parentSchema.properties[key];
    }
    return undefined;
  }

  function coercePrimitive(value, expectedType) {
    if (!expectedType) return value;
    if (expectedType === "boolean") {
      if (value === "") return false;
      return Boolean(value);
    }
    if (expectedType === "number") {
      if (value === "") return 0;
      const n = Number(value);
      return Number.isNaN(n) ? value : n;
    }
    if (expectedType === "string") {
      return value === undefined || value === null ? "" : String(value);
    }
    return value;
  }

  function resolveReferences(obj, currentSchema) {
    const resolved = {};
    for (const [key, value] of Object.entries(obj)) {
      const propertySchema = getPropertySchema(currentSchema, key);

      if (typeof value === "string" && value.startsWith("#")) {
        const refIds = value.split(",").map((id) => toClassName(id.substring(1).trim()));
        // If schema says this property is an array, always return an array
        if (propertySchema && propertySchema.type === "array") {
          const itemSchema = propertySchema.items;
          const items = refIds
            .map((refId) => (blocks[refId] ? resolveReferences(blocks[refId], itemSchema) : null))
            .filter((v) => v !== null);
          resolved[key] = items;
        } else {
          // Single or multi refs but no array in schema → collapse single
          const refs = refIds
            .map((refId) => (blocks[refId] ? resolveReferences(blocks[refId], propertySchema) : null))
            .filter((v) => v !== null);
          resolved[key] = refs.length === 1 ? refs[0] : refs;
        }
      } else {
        // Non-ref values: coerce based on schema where possible
        if (propertySchema && propertySchema.type === "array") {
          // Empty or scalar should become []
          if (value === "") {
            resolved[key] = [];
          } else if (Array.isArray(value)) {
            resolved[key] = value;
          } else {
            // Best-effort: wrap a single parsed/coerced item if schema expects primitives
            const itemSchema = propertySchema.items;
            const coerced = coercePrimitive(parseValue(value), itemSchema && itemSchema.type);
            resolved[key] = [coerced];
          }
        } else if (propertySchema && propertySchema.type && propertySchema.type !== "object") {
          resolved[key] = coercePrimitive(parseValue(value), propertySchema.type);
        } else {
          resolved[key] = value;
        }
      }
    }
    return resolved;
  }

  tableDivs.forEach((tableNode) => {
    const rows = tableNode.children.filter((child) => child.type === "element");
    if (rows.length < 1) return;
    const blockName = tableNode.properties?.className?.[0];
    const refId = tableNode.properties?.className?.[1];
    if (blockName === DEFAULT_ROOT_NAME) {
      metadata = parseRowsToBlockData(rows);
      return;
    }
    const blockData = parseRowsToBlockData(rows);
    if (Object.keys(blockData).length > 0) {
      if (refId) {
        blocks[refId] = blockData;
        references[refId] = blockName;
      } else {
        blocks["__root__"] = blockData;
      }
    }
  });

  const rootData = blocks["__root__"] || {};

  // Determine schema to use (prefer provided, fallback to metadata.schemaId)
  let effectiveSchema = schema;
  const schemaName = schemaId || metadata.schemaId;
  try {
    if (!effectiveSchema && schemaName) {
      effectiveSchema = await services.schemaLoader.loadSchema(schemaName);
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[html-storage] Failed to load schema for htmlToJson:', e?.message || e);
  }

  return { metadata, data: resolveReferences(rootData, effectiveSchema) };
}

export default class HtmlTableStorage {
  // Parse html into { metadata, data }
  async parseDocument(htmlString, opts = {}) {
    return htmlToJson(htmlString, opts);
  }
  // Serialize { formMeta, formData } into HTML fragment
  serializeDocument({ formMeta, formData }) {
    const form = jsonToHtml(formMeta || {}, DEFAULT_ROOT_NAME);
    const data = jsonToHtml(formData || {}, formMeta?.schemaId || 'data');
    return `${form}\n${data}`;
  }
}


