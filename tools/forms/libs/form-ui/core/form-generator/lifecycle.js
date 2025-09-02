/**
 * Lifecycle
 * - generateForm(self): initial container/header/body/footer build
 * - rebuildBody(self): rebuilds body inline preserving order; remaps/validates
 */
import { UI_CLASS as CLASS } from '../constants.js';
import { mapFieldsToGroups, ensureGroupRegistry } from './mapping.js';

export function generateForm(self) {
  const container = document.createElement('div');
  container.className = CLASS.container;

  const header = document.createElement('div');
  header.className = CLASS.header;
  header.innerHTML = `
      <div class="${CLASS.titleContainer}">
        <span class="${CLASS.title}">${self.schema.title || 'Form'}</span>
        <span class="${CLASS.mode}">Form View</span>
      </div>
    `;
  container.appendChild(header);

  const body = document.createElement('div');
  body.className = CLASS.body;
  // Use full-page scroll; do not set a custom scroll container here
  try { body.style.position = 'relative'; } catch {}

  const rootSchema = self.normalizeSchema(self.schema);
  if (rootSchema.type === 'object' && rootSchema.properties) {
    self.groupElements = self.groupBuilder.build(
      body,
      rootSchema,
      [rootSchema.title || 'Form'],
      [],
      new Map(),
    );
    self.ensureGroupRegistry();
  }

  container.appendChild(body);

  const footer = document.createElement('div');
  footer.className = CLASS.footer;
  footer.innerHTML = `<div class="${CLASS.validation}"></div>`;
  container.appendChild(footer);

  self.container = container;
  self.highlightOverlay.attach(self.container);

  requestAnimationFrame(() => {
    mapFieldsToGroups(self);
    ensureGroupRegistry(self);
    self.validation.validateAllFields();
  });

  return container;
}

export function rebuildBody(self) {
  if (!self.container) return;
  const body = self.container.querySelector(`.${CLASS.body}`);
  if (!body) return;
  const previousScrollTop = body.scrollTop;
  // Preserve sticky content breadcrumb across rebuilds
  const breadcrumbEl = body.querySelector('.form-content-breadcrumb');
  // Detach breadcrumb before clearing
  if (breadcrumbEl && breadcrumbEl.parentNode === body) {
    body.removeChild(breadcrumbEl);
  }
  self.groupElements.clear();
  self.fieldSchemas.clear();
  self.fieldElements.clear();
  self.fieldToGroup.clear();
  body.innerHTML = '';
  // Re-attach breadcrumb at the top
  if (breadcrumbEl) {
    body.appendChild(breadcrumbEl);
  }
  const rootSchema = self.normalizeSchema(self.schema);
  if (rootSchema?.type === 'object' && rootSchema.properties) {
    self.groupElements = self.groupBuilder.buildInline(
      body,
      rootSchema,
      [rootSchema.title || 'Form'],
      [],
      new Map(),
    );
  }
  self.highlightOverlay.attach(self.container);
  requestAnimationFrame(() => {
    body.scrollTop = previousScrollTop;
    mapFieldsToGroups(self);
    ensureGroupRegistry(self);
    // Restore existing data into fields after DOM rebuild
    try { self.loadData(self.data); } catch {}
    if (self.navigationTree) {
      self.navigation.generateNavigationTree();
    }
    self.validation.validateAllFields();
  });
}


