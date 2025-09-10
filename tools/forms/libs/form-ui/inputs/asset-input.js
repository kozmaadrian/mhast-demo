import BaseInput from './base-input.js';
import FormIcons from '../utils/icons.js';

// Module-relative URL for the generic file icon
const FILE_ICON_URL = new URL('../../assets/file-icon.svg', import.meta.url).href;

/**
 * FileInput (generic)
 *
 * Picker-driven file chooser used for images, documents, videos, etc.
 * Designed for extension: override hooks to customize wrapper label,
 * preview rendering and selection mapping.
 */
export default class FileInput extends BaseInput {
  constructor(context, handlers = {}) {
    super(context, handlers);
    this.services = (context && context.services) || (handlers && handlers.services) || null;
  }

  /** Hook: label shown inside the wrapper trigger */
  getWrapperLabel() { return 'Choose a file from Assets'; }

  /** Hook: map picker selection → value string saved in hidden input */
  mapSelectionToValue(selection) { return typeof selection === 'string' ? selection : (selection && selection.src) || ''; }

  /** Determine if a given URL looks like an image */
  isImageUrl(url) {
    try {
      const clean = String(url || '').split('?')[0].toLowerCase();
      if (clean.startsWith('data:image/')) return true;
      return /\.(avif|heic|heif|gif|jpe?g|png|webp|svg)$/.test(clean);
    } catch { return false; }
  }

  /** Shared remove button with confirm behavior, mounts to host when provided */
  createRemoveButton(onRemove) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'form-ui-remove';
    btn.title = 'Remove item';
    btn.textContent = '';
    const trash = FormIcons.renderIcon('trash');
    btn.appendChild(trash);
    btn.addEventListener('click', () => {
      if (btn.classList.contains('confirm-state')) {
        if (btn.dataset.confirmTimeoutId) {
          clearTimeout(Number(btn.dataset.confirmTimeoutId));
          delete btn.dataset.confirmTimeoutId;
        }
        onRemove();
      } else {
        const originalHTML = btn.innerHTML;
        const originalTitle = btn.title;
        const originalClass = btn.className;
        btn.textContent = '';
        btn.appendChild(FormIcons.renderIcon('check'));
        btn.title = 'Click to confirm removal';
        btn.classList.add('confirm-state');
        const timeout = setTimeout(() => {
          if (btn) {
            btn.innerHTML = originalHTML;
            btn.title = originalTitle;
            btn.className = originalClass;
            delete btn.dataset.confirmTimeoutId;
          }
        }, 3000);
        btn.dataset.confirmTimeoutId = String(timeout);
      }
    });
    return btn;
  }

  /** Hook: render preview for a selected item; may be overridden */
  renderPreview(previewsEl, actionsHost, { src, name }, onRemove) {
    previewsEl.innerHTML = '';
    const box = document.createElement('div');
    box.className = 'form-ui-preview-box';
    const item = document.createElement('div');
    item.className = 'form-ui-preview-item';

    const media = document.createElement('div');
    media.className = 'form-ui-preview-media';
    if (this.isImageUrl(src)) {
      const imgEl = document.createElement('img');
      imgEl.alt = name || 'Image preview';
      imgEl.src = src;
      media.appendChild(imgEl);
    } else {
      const iconWrap = document.createElement('div');
      iconWrap.className = 'form-ui-preview-media-icon';
      const iconImg = document.createElement('img');
      iconImg.src = FILE_ICON_URL;
      iconImg.alt = name || 'File';
      iconWrap.appendChild(iconImg);
      media.appendChild(iconWrap);
    }

    const info = document.createElement('div');
    info.className = 'form-ui-preview-info';
    const header = document.createElement('div');
    header.className = 'form-ui-preview-header';
    const nameEl = document.createElement('p');
    nameEl.className = 'form-ui-preview-title';
    nameEl.textContent = name || '';

    // Remove button mounted to actions host if provided
    const removeBtn = this.createRemoveButton(onRemove);
    if (actionsHost) {
      actionsHost.innerHTML = '';
      // Stack actions vertically
      actionsHost.style.flexDirection = 'column';
      // Replace (icon button)
      const replaceBtn = document.createElement('button');
      replaceBtn.type = 'button';
      replaceBtn.className = 'form-ui-action form-ui-replace-action';
      replaceBtn.title = 'Replace';
      replaceBtn.appendChild(FormIcons.renderIcon('replace'));
      replaceBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        try { if (typeof this._openPicker === 'function') this._openPicker(); } catch {}
      });
      actionsHost.appendChild(replaceBtn);
      // Remove
      actionsHost.appendChild(removeBtn);
    } else {
      removeBtn.classList.add('form-ui-preview-remove');
      box.appendChild(removeBtn);
    }

    header.appendChild(nameEl);
    info.appendChild(header);
    item.appendChild(media);
    item.appendChild(info);
    
    // (overlay removed)

    box.appendChild(item);
    previewsEl.appendChild(box);
  }

  /** Create the file input UI */
  create(fieldPath, propSchema) {
    const container = document.createElement('div');
    container.className = 'form-ui-picture-input';

    const hidden = document.createElement('input');
    hidden.type = 'hidden';
    hidden.name = fieldPath;
    container.appendChild(hidden);

    const wrapper = document.createElement('div');
    wrapper.className = 'form-ui-picker';
    wrapper.tabIndex = 0;
    wrapper.setAttribute('role', 'button');
    wrapper.setAttribute('aria-label', this.getWrapperLabel());
    const labelEl = document.createElement('div');
    labelEl.className = 'form-ui-description';
    const defaultText = this.getWrapperLabel();
    const icon = FormIcons.renderIcon('replace');
    const labelTextEl = document.createElement('span');
    labelTextEl.className = 'form-ui-picker-label-text';
    labelTextEl.textContent = defaultText;
    labelEl.appendChild(icon);
    labelEl.appendChild(document.createTextNode(' '));
    labelEl.appendChild(labelTextEl);

    const previews = document.createElement('div');
    previews.className = 'form-ui-upload-previews';

    const setValueAndNotify = (value) => {
      hidden.value = value || '';
      this.onInputOrChange(fieldPath, propSchema, hidden);
      try {
        hidden.dispatchEvent(new Event('input', { bubbles: true }));
        hidden.dispatchEvent(new Event('change', { bubbles: true }));
      } catch {}
    };

    let previewRefs = null;

    const render = ({ src, name }) => {
      const actionsHost = (() => {
        try {
          const main = container.parentElement;
          const actions = main && main.nextElementSibling;
          if (actions && actions.classList && actions.classList.contains('form-ui-field-actions')) return actions;
        } catch {}
        return null;
      })();

      const handleRemove = () => {
        previews.innerHTML = '';
        setValueAndNotify('');
        previewRefs = null;
        try { wrapper.style.display = ''; } catch {}
        if (actionsHost) actionsHost.innerHTML = '';
      };

      this.renderPreview(previews, actionsHost, { src, name }, handleRemove);
      try { wrapper.style.display = 'none'; } catch {}
      previewRefs = { src, name };
    };

    const tryInitialPreview = async () => {
      const currentValue = hidden.value || '';
      if (!currentValue) return;
      try {
        const backend = this.services && this.services.backend;
        let url = currentValue;
        if (backend && typeof backend.buildPreviewUrl === 'function') {
          url = await backend.buildPreviewUrl(currentValue);
        }
        const name = (currentValue.split('/') && currentValue.split('/').pop ? currentValue.split('/').pop() : currentValue).replace(/^\./, '');
        render({ src: url, name });
      } catch {}
    };

    const openPicker = async () => {
      const assets = this.services && this.services.assets;
      if (!assets || !assets.openPicker) return;
      try {
        const authSvc = this.services && this.services.auth;
        if (authSvc && authSvc.getStatus) {
          const st = await authSvc.getStatus();
          if (!st || !st.authenticated) return;
        }
      } catch {}

      let resolved = false;
      const onSelected = (e) => {
        if (resolved) return; resolved = true;
        window.removeEventListener('da-asset-selected', onSelected);
        window.removeEventListener('da-asset-cancelled', onCancelled);
        const selection = e.detail;
        if (!selection) return;
        const valueUrl = this.mapSelectionToValue(selection);
        const name = (valueUrl && valueUrl.split('?')[0].split('/') && valueUrl.split('?')[0].split('/').pop ? valueUrl.split('?')[0].split('/').pop() : 'File');
        render({ src: valueUrl, name });
        setValueAndNotify(valueUrl);
      };
      const onCancelled = () => {
        if (resolved) return; resolved = true;
        window.removeEventListener('da-asset-selected', onSelected);
        window.removeEventListener('da-asset-cancelled', onCancelled);
      };
      window.addEventListener('da-asset-selected', onSelected, { once: true });
      window.addEventListener('da-asset-cancelled', onCancelled, { once: true });
      try { await assets.openPicker(); } catch {}
    };

    // Expose picker opener for overlay Replace action
    this._openPicker = openPicker;

    const updateAuthUI = (authenticated) => {
      const isAuth = !!authenticated;
      if (!isAuth) {
        wrapper.setAttribute('aria-disabled', 'true');
        labelTextEl.textContent = 'Sign in required to pick assets';
        wrapper.title = 'Sign in required to pick assets';
      } else {
        wrapper.removeAttribute('aria-disabled');
        labelTextEl.textContent = defaultText;
        wrapper.removeAttribute('title');
      }
    };

    updateAuthUI(false);
    const authSvc = this.services && this.services.auth;
    if (authSvc && authSvc.getStatus) authSvc.getStatus().then((st) => updateAuthUI(st && st.authenticated));

    wrapper.appendChild(labelEl);
    container.appendChild(wrapper);
    container.appendChild(previews);

    wrapper.addEventListener('click', (e) => {
      if (wrapper.getAttribute('aria-disabled') === 'true') { e.preventDefault(); return; }
      openPicker();
    });
    wrapper.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (wrapper.getAttribute('aria-disabled') === 'true') { return; }
        openPicker();
      }
    });

    wrapper.addEventListener('focus', (e) => this.onFocus(fieldPath, propSchema, e.target));
    wrapper.addEventListener('blur', () => this.onBlur(fieldPath, propSchema, wrapper));

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


