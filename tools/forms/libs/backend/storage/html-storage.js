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

export function htmlToJson(htmlString) {
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

  function resolveReferences(obj) {
    const resolved = {};
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === "string" && value.startsWith("#")) {
        const refIds = value.split(",").map((id) => toClassName(id.substring(1).trim()));
        const resolvedRefs = refIds.map((refId) => (blocks[refId] ? resolveReferences(blocks[refId]) : null));
        resolved[key] = resolvedRefs.length === 1 ? resolvedRefs[0] : resolvedRefs;
      } else {
        resolved[key] = value;
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
  return { metadata, data: resolveReferences(rootData) };
}

export default class HtmlTableStorage {
  // Parse html into { metadata, data }
  parseDocument(htmlString) {
    return htmlToJson(htmlString);
  }
  // Serialize { formMeta, formData } into HTML fragment
  serializeDocument({ formMeta, formData }) {
    const form = jsonToHtml(formMeta || {}, DEFAULT_ROOT_NAME);
    const data = jsonToHtml(formData || {}, formMeta?.schemaId || 'data');
    return `${form}\n${data}`;
  }
}


