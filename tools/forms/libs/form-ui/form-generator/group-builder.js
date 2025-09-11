/**
 * GroupBuilder
 *
 * Builds content groups and sections from a JSON Schema while preserving
 * property order. Produces a map of group/section ids to their DOM elements
 * and metadata, used later by navigation and highlighting features.
 */

import { createSection } from './section-builder.js';
import { UI_CLASS as CLASS } from '../constants.js';
import { pathToGroupId } from './path-utils.js';
import { renderGroupContainer, renderPrimitivesIntoGroup } from '../renderers/group-renderer.js';
import { ICONS } from '../utils/icon-urls.js';
import { render } from 'da-lit';
import { separatorTemplate } from '../templates/separator.js';
// Debug logging for group building
const GB_DEBUG = true;
const gbLog = (...args) => { if (GB_DEBUG) { try { console.debug('[form-ui][groups]', ...args); } catch {} } };

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
  constructor({ inputFactory, formatLabel, hasPrimitiveFields, generateObjectFields, generateInput, generateField, isOptionalGroupActive = () => true, onActivateOptionalGroup = () => {}, refreshNavigation = () => {}, derefNode = (n) => n, getSchemaTitle = (s, k) => k, normalizeSchema, renderAllGroups = false }) {
    this.inputFactory = inputFactory;
    this.formatLabel = formatLabel;
    this.hasPrimitiveFields = hasPrimitiveFields;
    this.generateObjectFields = generateObjectFields;
    this.generateInput = generateInput;
    this.generateField = generateField;
    this.isOptionalGroupActive = isOptionalGroupActive;
    this.onActivateOptionalGroup = onActivateOptionalGroup;
    this.refreshNavigation = refreshNavigation;
    this.derefNode = derefNode;
    this.getSchemaTitle = getSchemaTitle;
    this.normalizeSchema = normalizeSchema;
    this.renderAllGroups = true;
    this._maxDepth = 50;
  }

  /** Inline builder that preserves declaration order; appends child groups/fields inline. */
  buildInline(container, rawSchema, breadcrumbPath = [], schemaPath = [], outMap = new Map(), seenRefs = new Set(), depth = 0) {
    if (depth > this._maxDepth) return outMap;
    const schema = this.normalizeSchema ? this.normalizeSchema(rawSchema) : rawSchema;
    if (!schema || schema.type !== 'object' || !schema.properties) return outMap;

    const groupTitle = schema.title || (breadcrumbPath.length > 0 ? breadcrumbPath[breadcrumbPath.length - 1] : 'Root');
    const currentPath = [...breadcrumbPath];
    gbLog('buildInline:enter', { schemaPath: schemaPath.join('.'), title: groupTitle, keys: Object.keys(schema.properties || {}) });

    const groupPath = schemaPath.length > 0 ? schemaPath.join('.') : 'root';
    const { groupId, element: groupContainer, contentEl: groupContent } = renderGroupContainer({
      container,
      title: groupTitle,
      breadcrumbPath: currentPath,
      schemaPath,
      addHeader: currentPath.length > 0,
    });
    outMap.set(groupId, { element: groupContainer, path: currentPath, title: groupTitle, isSection: false });

    const requiredSet = new Set(schema.required || []);
    const pathPrefix = schemaPath.length > 0 ? schemaPath.join('.') : '';

    let pendingParentSeparator = false;
    Object.entries(schema.properties).forEach(([key, originalPropSchema]) => {
      const propSchema = this.derefNode(originalPropSchema) || originalPropSchema;
      const isObjectType = !!(propSchema && (propSchema.type === 'object' || (Array.isArray(propSchema.type) && propSchema.type.includes('object'))));
      const isArrayOfObjects = !!(propSchema && propSchema.type === 'array' && ((propSchema.items && (propSchema.items.type === 'object' || propSchema.items.properties)) || !!propSchema.items?.$ref));
      const hasRef = !!originalPropSchema?.$ref || !!propSchema?.$ref;

      const nestedBreadcrumbPath = [...currentPath, this.getSchemaTitle(propSchema, key)];
      const nestedSchemaPath = [...schemaPath, key];
      const nestedPathStr = nestedSchemaPath.join('.');
      const isOptional = !requiredSet.has(key);

      // Always render optional groups; do not gate by activation state.

      if (isObjectType && propSchema.properties) {
        gbLog('inline:child-object', { nestedPathStr: nestedPathStr, keys: Object.keys(propSchema.properties || {}) });
        // Prevent circular recursion via repeated $ref on current path
        const refStr = originalPropSchema?.$ref || propSchema?.$ref || null;
        if (refStr && seenRefs.has(refStr)) {
          return;
        }
        if (refStr) seenRefs.add(refStr);
        // recurse as an inline child group
        this.buildInline(groupContent, propSchema, nestedBreadcrumbPath, nestedSchemaPath, outMap, seenRefs, depth + 1);
        if (refStr) seenRefs.delete(refStr);
        // mark that after this inline group ends, if we continue with parent primitives, we should show a separator with parent title
        pendingParentSeparator = true;
        return;
      }

      // arrays-of-objects or primitive fields are handled by generateField()
      const fieldEl = this.generateField(key, propSchema, requiredSet.has(key), pathPrefix);
      if (fieldEl) gbLog('inline:emit-field', { key, pathPrefix });
      if (fieldEl) {
        if (pendingParentSeparator && !isArrayOfObjects) {
          const mount = document.createElement('div');
          render(separatorTemplate({ title: groupTitle }), mount);
          groupContent.appendChild(mount.firstElementChild);
          pendingParentSeparator = false;
        }
        groupContent.appendChild(fieldEl);
      }
    });

    return outMap;
  }

  /**
   * Hierarchical builder that creates concrete groups for primitives and recurses
   * into nested objects/arrays-of-objects, creating sections when a node has only
   * children and no primitives.
   */
  build(container, rawSchema, breadcrumbPath = [], schemaPath = [], outMap = new Map(), seenRefs = new Set(), depth = 0) {
    if (depth > this._maxDepth) return outMap;
    const schema = this.normalizeSchema ? this.normalizeSchema(rawSchema) : rawSchema;
    if (schema.type !== 'object' || !schema.properties) return outMap;

    const groupTitle = schema.title || (breadcrumbPath.length > 0 ? breadcrumbPath[breadcrumbPath.length - 1] : 'Root');
    const currentPath = [...breadcrumbPath];

    const primitiveFields = {};
    const nestedGroups = {};
    let childrenHost = container;

    Object.entries(schema.properties).forEach(([key, originalPropSchema]) => {
      const propSchema = this.derefNode(originalPropSchema) || originalPropSchema;
      const isObjectType = (
        propSchema && (
          propSchema.type === 'object'
          || (Array.isArray(propSchema.type) && propSchema.type.includes('object'))
        )
      );
      const isArrayOfObjects = (
        propSchema && propSchema.type === 'array' && (
          (propSchema.items && (propSchema.items.type === 'object' || propSchema.items.properties))
          || !!propSchema.items?.$ref
          || Array.isArray(propSchema.items?.oneOf)
        )
      );

      if (isArrayOfObjects) {
        nestedGroups[key] = { schema: propSchema, original: originalPropSchema, hasRef: !!originalPropSchema?.$ref, isArrayGroup: true };
      } else if (isObjectType && propSchema.properties) {
        nestedGroups[key] = { schema: propSchema, original: originalPropSchema, hasRef: !!originalPropSchema?.$ref, isArrayGroup: false };
      } else {
        primitiveFields[key] = propSchema;
      }
    });

    if (Object.keys(primitiveFields).length > 0) {
      const pathPrefix = schemaPath.length > 0 ? schemaPath.join('.') : '';
      const { groupId, element, contentEl } = renderGroupContainer({
        container,
        title: groupTitle,
        breadcrumbPath: currentPath,
        schemaPath,
        addHeader: currentPath.length > 0,
      });
      renderPrimitivesIntoGroup({
        contentEl,
        properties: primitiveFields,
        required: schema.required || [],
        pathPrefix,
        generateObjectFields: this.generateObjectFields.bind(this),
      });
      outMap.set(groupId, { element, path: currentPath, title: groupTitle, isSection: false });
      childrenHost = contentEl;
    }

    Object.entries(nestedGroups).forEach(([key, meta]) => {
      const { schema: propSchema, original: originalPropSchema, hasRef, isArrayGroup } = meta;
      const nestedBreadcrumbPath = [...currentPath, this.getSchemaTitle(propSchema, key)];
      const nestedSchemaPath = [...schemaPath, key];
      const nestedPathStr = nestedSchemaPath.join('.');
      const isOptional = !(schema.required || []).includes(key);

      // Always render optional nested groups

      if (!this.hasPrimitiveFields(propSchema) && Object.keys(propSchema.properties || {}).length > 0) {
        const sectionPath = nestedSchemaPath.join('.');
        const { sectionId, element } = createSection(childrenHost, this.getSchemaTitle(propSchema, key), sectionPath, nestedBreadcrumbPath);
        outMap.set(sectionId, { element, path: nestedBreadcrumbPath, title: propSchema.title || this.formatLabel(key), isSection: true });
      }

      // If this nested entry is an array-of-objects (active), render as its own group with array UI
      if (isArrayGroup) {
        const { groupId, element, contentEl } = renderGroupContainer({
          container: childrenHost,
          title: this.getSchemaTitle(propSchema, key),
          breadcrumbPath: nestedBreadcrumbPath,
          schemaPath: nestedSchemaPath,
          addHeader: true,
        });
        const pathPrefix = nestedSchemaPath.join('.');
        const arrayUI = this.generateInput(pathPrefix, propSchema);
        if (arrayUI) contentEl.appendChild(arrayUI);
        element.dataset.fieldPath = pathPrefix;
        outMap.set(groupId, { element, path: nestedBreadcrumbPath, title: this.getSchemaTitle(propSchema, key), isSection: false });

        if (true && !isOptional && arrayUI) {
          const itemsContainer = arrayUI.querySelector?.('.form-ui-array-items');
          const addBtn = arrayUI.querySelector?.('.form-content-add');
          if (itemsContainer && itemsContainer.children.length === 0 && addBtn) {
            try { addBtn.click(); } catch { /* noop */ }
          }
        }
      } else {
        // Prevent circular recursion via repeated $ref on current path
        const refStr = originalPropSchema?.$ref || propSchema?.$ref || null;
        if (refStr && seenRefs.has(refStr)) {
          return;
        }
        if (refStr) seenRefs.add(refStr);
        this.build(childrenHost, propSchema, nestedBreadcrumbPath, nestedSchemaPath, outMap, seenRefs, depth + 1);
        if (refStr) seenRefs.delete(refStr);
      }
    });

    return outMap;
  }
}



