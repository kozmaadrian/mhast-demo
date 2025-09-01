/**
 * Schema utility helpers (pure functions)
 */

function _deref(rootSchema, node) {
  if (!node || typeof node !== 'object' || !node.$ref || typeof node.$ref !== 'string') return node;
  const resolvePointer = (ref) => {
    if (!ref.startsWith('#')) return null;
    let pointer = ref.slice(1);
    if (pointer.startsWith('/')) pointer = pointer.slice(1);
    if (!pointer) return rootSchema;
    const parts = pointer.split('/').map((p) => p.replace(/~1/g, '/').replace(/~0/g, '~'));
    let current = rootSchema;
    for (const part of parts) {
      if (current && typeof current === 'object' && part in current) current = current[part];
      else return null;
    }
    return current;
  };
  const target = resolvePointer(node.$ref);
  if (!target) return { ...node };
  const extras = Object.fromEntries(Object.entries(node).filter(([k]) => k !== '$ref'));
  return { ...target, ...extras };
}

export function derefNode(rootSchema, node) {
  return _deref(rootSchema, node);
}

export function normalizeSchema(rootSchema, node) {
  const s = _deref(rootSchema, node) || node;
  if (!s || typeof s !== 'object') return s;
  const out = { ...s };
  if (Array.isArray(out.type)) {
    const primary = out.type.find((t) => t !== 'null') || out.type[0];
    out.type = primary;
  }
  return out;
}

export function getSchemaTitle(rootSchema, propSchema, fallbackKey) {
  const src = _deref(rootSchema, propSchema) || propSchema;
  return (src && typeof src.title === 'string' && src.title.trim().length > 0)
    ? src.title
    : (fallbackKey ? fallbackKey.replace(/([A-Z])/g, ' $1').replace(/^./, (str) => str.toUpperCase()).replace(/_/g, ' ') : '');
}

export function generateBaseJSON(rootSchema, schema, seenRefs = new Set()) {
  const normalizedRoot = normalizeSchema(rootSchema, schema) || schema;
  if (!normalizedRoot || normalizedRoot.type !== 'object' || !normalizedRoot.properties) {
    return {};
  }
  const baseData = {};
  Object.entries(normalizedRoot.properties).forEach(([key, originalPropSchema]) => {
    const effective = normalizeSchema(rootSchema, originalPropSchema) || originalPropSchema;
    const refStr = originalPropSchema && originalPropSchema.$ref ? String(originalPropSchema.$ref) : null;
    if (refStr) {
      if (seenRefs.has(refStr)) {
        return;
      }
      seenRefs.add(refStr);
    }
    const type = Array.isArray(effective?.type)
      ? (effective.type.find((t) => t !== 'null') || effective.type[0])
      : effective?.type;
    switch (type) {
      case 'string':
        baseData[key] = effective.default || '';
        break;
      case 'number':
      case 'integer':
        baseData[key] = effective.default || 0;
        break;
      case 'boolean':
        baseData[key] = effective.default || false;
        break;
      case 'array':
        baseData[key] = Array.isArray(effective.default) ? effective.default : [];
        break;
      case 'object':
        baseData[key] = generateBaseJSON(rootSchema, effective, seenRefs);
        break;
      default: {
        if (effective && typeof effective === 'object' && effective.properties) {
          baseData[key] = generateBaseJSON(rootSchema, effective, seenRefs);
        } else if (effective && effective.enum) {
          baseData[key] = effective.default || '';
        } else {
          baseData[key] = effective && Object.prototype.hasOwnProperty.call(effective, 'default') ? effective.default : null;
        }
      }
    }
    if (refStr) {
      seenRefs.delete(refStr);
    }
  });
  return baseData;
}



