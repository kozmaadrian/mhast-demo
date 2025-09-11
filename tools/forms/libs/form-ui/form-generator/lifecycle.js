/**
 * Lifecycle
 * - generateForm(self): initial container/header/body/footer build
 * - rebuildBody(self): rebuilds body inline preserving order; remaps/validates
 */
import { UI_CLASS as CLASS } from '../constants.js';
import { mapFieldsToGroups, ensureGroupRegistry } from './mapping.js';
import { render } from 'da-lit';
import { formShellTemplate } from '../templates/form.js';

export function generateForm(self) {
  const mount = document.createElement('div');
  render(formShellTemplate({ title: self.schema.title || 'Form' }), mount);
  const container = mount.firstElementChild;
  const body = container.querySelector(`.${CLASS.body}`);

  const rootSchema = self.normalizeSchema(self.schema);
  if (rootSchema.type === 'object' && rootSchema.properties) {
    self.groupElements = self.groupBuilder.build(
      body,
      rootSchema,
      [],
      [],
      new Map(),
    );
    self.ensureGroupRegistry();
  }

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
      [],
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


