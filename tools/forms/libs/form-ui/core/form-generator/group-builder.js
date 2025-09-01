/**
 * GroupBuilder
 * Builds sections and groups from a JSON Schema.
 * Returns a Map of groupId → { element, path, title, isSection }.
 */

import { createSection } from './section-builder.js';
import { UI_CLASS as CLASS } from '../constants.js';
import { pathToGroupId } from './path-utils.js';
import { renderGroupContainer, renderPrimitivesIntoGroup } from '../renderers/group-renderer.js';

export default class GroupBuilder {
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
    this.renderAllGroups = !!renderAllGroups;
    this._maxDepth = 50;
  }

  // Inline builder that preserves property order and appends child groups/fields inline
  buildInline(container, rawSchema, breadcrumbPath = [], schemaPath = [], outMap = new Map(), seenRefs = new Set(), depth = 0) {
    if (depth > this._maxDepth) return outMap;
    const schema = this.normalizeSchema ? this.normalizeSchema(rawSchema) : rawSchema;
    if (!schema || schema.type !== 'object' || !schema.properties) return outMap;

    const groupTitle = schema.title || (breadcrumbPath.length > 0 ? breadcrumbPath[breadcrumbPath.length - 1] : 'Root');
    const currentPath = [...breadcrumbPath];

    const groupPath = schemaPath.length > 0 ? schemaPath.join('.') : 'root';
    const groupId = pathToGroupId(groupPath);
    const groupContainer = document.createElement('div');
    groupContainer.className = CLASS.group;
    groupContainer.id = groupId;
    groupContainer.dataset.groupPath = currentPath.join(' > ');

    if (currentPath.length > 0) {
      const groupHeader = document.createElement('div');
      groupHeader.className = CLASS.groupHeader;
      const sep = document.createElement('div');
      sep.className = CLASS.separatorText;
      const label = document.createElement('div');
      label.className = CLASS.separatorLabel;
      const titleSpan = document.createElement('span');
      titleSpan.className = CLASS.groupTitle;
      titleSpan.textContent = groupTitle;
      label.appendChild(titleSpan);
      sep.appendChild(label);
      groupHeader.appendChild(sep);
      groupContainer.appendChild(groupHeader);
    }

    const groupContent = document.createElement('div');
    groupContent.className = CLASS.groupContent;
    groupContainer.appendChild(groupContent);
    container.appendChild(groupContainer);
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

      // Skip optional groups only when not rendering all groups by default
      if (isOptional && !this.renderAllGroups) {
        if ((hasRef || isObjectType || isArrayOfObjects) && !this.isOptionalGroupActive(nestedPathStr)) {
          // skip until activated (sidebar handles add)
          return;
        }
      }

      if (isObjectType && propSchema.properties) {
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
      if (fieldEl) {
        if (pendingParentSeparator && !isArrayOfObjects) {
          // Insert a separator label to visually indicate continuation of parent group
          const sep = document.createElement('div');
          sep.className = CLASS.separatorText;
          const label = document.createElement('div');
          label.className = CLASS.separatorLabel;
          const titleSpan = document.createElement('span');
          titleSpan.className = CLASS.groupTitle;
          titleSpan.textContent = groupTitle;
          label.appendChild(titleSpan);
          sep.appendChild(label);
          groupContent.appendChild(sep);
          pendingParentSeparator = false;
        }
        groupContent.appendChild(fieldEl);
      }
    });

    return outMap;
  }

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
          (propSchema.items && (propSchema.items.type === 'object' || propSchema.items.properties)) || !!propSchema.items?.$ref
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

      // Optional nested object or array-of-objects: skip only when not rendering all groups by default
      if (isOptional && !this.renderAllGroups) {
        if ((isArrayGroup || hasRef) && !this.isOptionalGroupActive(nestedPathStr)) {
          return; // content stays clean; sidebar handles activation
        }
      }

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

        if (this.renderAllGroups && !isOptional && arrayUI) {
          const itemsContainer = arrayUI.querySelector?.('.form-ui-array-items');
          const addBtn = arrayUI.querySelector?.('.form-ui-array-add');
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



