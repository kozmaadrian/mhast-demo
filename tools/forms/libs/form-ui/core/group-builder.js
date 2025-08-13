/**
 * GroupBuilder
 * Builds sections and groups recursively from a JSON Schema.
 * Returns a Map of groupId → { element, path, title, isSection } matching previous semantics.
 */

export default class GroupBuilder {
  constructor({ inputFactory, formatLabel, hasPrimitiveFields, generateObjectFields }) {
    this.inputFactory = inputFactory;
    this.formatLabel = formatLabel;
    this.hasPrimitiveFields = hasPrimitiveFields;
    this.generateObjectFields = generateObjectFields;
  }

  build(container, schema, breadcrumbPath = [], schemaPath = [], outMap = new Map()) {
    if (schema.type !== 'object' || !schema.properties) return outMap;

    const groupTitle = schema.title || (breadcrumbPath.length > 0 ? breadcrumbPath[breadcrumbPath.length - 1] : 'Root');
    const currentPath = [...breadcrumbPath];

    const primitiveFields = {};
    const nestedGroups = {};

    Object.entries(schema.properties).forEach(([key, propSchema]) => {
      if (propSchema.type === 'object' && propSchema.properties) {
        nestedGroups[key] = propSchema;
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

    Object.entries(nestedGroups).forEach(([key, propSchema]) => {
      const nestedBreadcrumbPath = [...currentPath, propSchema.title || this.formatLabel(key)];
      const nestedSchemaPath = [...schemaPath, key];

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
        sectionTitle.textContent = propSchema.title || this.formatLabel(key);
        sectionHeader.appendChild(sectionTitle);
        sectionContainer.appendChild(sectionHeader);
        container.appendChild(sectionContainer);

        outMap.set(sectionId, { element: sectionContainer, path: nestedBreadcrumbPath, title: propSchema.title || this.formatLabel(key), isSection: true });
      }

      this.build(container, propSchema, nestedBreadcrumbPath, nestedSchemaPath, outMap);
    });

    return outMap;
  }
}


