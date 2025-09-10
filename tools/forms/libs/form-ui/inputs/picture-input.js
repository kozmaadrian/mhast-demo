import BaseInput from './base-input.js';
import FormIcons from '../utils/icons.js';

/**
 * PictureInput
 *
 * Renders a file input for images with optional preview and background upload
 * to DA via the backend service. On successful upload, sets the bound field's
 * value to the resulting resource path (e.g., "/.image/filename.jpg").
 */
export default class PictureInput extends BaseInput {
  /**
   * @param {object} context
   * @param {{ onInputOrChange?:Function, onBlur?:Function, onFocus?:Function }} handlers
   */
  constructor(context, handlers = {}) {
    super(context, handlers);
    this.services = context?.services || handlers?.services || null;
  }

  /** Create the picture input UI. */
  create(fieldPath, propSchema) {
    const container = document.createElement('div');
    container.className = 'form-ui-picture-input';

    // Hidden bound input that actually stores the value in the model
    const hidden = document.createElement('input');
    hidden.type = 'hidden';
    hidden.name = fieldPath;
    container.appendChild(hidden);

    // No native file input. We always use the DA asset picker.

    // Dropzone UI
    const dropzone = document.createElement('div');
    dropzone.className = 'form-ui-dropzone';
    dropzone.tabIndex = 0;
    dropzone.setAttribute('role', 'button');
    dropzone.setAttribute('aria-label', 'Choose image from assets');
    const dzText = document.createElement('div');
    dzText.className = 'form-ui-description';
    dzText.textContent = 'Choose an image from Assets';
    dropzone.appendChild(dzText);

    // Preview list (single-item) rendered under the dropzone
    const previews = document.createElement('div');
    previews.className = 'form-ui-upload-previews';

    // Detect when this control is rendered inside an array item (e.g., field[0])
    const isArrayItem = /\[\d+\]/.test(fieldPath);

    const statusEl = document.createElement('div');
    statusEl.className = 'form-ui-description';
    statusEl.style.display = 'none';

    // Helper: set field value and emit change
    const setValueAndNotify = (value) => {
      hidden.value = value || '';
      this.onInputOrChange(fieldPath, propSchema, hidden);
      // Also emit DOM events so array controls (e.g., Add button enablement) react
      try {
        hidden.dispatchEvent(new Event('input', { bubbles: true }));
        hidden.dispatchEvent(new Event('change', { bubbles: true }));
      } catch {}
    };

    // Track preview elements to update without re-creating (prevents flicker)
    let previewRefs = null;

    // Render a single preview item with thumbnail, name and a remove button
    const renderPreview = ({ src, name }) => {
      if (previewRefs) {
        try { previewRefs.img.src = src; } catch {}
        try { previewRefs.name.textContent = name || ''; } catch {}
        try { dropzone.style.display = 'none'; } catch {}
        return;
      }
      previews.innerHTML = '';
      const box = document.createElement('div');
      box.className = 'form-ui-preview-box';
      const item = document.createElement('div');
      item.className = 'form-ui-upload-item';

      const left = document.createElement('div');
      left.className = 'form-ui-upload-left';
      const thumbWrap = document.createElement('span');
      thumbWrap.className = 'form-ui-upload-thumb';
      const imgEl = document.createElement('img');
      imgEl.alt = name || 'Image preview';
      imgEl.src = src;
      thumbWrap.appendChild(imgEl);
      const meta = document.createElement('div');
      meta.className = 'form-ui-upload-meta';
      const nameEl = document.createElement('p');
      nameEl.className = 'form-ui-upload-name';
      nameEl.textContent = name || '';
      meta.appendChild(nameEl);
      left.appendChild(thumbWrap);


      // Bottom row under the image: filename (left)
      const bottomRow = document.createElement('div');
      bottomRow.className = 'form-ui-upload-bottom';
      bottomRow.appendChild(meta);
      // For non-array picture input, render a right-side actions column (like array items)
      let actions = null;
      if (!isArrayItem) {
        actions = document.createElement('div');
        actions.className = 'form-ui-upload-actions';
        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'form-ui-remove';
        removeBtn.title = 'Remove item';
        removeBtn.textContent = '';
        removeBtn.appendChild(FormIcons.renderIcon('trash'));
        removeBtn.addEventListener('click', () => {
          if (removeBtn.classList.contains('confirm-state')) {
            if (removeBtn.dataset.confirmTimeoutId) {
              clearTimeout(Number(removeBtn.dataset.confirmTimeoutId));
              delete removeBtn.dataset.confirmTimeoutId;
            }
            previews.innerHTML = '';
            setValueAndNotify('');
            previewRefs = null;
            try { fileInput.value = ''; } catch {}
            try { dropzone.style.display = ''; } catch {}
          } else {
            const originalHTML = removeBtn.innerHTML;
            const originalTitle = removeBtn.title;
            const originalClass = removeBtn.className;
            removeBtn.textContent = '';
            removeBtn.appendChild(FormIcons.renderIcon('check'));
            removeBtn.title = 'Click to confirm removal';
            removeBtn.classList.add('confirm-state');
            const timeout = setTimeout(() => {
              if (removeBtn) {
                removeBtn.innerHTML = originalHTML;
                removeBtn.title = originalTitle;
                removeBtn.className = originalClass;
                delete removeBtn.dataset.confirmTimeoutId;
              }
            }, 3000);
            removeBtn.dataset.confirmTimeoutId = String(timeout);
          }
        });
        actions.appendChild(removeBtn);
      }
      left.appendChild(bottomRow);

      item.appendChild(left);
      if (actions) item.appendChild(actions);
      box.appendChild(item);
      previews.appendChild(box);
      try { dropzone.style.display = 'none'; } catch {}
      previewRefs = { img: imgEl, name: nameEl };
    };

    // If existing value is present (e.g., after reload), try to show preview
    const tryInitialPreview = async () => {
      const currentValue = hidden.value || '';
      if (!currentValue) return;
      try {
        const backend = this.services?.backend;
        let url = currentValue;
        if (backend && typeof backend.buildPreviewUrl === 'function') {
          url = await backend.buildPreviewUrl(currentValue);
        }
        const name = (currentValue.split('/')?.pop?.() || currentValue).replace(/^\./, '');
        renderPreview({ src: url, name });
      } catch {}
    };

    const openAssetPicker = async () => {
      const assets = this.services?.assets;
      if (!assets || typeof assets.openPicker !== 'function') {
        statusEl.textContent = 'Asset picker not available';
        statusEl.style.display = '';
        return;
      }
      try {
        const { authenticated } = await (assets.getAuthStatus?.() || Promise.resolve({ authenticated: true }));
        if (!authenticated) {
          statusEl.textContent = 'Sign in required to pick assets';
          statusEl.style.display = '';
          // attach a one-shot auth-required listener to clear message on success
          const onAuthReady = () => { statusEl.style.display = 'none'; window.removeEventListener('da-asset-auth-ready', onAuthReady); };
          window.addEventListener('da-asset-auth-ready', onAuthReady, { once: true });
          // kick off sign-in flow
          try { await assets.promptSignIn?.(); } catch {}
          return;
        }
      } catch {}
      statusEl.textContent = 'Opening asset picker...';
      statusEl.style.display = '';
      let resolved = false;
      const onSelected = (e) => {
        if (resolved) return; resolved = true;
        window.removeEventListener('da-asset-selected', onSelected);
        window.removeEventListener('da-asset-cancelled', onCancelled);
        const selection = e.detail;
        if (!selection) {
          statusEl.textContent = 'No asset selected';
          setTimeout(() => { statusEl.style.display = 'none'; }, 800);
          return;
        }
        const valueUrl = typeof selection === 'string' ? selection : selection.src;
        const name = (valueUrl?.split('?')[0].split('/')?.pop?.() || 'Image');
        renderPreview({ src: valueUrl, name });
        setValueAndNotify(valueUrl);
        try { console.log('[picture-input] selected asset details:', selection); } catch {}
        statusEl.style.display = 'none';
      };
      const onCancelled = () => {
        if (resolved) return; resolved = true;
        window.removeEventListener('da-asset-selected', onSelected);
        window.removeEventListener('da-asset-cancelled', onCancelled);
        statusEl.textContent = 'No asset selected';
        setTimeout(() => { statusEl.style.display = 'none'; }, 800);
      };
      window.addEventListener('da-asset-selected', onSelected, { once: true });
      window.addEventListener('da-asset-cancelled', onCancelled, { once: true });
      const onAuthRequired = () => { if (!resolved) { onCancelled(); } };
      window.addEventListener('da-asset-auth-required', onAuthRequired, { once: true });
      try { await assets.openPicker(); } catch (e) { /* error already logged in service */ }
      window.removeEventListener('da-asset-auth-required', onAuthRequired);
    };

    // Interactions: open DA asset picker on click/Enter/Space
    dropzone.addEventListener('click', () => openAssetPicker());
    dropzone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openAssetPicker();
      }
    });

    // Focus/blur wiring for highlight behavior on the dropzone
    dropzone.addEventListener('focus', (e) => this.onFocus(fieldPath, propSchema, e.target));
    dropzone.addEventListener('blur', () => this.onBlur(fieldPath, propSchema, dropzone));

    container.appendChild(dropzone);
    container.appendChild(previews);
    container.appendChild(statusEl);

    // Kick off preview if value already present in the model (after loadData)
    const scheduleInitialPreview = () => {
      tryInitialPreview();
      try {
        requestAnimationFrame(() => {
          tryInitialPreview();
          setTimeout(() => { tryInitialPreview(); }, 100);
        });
      } catch {
        setTimeout(() => { tryInitialPreview(); }, 50);
      }
    };
    try { scheduleInitialPreview(); } catch { try { setTimeout(() => scheduleInitialPreview(), 0); } catch {} }
    return container;
  }
}



