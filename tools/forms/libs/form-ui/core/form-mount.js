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
import FormSidebar from '../components/sidebar.js';

export function mountFormUI({ mount, schema, data, onChange, onRemove, ui } = {}) {
  
  if (!mount) throw new Error('mountFormUI: mount element is required');
  const controls = ui || {};
  

  // Wrapper
  const wrapper = document.createElement('div');
  wrapper.className = 'form-container-wrapper';

  // Code-block container to mirror existing structure
  const host = document.createElement('div');
  host.className = 'code-block-form';
  wrapper.appendChild(host);

  

  // Build form
  let generator;
  let formEl;
  try {
    
    generator = new FormGenerator(schema, {
      renderAllGroups: !!controls.renderAllGroups,
    });
    
    formEl = generator.generateForm();
    
  } catch (e) {
    console.error('[mountFormUI] failed to create/generate form:', e);
    throw e;
  }
  host.appendChild(formEl);
  // Breadcrumb moved into header
  const headerElForBreadcrumb = formEl.querySelector('.form-ui-header');
  let contentBreadcrumb = null;
  if (headerElForBreadcrumb) {
    contentBreadcrumb = document.createElement('div');
    contentBreadcrumb.className = 'form-content-breadcrumb';
    headerElForBreadcrumb.appendChild(contentBreadcrumb);
    try {
      const updateHeaderOffset = () => {
        const headerH = headerElForBreadcrumb.offsetHeight || 0;
        const extra = 32; // extra breathing room below sticky header
        // Expose scroll offset for sticky header + breadcrumb
        formEl.style.setProperty('--form-scroll-offset', `${headerH + extra}px`);
        if (generator) generator._headerOffset = headerH + extra;
      };
      updateHeaderOffset();
      window.addEventListener('resize', updateHeaderOffset, { passive: true });
    } catch {}
  }

  // Sidebar
  const sidebar = new FormSidebar();
  const sideEl = sidebar.createElement();
  // Sidebar is created as inline panel by default; no floating conversion

  

  // Collapse control removed

  // Insert wrapper into mount
  
  mount.appendChild(wrapper);

  // Place sidebar immediately after header (overlay style via CSS)
  wrapper.appendChild(sideEl);

  

  // Use full-page scroll. No special scroll container for form body.

  sidebar.onNavigationClickHandler((e) => {
    const navItem = e.target.closest('.form-ui-nav-item');
    if (!navItem) return;
    const { groupId } = navItem.dataset;
    if (groupId) {
      generator.navigation.navigateToGroup(groupId);
    }
  });

  // Connect navigation tree to form generator (use rAF instead of setTimeout)
  const navigationTree = sideEl.querySelector('.form-navigation-tree');
  generator.navigationTree = navigationTree;
  // Expose content breadcrumb element for navigation/scroll sync
  generator.contentBreadcrumbEl = contentBreadcrumb;
  // Expose header offset so programmatic window scroll accounts for sticky header
  try { generator._headerOffset = (formEl.querySelector('.form-ui-header')?.offsetHeight || 0) + 32; } catch {}
  requestAnimationFrame(() => {
    
    generator.navigation.generateNavigationTree();
  });

  // Initial data
  if (data) {
    generator.loadData(data);
    // Ensure starting at top before any rebuild
    try { window.scrollTo({ top: 0 }); } catch {}
    // Rebuild so optional groups present in incoming data are materialized
    generator.rebuildBody();
    // After rebuild, reset scroll to top again to prevent jump
    requestAnimationFrame(() => { try { window.scrollTo({ top: 0 }); } catch {} });
  }
  // No mode badge to initialize

  // Listen for changes and bubble up
  generator.onChange((next) => {
    if (typeof onChange === 'function') onChange(next);
  });

  // expose API continues below
  function updateData(next) { generator.loadData(next || {}); }
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
  function navigateTo(groupId) { generator.navigation.navigateToGroup(groupId); }
  function getData() { return generator.data; }
  function destroy() {
    // listeners were not added due to disabled auto-float
    generator.destroy();
    wrapper.remove();
    sidebar.destroy();
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
