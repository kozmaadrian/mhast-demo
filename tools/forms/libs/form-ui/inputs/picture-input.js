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

    // Hidden native file input used for browse interaction (not bound by name)
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';
    container.appendChild(fileInput);

    // Dropzone UI
    const dropzone = document.createElement('div');
    dropzone.className = 'form-ui-dropzone';
    dropzone.tabIndex = 0;
    dropzone.setAttribute('role', 'button');
    dropzone.setAttribute('aria-label', 'Upload image: drop file or press Enter to browse');
    const dzText = document.createElement('div');
    dzText.className = 'form-ui-description';
    dzText.textContent = 'Drop your image here or click to browse';
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

    const handleFile = async (file) => {
      if (!file) return;
      // Show local preview immediately
      try {
        const objectUrl = URL.createObjectURL(file);
        renderPreview({ src: objectUrl, name: file.name || 'Image' });
      } catch {}

      // Background upload via DA backend service
      try {
        statusEl.textContent = 'Uploading image...';
        statusEl.style.display = '';
        const backend = this.services?.backend;
        if (!backend || typeof backend.uploadImage !== 'function') {
          throw new Error('Upload service not available');
        }
        const { ok, resourcePath, previewUrl, status } = await backend.uploadImage(file, { subdir: '.image' });
        if (ok && (resourcePath || previewUrl)) {
          // Prefer saving an absolute URL to satisfy "format: uri" validation
          const valueToSave = previewUrl || resourcePath || '';
          setValueAndNotify(valueToSave);
          if (previewUrl) renderPreview({ src: previewUrl, name: file.name || (resourcePath ? resourcePath.split('/').pop() : '') });
          statusEl.textContent = 'Upload complete';
          setTimeout(() => { statusEl.style.display = 'none'; }, 1200);
        } else {
          statusEl.textContent = `Upload failed (${status || 'network'})`;
        }
      } catch (e) {
        statusEl.textContent = 'Upload error';
      }
    };

    // File input change -> upload
    fileInput.addEventListener('change', async () => {
      const [file] = fileInput.files || [];
      handleFile(file);
      // reset so selecting same file re-triggers
      try { fileInput.value = ''; } catch {}
    });

    // Dropzone interactions
    dropzone.addEventListener('click', () => fileInput.click());
    dropzone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        fileInput.click();
      }
    });
    const onDragEnter = (e) => { e.preventDefault(); e.stopPropagation(); dropzone.classList.add('drag-over'); };
    const onDragOver = (e) => { e.preventDefault(); e.stopPropagation(); };
    const onDragLeave = (e) => { e.preventDefault(); e.stopPropagation(); dropzone.classList.remove('drag-over'); };
    const onDrop = (e) => {
      e.preventDefault(); e.stopPropagation(); dropzone.classList.remove('drag-over');
      const files = e.dataTransfer?.files;
      if (files && files.length > 0) handleFile(files[0]);
    };
    dropzone.addEventListener('dragenter', onDragEnter);
    dropzone.addEventListener('dragover', onDragOver);
    dropzone.addEventListener('dragleave', onDragLeave);
    dropzone.addEventListener('drop', onDrop);

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



