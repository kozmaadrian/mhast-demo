/**
 * Path/ID helpers used across Form UI
 */

export function hyphenatePath(path) {
  return String(path || '').replace(/[.\[\]]/g, '-');
}

export function pathToGroupId(path) {
  return `form-group-${hyphenatePath(path)}`;
}

export function arrayItemId(arrayPath, index) {
  return `form-array-item-${hyphenatePath(arrayPath)}-${index}`;
}


