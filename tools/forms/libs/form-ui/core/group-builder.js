/**
 * GroupBuilder
 * Builds sections and groups recursively from a JSON Schema.
 * Returns a Map of groupId → { element, path, title, isSection } matching previous semantics.
 */

export default class GroupBuilder {
  constructor({ inputFactory, formatLabel, hasPrimitiveFields, generateObjectFields, generateInput, isOptionalGroupActive = () => true, onActivateOptionalGroup = () => {}, refreshNavigation = () => {}, derefNode = (n) => n, getSchemaTitle = (s, k) => k }) {
    this.inputFactory = inputFactory;
    this.formatLabel = formatLabel;
    this.hasPrimitiveFields = hasPrimitiveFields;
    this.generateObjectFields = generateObjectFields;
    this.generateInput = generateInput;
    this.isOptionalGroupActive = isOptionalGroupActive;
    this.onActivateOptionalGroup = onActivateOptionalGroup;
    this.refreshNavigation = refreshNavigation;
    this.derefNode = derefNode;
    this.getSchemaTitle = getSchemaTitle;
  }

  build(container, rawSchema, breadcrumbPath = [], schemaPath = [], outMap = new Map()) {
    const schema = this.normalizeSchema ? this.normalizeSchema(rawSchema) : rawSchema;
    if (schema.type !== 'object' || !schema.properties) return outMap;

    const groupTitle = schema.title || (breadcrumbPath.length > 0 ? breadcrumbPath[breadcrumbPath.length - 1] : 'Root');
    const currentPath = [...breadcrumbPath];

    const primitiveFields = {};
    const nestedGroups = {};

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
      const groupPath = schemaPath.length > 0 ? schemaPath.join('.') : 'root';
      const groupId = `form-group-${groupPath.replace(/\./g, '-')}`;
      const groupContainer = document.createElement('div');
      groupContainer.className = 'form-ui-group';
      groupContainer.id = groupId;
      groupContainer.dataset.groupPath = currentPath.join(' > ');

      if (currentPath.length > 0) {
        const groupHeader = document.createElement('div');
        groupHeader.className = 'form-ui-group-header';
        const groupTitleElement = document.createElement('h3');
        groupTitleElement.className = 'form-ui-group-title';
        groupTitleElement.textContent = groupTitle;
        groupHeader.appendChild(groupTitleElement);
        groupContainer.appendChild(groupHeader);
      }

      const groupContent = document.createElement('div');
      groupContent.className = 'form-ui-group-content';

      const pathPrefix = schemaPath.length > 0 ? schemaPath.join('.') : '';
      this.generateObjectFields(groupContent, primitiveFields, schema.required || [], pathPrefix);

      groupContainer.appendChild(groupContent);
      container.appendChild(groupContainer);

      outMap.set(groupId, { element: groupContainer, path: currentPath, title: groupTitle, isSection: false });
    }

    Object.entries(nestedGroups).forEach(([key, meta]) => {
      const { schema: propSchema, original: originalPropSchema, hasRef, isArrayGroup } = meta;
      const nestedBreadcrumbPath = [...currentPath, this.getSchemaTitle(propSchema, key)];
      const nestedSchemaPath = [...schemaPath, key];
      const nestedPathStr = nestedSchemaPath.join('.');
      const isOptional = !(schema.required || []).includes(key);

      // Optional nested object or array-of-objects: if inactive, do not render in content.
      if ((isArrayGroup || hasRef) && isOptional && !this.isOptionalGroupActive(nestedPathStr)) {
        return; // content stays clean; sidebar handles activation
      }

      if (!this.hasPrimitiveFields(propSchema) && Object.keys(propSchema.properties || {}).length > 0) {
        const sectionPath = nestedSchemaPath.join('.');
        const sectionId = `form-section-${sectionPath.replace(/\./g, '-')}`;
        const sectionContainer = document.createElement('div');
        sectionContainer.className = 'form-ui-section';
        sectionContainer.id = sectionId;
        sectionContainer.dataset.sectionPath = nestedBreadcrumbPath.join(' > ');

        const sectionHeader = document.createElement('div');
        sectionHeader.className = 'form-ui-section-header';
        const sectionTitle = document.createElement('h2');
        sectionTitle.className = 'form-ui-section-title';
        sectionTitle.textContent = this.getSchemaTitle(propSchema, key);
        sectionHeader.appendChild(sectionTitle);
        sectionContainer.appendChild(sectionHeader);
        container.appendChild(sectionContainer);

        outMap.set(sectionId, { element: sectionContainer, path: nestedBreadcrumbPath, title: propSchema.title || this.formatLabel(key), isSection: true });
      }

      // If this nested entry is an array-of-objects (active), render as its own group with array UI
      if (isArrayGroup) {
        const groupId = `form-group-${nestedSchemaPath.join('.').replace(/\./g, '-')}`;
        const groupContainer = document.createElement('div');
        groupContainer.className = 'form-ui-group';
        groupContainer.id = groupId;
        groupContainer.dataset.groupPath = nestedBreadcrumbPath.join(' > ');

        const groupHeader = document.createElement('div');
        groupHeader.className = 'form-ui-group-header';
        const groupTitleElement = document.createElement('h3');
        groupTitleElement.className = 'form-ui-group-title';
        groupTitleElement.textContent = this.getSchemaTitle(propSchema, key);
        groupHeader.appendChild(groupTitleElement);
        groupContainer.appendChild(groupHeader);

        const groupContent = document.createElement('div');
        groupContent.className = 'form-ui-group-content';
        const pathPrefix = nestedSchemaPath.join('.');
        const arrayUI = this.generateInput(pathPrefix, propSchema);
        if (arrayUI) groupContent.appendChild(arrayUI);
        groupContainer.appendChild(groupContent);
        // Expose field-path for consistency with other groups
        groupContainer.dataset.fieldPath = pathPrefix;
        container.appendChild(groupContainer);
        outMap.set(groupId, { element: groupContainer, path: nestedBreadcrumbPath, title: this.getSchemaTitle(propSchema, key), isSection: false });
      } else {
        this.build(container, propSchema, nestedBreadcrumbPath, nestedSchemaPath, outMap);
      }
    });

    return outMap;
  }
}


