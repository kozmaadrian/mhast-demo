/**
 * JSON to HTML Table Converters using HAST (HTML Abstract Syntax Tree)
 * 
 * Dependencies required:
 * - hastscript: for creating HAST nodes
 * - hast-util-to-html: for converting HAST to HTML string
 * 
 * Install with: npm install hastscript hast-util-to-html
 */

// Import HAST utilities (these would be imported in a real project)
// import { h } from 'hastscript';
// import { toHtml } from 'hast-util-to-html';
import {h} from 'https://esm.sh/hastscript@9'
import {fromHtml} from 'https://esm.sh/hast-util-from-html@2'
import {toHtml} from 'https://esm.sh/hast-util-to-html@9'
import {select, selectAll} from 'https://esm.sh/hast-util-select@6'
import {toString} from 'https://esm.sh/hast-util-to-string@3'
import { readBlockConfig, toClassName } from '../../utils.js';

/**
 * Converts JSON data to HTML DIV table format using HAST
 * @param {Object} jsonData - The JSON object to convert
 * @param {string} rootName - The name of the root object (default: 'Product')
 * @returns {string} HTML string with DIV tables
 */
export function jsonToHtml(jsonData, rootName = 'Form') {
  const processedObjects = new Set();
  const objectQueue = [];
  const tables = [];
  
  // Helper function to generate a unique reference ID
  function generateRefId(name, number = 0) {
    return `${toClassName(name)}-${number}`;
  }
  
  // Helper function to check if a value is an object (but not array or null)
  function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }
  
  // Helper function to create a table using HAST and DIV structure
  function createTable(name, data, refId = null) {
    const tableHeader = refId ? `${name} ${refId}` : name;
    const rows = [];

    // Data rows
    for (const [key, value] of Object.entries(data)) {
      // handle objects
      // TODO: handle arrays
      if (isObject(value)) {
        const childRefId = generateRefId(key, objectQueue.length);
        rows.push(
          h('div', {}, [
            h('div', {}, key),
            h('div', {}, `#${childRefId}`)
          ])
        );
        
        // Add child object to queue if not already processed
        if (!processedObjects.has(childRefId)) {
          objectQueue.push({ name: key, data: value, refId: childRefId });
          processedObjects.add(childRefId);
        }
      } else {
        rows.push(
          h('div', {}, [
            h('div', {}, key),
            h('div', {}, String(value))
          ])
        );
      }
    }
    
    return h('div', { class: tableHeader }, rows);
  }
  
  // Process root object
  tables.push(createTable(rootName, jsonData));
  processedObjects.add(generateRefId(rootName));
  
  // Process all child objects in queue
  while (objectQueue.length > 0) {
    const { name, data, refId } = objectQueue.shift();   
    tables.push(createTable(name, data, refId));
  }
  
  const rootNode = {
    type: 'root',
    children: tables
  };
  return toHtml(rootNode);
}

/**
 * Converts HTML DIV table format back to JSON object using HAST
 * @param {string} htmlString - The HTML string with DIV tables to convert
 * @returns {Object} The reconstructed JSON object
 */
export function htmlToJson(htmlString) {
  const blocks = {};
  const references = {};
  let metadata = {};
  
  // Parse HTML to HAST
  const hastTree = fromHtml(htmlString);
  
  // Find all table DIV structures
  const tableDivs = selectAll('main > div > div', hastTree);
  
  // Helper function to parse rows into block data
  function parseRowsToBlockData(rows) {
    const data = {};
    for (let i = 0; i < rows.length; i++) {
      const cells = rows[i].children.filter(child => child.type === 'element');
      if (cells.length >= 2) {
        const key = toString(cells[0]).trim();
        const value = toString(cells[1]).trim();

        if (value.startsWith('#')) {
          data[key] = value;
        } else {
          data[key] = parseValue(value);
        }
      }
    }
    return data;
  }

  // Process each table
  tableDivs.forEach((tableNode) => {
    const rows = tableNode.children.filter(child => child.type === 'element');
    if (rows.length < 2) return;

    // get block name from class name
    const blockName = tableNode.properties?.className?.[0];
    const refId = tableNode.properties?.className?.[1];

    if (blockName === 'form') {
      metadata = parseRowsToBlockData(rows);
      return;
    }

    // Parse data rows
    const blockData = parseRowsToBlockData(rows);
    
    // Store table data
    if (Object.keys(blockData).length > 0) {
      if (refId) {
        blocks[refId] = blockData;
        references[refId] = blockName;
      } else {
        blocks['__root__'] = blockData;
      }
    }
  });
  
  // Helper function to parse values to appropriate types
  function parseValue(value) {
    if (value === '') return '';
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (!isNaN(value) && !isNaN(parseFloat(value)) && value !== '') {
      return parseFloat(value);
    }
    return value;
  }
  
  // Helper function to resolve references recursively
  function resolveReferences(obj) {
    const resolved = {};
    
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string' && value.startsWith('#')) {
        const refId = value.substring(1);
        if (blocks[refId]) {
          resolved[key] = resolveReferences(blocks[refId]);
        } else {
          console.warn(`Reference ${refId} not found`);
          resolved[key] = null;
        }
      } else {
        resolved[key] = value;
      }
    }
    
    return resolved;
  }
  
  // Start with root table and resolve all references
  const rootData = blocks['__root__'] || {};
  return {metadata, data: resolveReferences(rootData)};
}