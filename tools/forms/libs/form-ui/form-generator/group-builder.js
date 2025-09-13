/**
 * GroupBuilder
 *
 * Builds content groups and sections from a JSON Schema while preserving
 * property order. Produces a map of group/section ids to their DOM elements
 * and metadata, used later by navigation and highlighting features.
 */

import { createSection } from './section-builder.js';
import { renderGroupContainer, renderPrimitivesIntoGroup } from '../renderers/group-renderer.js';
import { pointerToInputName } from '../form-model/path-utils.js';
// Debug logging for group building (disabled by default)
const GB_DEBUG = false;
const gbLog = () => {};

export default class GroupBuilder {
  /**
   * @param {object} deps
   * @param {import('../input-factory.js').default} deps.inputFactory
   * @param {Function} deps.formatLabel
   * @param {Function} deps.hasPrimitiveFields
   * @param {Function} deps.generateObjectFields
   * @param {Function} deps.generateInput
   * @param {Function} deps.generateField
   * @param {Function} [deps.isOptionalGroupActive]
   * @param {Function} [deps.onActivateOptionalGroup]
   * @param {Function} [deps.refreshNavigation]
   * @param {Function} [deps.derefNode]
   * @param {Function} [deps.getSchemaTitle]
   * @param {Function} deps.normalizeSchema
   * @param {boolean} [deps.renderAllGroups]
   */
  constructor({ inputFactory, formatLabel, hasPrimitiveFields, generateObjectFields, generateInput, generateField, isOptionalGroupActive = () => true, onActivateOptionalGroup = () => {}, refreshNavigation = () => {}, derefNode = (n) => n, getSchemaTitle = (s, k) => k, normalizeSchema, renderAllGroups = false, schemaService, schema }) {
    this.inputFactory = inputFactory;
    this.formatLabel = formatLabel;
    this.hasPrimitiveFields = hasPrimitiveFields;
    this.generateObjectFields = generateObjectFields;
    this.generateInput = generateInput;
    this.generateField = generateField;
    // Activation driven by FormModel
    this.isOptionalGroupActive = () => true;
    this.onActivateOptionalGroup = () => {};
    this.refreshNavigation = refreshNavigation;
    this.derefNode = derefNode;
    this.getSchemaTitle = getSchemaTitle;
    this.normalizeSchema = normalizeSchema;
    this.renderAllGroups = true;
    this._maxDepth = 50;
    this.schemaService = schemaService;
    this.rootSchema = schema;
  }

  /**
   * Build UI from a FormModel node (read-only), resolving primitive fields from schema pointers.
   * @param {HTMLElement} container
   * @param {object} modelNode - FormModel node
   * @param {string[]} [breadcrumbPath=[]]
   * @param {Map} [outMap=new Map()]
   * @param {number} [depth=0]
   * @returns {Map}
   */
  buildFromModel(container, modelNode, breadcrumbPath = [], outMap = new Map(), depth = 0) {
    if (!modelNode || depth > this._maxDepth) return outMap;

    const pointer = modelNode.schemaPointer || '#';
    const effective = this.schemaService.getEffectiveNodeAtPointer(this.rootSchema, pointer) || {};
    const dottedPath = modelNode.dataPath ? pointerToInputName(modelNode.dataPath) : '';
    const titleKey = dottedPath ? (dottedPath.split('.').pop() || '') : 'Form';
    const title = dottedPath ? this.schemaService.getTitleAtPointer(this.rootSchema, pointer, titleKey) : 'Form';

    if (modelNode.type === 'object') {
      const hasChildren = !!(effective && effective.properties && Object.keys(effective.properties).length > 0);
      const hasPrimitives = this.hasPrimitiveFields(effective);
      const currentBreadcrumb = breadcrumbPath;

      let childrenHost = container;
      if (hasPrimitives) {
        const pathPrefix = dottedPath;
        const { groupId, element, contentEl } = renderGroupContainer({
          container,
          title,
          breadcrumbPath: currentBreadcrumb,
          schemaPath: dottedPath ? dottedPath.split('.') : [],
          addHeader: currentBreadcrumb.length > 0,
        });
        const primitiveProperties = {};
        Object.entries(effective.properties || {}).forEach(([propKey, originalProp]) => {
          const node = this.derefNode(originalProp) || originalProp;
          const isObjectType = !!(node && (node.type === 'object' || (Array.isArray(node.type) && node.type.includes('object'))));
          const isArrayOfObjects = !!(node && node.type === 'array' && (
            (node.items && (node.items.type === 'object' || node.items.properties))
            || !!node.items?.$ref
            || Array.isArray(node.items?.oneOf)
          ));
          if (!isObjectType && !isArrayOfObjects) {
            primitiveProperties[propKey] = node;
          }
        });
        renderPrimitivesIntoGroup({
          contentEl,
          properties: primitiveProperties,
          required: effective.required || [],
          pathPrefix,
          generateObjectFields: this.generateObjectFields.bind(this),
        });
        outMap.set(groupId, { element, path: currentBreadcrumb, title, isSection: false });
        childrenHost = contentEl;
      } else if (hasChildren && dottedPath) {
        const { sectionId, element } = createSection(container, title, dottedPath, currentBreadcrumb);
        outMap.set(sectionId, { element, path: currentBreadcrumb, title, isSection: true });
        childrenHost = element;
      }

      if (modelNode.children) {
        Object.values(modelNode.children).forEach((child) => {
          const nextBreadcrumb = [...currentBreadcrumb, title];
          this.buildFromModel(childrenHost, child, nextBreadcrumb, outMap, depth + 1);
        });
      }
      return outMap;
    }

    if (modelNode.type === 'array') {
      const { groupId, element, contentEl } = renderGroupContainer({
        container,
        title,
        breadcrumbPath,
        schemaPath: dottedPath ? dottedPath.split('.') : [],
        addHeader: true,
      });
      const propSchema = this.schemaService.getEffectiveNodeAtPointer(this.rootSchema, pointer) || {};
      const arrayUI = this.generateInput(dottedPath, propSchema);
      if (arrayUI) contentEl.appendChild(arrayUI);
      element.dataset.fieldPath = dottedPath;
      outMap.set(groupId, { element, path: breadcrumbPath, title, isSection: false });
      return outMap;
    }

    return outMap;
  }
}



