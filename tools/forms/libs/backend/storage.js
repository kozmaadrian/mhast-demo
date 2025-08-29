import HtmlTableStorage from './storage/html-storage.js';
import CodeBlockStorage from './storage/code-storage.js';

export const STORAGE_VERSIONS = {
  HTML: 'html',
  CODE: 'code',
};

function getStorageStrategy(storageVersion) {
  switch (storageVersion) {
    case STORAGE_VERSIONS.CODE:
      return new CodeBlockStorage();
    case STORAGE_VERSIONS.HTML:
    default:
      return new HtmlTableStorage();
  }
}

export function parseDocument(htmlString, { storageVersion } = {}) {
  return getStorageStrategy(storageVersion).parseDocument(htmlString);
}

export function serializeDocument({ formMeta, formData }, { storageVersion } = {}) {
  return getStorageStrategy(storageVersion).serializeDocument({ formMeta, formData });
}
