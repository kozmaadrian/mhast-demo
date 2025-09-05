/**
 * mountFormUI - vanilla API to mount the form UI into a DOM node
 *
 * Usage:
 * const api = mountFormUI({
 *   mount,
 *   schema,
 *   data,
 *   onChange,
 *   onRemove,
 *   ui: {
 *     // renderAllGroups is supported; other legacy UI toggles were removed
 *   }
 * });
 * api.updateData(next); api.destroy();
 */

import FormGenerator from './form-generator.js';
import FormSidebar from './features/sidebar.js';
import FormBreadcrumb from './features/breadcrumb.js';

// ---- local helpers: readability only, no behavior change ----
function createWrapperAndHost(mount, ui) {
  if (!mount) throw new Error('mountFormUI: mount element is required');
  const controls = ui || {};
  const showNavConnectors = controls?.showNavConnectors !== false;

  const wrapper = document.createElement('div');
  wrapper.className = 'form-container-wrapper';

  const host = document.createElement('div');
  host.className = 'code-block-form';
  wrapper.appendChild(host);

  return { controls, showNavConnectors, wrapper, host };
}

function instantiateGenerator(context, schema, controls) {
  let generator;
  let formEl;
  try {
    generator = new FormGenerator(context, schema, {
      renderAllGroups: !!controls.renderAllGroups
    });
    formEl = generator.generateForm();
  } catch (e) {
    console.error('[mountFormUI] failed to create/generate form:', e);
    throw e;
  }
  return { generator, formEl };
}

function attachToDom(mount, wrapper, host, formEl) {
  host.appendChild(formEl);
  mount.appendChild(wrapper);
}

function setupBreadcrumbFeature(generator, formEl) {
  const breadcrumbFeature = new FormBreadcrumb(generator);
  const contentBreadcrumb = breadcrumbFeature.init(formEl);
  generator.breadcrumb = breadcrumbFeature;
  return { breadcrumbFeature, contentBreadcrumb };
}

function setupSidebar(wrapper) {
  const sidebar = new FormSidebar();
  const sideEl = sidebar.createElement();
  wrapper.appendChild(sideEl);
  return { sidebar, sideEl };
}

function setupNavigationTree(generator, sideEl, showNavConnectors) {
  const navigationTree = sideEl.querySelector('.form-navigation-tree');
  try {
    if (!showNavConnectors) navigationTree.classList.add('hide-tree-connectors');
    else navigationTree.classList.remove('hide-tree-connectors');
  } catch {}
  generator.navigationTree = navigationTree;
  return navigationTree;
}

function scheduleInitialRender(generator, breadcrumbFeature) {
  requestAnimationFrame(() => {
    generator.navigation.generateNavigationTree();
    breadcrumbFeature.update(generator.activeGroupId);
  });
}

function loadInitialData(generator, data) {
  if (!data) return;
  generator.loadData(data);
  try { window.scrollTo({ top: 0 }); } catch {}
  generator.rebuildBody();
  requestAnimationFrame(() => { try { window.scrollTo({ top: 0 }); } catch {} });
}

function wireNavigationClicks(sidebar, generator) {
  sidebar.onNavigationClickHandler((e) => {
    const navItem = e.target.closest('.form-ui-nav-item');
    if (!navItem) return;
    const { groupId } = navItem.dataset;
    if (groupId) generator.navigation.navigateToGroup(groupId);
  });
}

/**
 * Mount the Form UI into a DOM node and return an imperative API.
 *
 * @param {object} context - Shared app context with services and configuration
 * @param {object} options
 * @param {HTMLElement} options.mount - Host element to mount into (required)
 * @param {object} options.schema - JSON Schema describing the form
 * @param {object} [options.data] - Initial data to hydrate the form
 * @param {(nextData: object) => void} [options.onChange] - Callback invoked on any data change
 * @param {{renderAllGroups?: boolean}} [options.ui] - UI flags; currently only `renderAllGroups`
 * @returns {{
 *   updateData(next: object): void,
 *   updateSchema(nextSchema: object): void,
 *   navigateTo(groupId: string): void,
 *   getData(): object,
 *   destroy(): void
 * }}
 */
export function mountFormUI(context, {
   mount, schema, data, onChange, ui 
  } = {}) {
  const { controls, showNavConnectors, wrapper, host } = createWrapperAndHost(mount, ui);
  let { generator, formEl } = instantiateGenerator(context, schema, controls);
  attachToDom(mount, wrapper, host, formEl);
  // Breadcrumb moved into header
  const { breadcrumbFeature, contentBreadcrumb } = setupBreadcrumbFeature(generator, formEl);

  // Sidebar
  const { sidebar, sideEl } = setupSidebar(wrapper);
  wireNavigationClicks(sidebar, generator);

  // Connect navigation tree to form generator (use rAF instead of setTimeout)
  const navigationTree = setupNavigationTree(generator, sideEl, showNavConnectors);
  // Expose content breadcrumb element for navigation/scroll sync
  generator.contentBreadcrumbEl = contentBreadcrumb;
  // First render
  scheduleInitialRender(generator, breadcrumbFeature);

  // Initial data
  loadInitialData(generator, data);
  // No mode badge to initialize

  // Listen for changes and bubble up
  generator.onChange((next) => {
    onChange(next);
  });

  // expose API continues below
  /** Replace current form data with `next` and re-render inputs. */
  function updateData(next) { generator.loadData(next || {}); }
  /**
   * Replace the current schema and rebuild the form while preserving current data.
   * Useful for hot-reloading or switching between schemas.
   * @param {object} nextSchema
   */
  function updateSchema(nextSchema) {
    const dataSnapshot = generator.data;
    generator.destroy();
    const newGen = new FormGenerator(nextSchema, {
      renderAllGroups: !!controls.renderAllGroups,
    });
    const newForm = newGen.generateForm();
    // Replace current form and update references
    if (formEl.parentNode === host) {
      host.replaceChild(newForm, formEl);
    } else {
      // Fallback: clear and append if structure changed unexpectedly
      host.innerHTML = '';
      host.appendChild(newForm);
    }
    formEl = newForm;
    generator = newGen;
    
    const h = newForm.querySelector('.form-ui-header');
    if (h) h.insertAdjacentElement('afterend', sideEl);
    generator.navigationTree = navigationTree;
    requestAnimationFrame(() => generator.navigation.generateNavigationTree());
    generator.onChange((next) => typeof onChange === 'function' && onChange(next));
    generator.loadData(dataSnapshot);
    
  }
  /** Programmatically navigate to a group by its DOM id. */
  function navigateTo(groupId) { generator.navigation.navigateToGroup(groupId); }
  /** Return the latest form data snapshot. */
  function getData() { return generator.data; }
  /** Tear down all features and remove mounted DOM nodes. */
  function destroy() {
    // listeners were not added due to disabled auto-float
    generator.destroy();
    wrapper.remove();
    sidebar.destroy();
    breadcrumbFeature.destroy();
  }

  return {
    updateData,
    updateSchema,
    navigateTo,
    getData,
    destroy,
  };
}

export default mountFormUI;
