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
 *     showRemove: true,
 *     fixedSidebar: false, // when true: sidebar is always expanded and collapse control is hidden
 *   }
 *   // Note: legacy top-level `showRemove` is still supported for backwards compatibility
 * });
 * api.updateData(next); api.toggleRawMode(); api.destroy();
 */

import FormGenerator from './form-generator.js';
import FormSidebar from '../components/sidebar.js';

export function mountFormUI({ mount, schema, data, onChange, onRemove, ui, showRemove: legacyShowRemove } = {}) {
  if (!mount) throw new Error('mountFormUI: mount element is required');
  const controls = ui || {};
  const effectiveShowRemove = typeof controls.showRemove === 'boolean'
    ? controls.showRemove
    : (typeof legacyShowRemove === 'boolean' ? legacyShowRemove : true);
  const showReset = typeof controls.showReset === 'boolean' ? controls.showReset : false;

  // Wrapper
  const wrapper = document.createElement('div');
  wrapper.className = 'form-container-wrapper';

  // Code-block container to mirror existing structure
  const host = document.createElement('div');
  host.className = 'code-block-form';
  wrapper.appendChild(host);

  // Prepare code element for raw mode
  const codePre = document.createElement('pre');
  const codeEl = document.createElement('code');
  codePre.appendChild(codeEl);

  // Build form
  let generator = new FormGenerator(schema, {
    renderAllGroups: !!controls.renderAllGroups,
  });
  let formEl = generator.generateForm();
  // Keep code element inside container per existing markup
  formEl.appendChild(codePre);
  host.appendChild(formEl);
  // Header mode badge element
  let headerModeEl = formEl.querySelector('.form-ui-mode');

  // Sidebar
  const sidebar = new FormSidebar();
  const sideEl = sidebar.createElement();
  // Start as floating (class needed by CSS), then move inline under header
  sideEl.classList.add('floating-panel');

  // Optionally hide remove button for this mount
  if (!effectiveShowRemove) {
    const removeBtn = sideEl.querySelector('.form-ui-remove');
    if (removeBtn) removeBtn.remove();
  }
  // Optionally hide reset button
  if (!showReset) {
    const resetBtn = sideEl.querySelector('.form-ui-reset');
    if (resetBtn) resetBtn.remove();
  }

  // Optionally make the sidebar fixed open (no collapse control)
  const fixedSidebar = !!controls.fixedSidebar;
  if (fixedSidebar) {
    const collapseBtn = sideEl.querySelector('.form-side-panel-collapse');
    if (collapseBtn) collapseBtn.remove();
  }

  // Insert wrapper into mount
  mount.appendChild(wrapper);

  // Reposition sidebar inline under header
  const header = formEl.querySelector('.form-ui-header');
  if (header) {
    header.insertAdjacentElement('afterend', sideEl);
  } else {
    mount.appendChild(sideEl);
  }
  // Convert to inline panel
  sideEl.classList.remove('floating-panel');
  sideEl.classList.add('form-inline-panel');
  if (fixedSidebar) {
    sideEl.classList.remove('collapsed');
    sidebar.setCollapsed(false);
  } else {
    sideEl.classList.add('collapsed');
    sidebar.setCollapsed(true);
  }

  // Auto-float sidebar when it would be outside the viewport (keeps nav and blue marker visible)
  let isAutoFloating = false;
  const ensureSidebarVisibility = () => {
    // Skip when user explicitly fixed sidebar inline
    const rect = sideEl.getBoundingClientRect();
    const offscreenRight = rect.left >= window.innerWidth - 8;
    const offscreenLeft = rect.right <= 8;
    const shouldFloat = offscreenRight || offscreenLeft;
    if (shouldFloat && !isAutoFloating) {
      // Switch to floating fixed panel
      sideEl.classList.remove('form-inline-panel');
      sideEl.classList.add('floating-panel');
      isAutoFloating = true;
    } else if (!shouldFloat && isAutoFloating) {
      // Restore inline panel
      sideEl.classList.remove('floating-panel');
      sideEl.classList.add('form-inline-panel');
      isAutoFloating = false;
    }
  };

  // Listen to scroll/resize to keep panel visible
  const onScrollOrResize = () => {
    requestAnimationFrame(ensureSidebarVisibility);
  };
  window.addEventListener('scroll', onScrollOrResize, { passive: true });
  window.addEventListener('resize', onScrollOrResize, { passive: true });
  // Initial check
  ensureSidebarVisibility();

  // Toggle raw/form view
  let isRawMode = false;

  function updateModeBadge() {
    if (!headerModeEl) return;
    headerModeEl.textContent = isRawMode ? 'Raw View' : 'Form View';
  }

  // Wire sidebar events
  function toggleRaw(force) {
    isRawMode = typeof force === 'boolean' ? force : !isRawMode;
    if (isRawMode) {
      host.classList.add('raw-mode');
      const json = generator.getDataAsJSON();
      codeEl.textContent = json;
      codeEl.contentEditable = false; // inspect-only
    } else {
      host.classList.remove('raw-mode');
      // remain read-only; do not parse JSON back from raw view
      codeEl.contentEditable = false;
    }
    updateModeBadge();
    // Keep sidebar toggle icon/title in sync
    sidebar.setMode(isRawMode ? 'raw' : 'form');
  }

  sidebar.onModeToggleHandler((mode) => {
    const isRaw = mode === 'raw';
    toggleRaw(isRaw);
  });
  if (effectiveShowRemove) {
    sidebar.onRemoveHandler(() => {
      if (typeof onRemove === 'function') onRemove();
    });
  }
  // Reset handler
  sidebar.onResetHandler(() => {
    const btn = sideEl.querySelector('.form-ui-reset');
    if (!btn) return;
    // confirm pattern like remove: toggle a confirm-state briefly
    if (btn.classList.contains('confirm-state')) {
      // confirmed → perform reset
      if (btn.dataset.confirmTimeoutId) {
        clearTimeout(Number(btn.dataset.confirmTimeoutId));
        delete btn.dataset.confirmTimeoutId;
      }
      btn.classList.remove('confirm-state');
      // Reset data to base structure depending on renderAllGroups
      const base = generator.renderAllGroups
        ? generator.generateBaseJSON(generator.schema)
        : generator.model.generateBaseJSON(generator.schema);
      generator.data = base;
      generator.activeOptionalGroups = new Set();
      // Rebuild everything from data/schema
      generator.rebuildBody();
      if (generator.navigationTree) {
        generator.navigation.generateNavigationTree();
      }
      generator.validation.validateAllFields();
      if (typeof onChange === 'function') onChange(generator.data);
      if (isRawMode) {
        codeEl.textContent = generator.getDataAsJSON();
      }
      return;
    }
    // First click → enter confirm state
    btn.classList.add('confirm-state');
    const timeout = setTimeout(() => {
      btn.classList.remove('confirm-state');
      delete btn.dataset.confirmTimeoutId;
    }, 3000);
    btn.dataset.confirmTimeoutId = String(timeout);
  });
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
  requestAnimationFrame(() => generator.navigation.generateNavigationTree());

  // Initial data
  if (data) generator.loadData(data);
  // Ensure initial badge text
  updateModeBadge();

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
    newForm.appendChild(codePre);
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
    // Re-bind header badge element reference and update text to current mode
    headerModeEl = newForm.querySelector('.form-ui-mode');
    updateModeBadge();
    const h = newForm.querySelector('.form-ui-header');
    if (h) h.insertAdjacentElement('afterend', sideEl);
    generator.navigationTree = navigationTree;
    requestAnimationFrame(() => generator.navigation.generateNavigationTree());
    generator.onChange((next) => typeof onChange === 'function' && onChange(next));
    generator.loadData(dataSnapshot);
    // Re-apply current mode visuals/behaviour
    toggleRaw(isRawMode);
  }
  function navigateTo(groupId) { generator.navigation.navigateToGroup(groupId); }
  function getData() { return generator.data; }
  function destroy() {
    window.removeEventListener('scroll', onScrollOrResize);
    window.removeEventListener('resize', onScrollOrResize);
    generator.destroy();
    wrapper.remove();
    sidebar.destroy();
  }

  return {
    updateData,
    updateSchema,
    toggleRawMode: toggleRaw,
    navigateTo,
    getData,
    destroy,
  };
}

export default mountFormUI;
