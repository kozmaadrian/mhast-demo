/**
 * FormNodeView - Custom NodeView for form UI rendering
 * Integrates JSON schema-driven forms with ProseMirror code_block.
 *
 * Responsibilities:
 * - Parse code_block content to resolve schema + data
 * - Mount FormGenerator (form view) or a raw <pre><code> (json view)
 * - Mount the form UI via a factory; does not directly manage the sidebar
 * - Synchronize data back to ProseMirror on changes
 */

import schemaLoader from '../utils/schema-loader.js';
import FormIcons from '../utils/icons.js';
// Sidebar creation is encapsulated in the factory; NodeView does not manage it directly
import formMount from './form-mount.js';

export class FormNodeView {
  constructor(node, view, getPos) {
    this.node = node;
    this.view = view;
    this.getPos = getPos;
    this.isRawMode = false;
    this.mountedSchemaId = null;

    // Create the main wrapper (just for the form now)
    this.dom = document.createElement('div');
    this.dom.className = 'form-container-wrapper';

    // Try to parse the content as JSON to extract schema and data
    this.parseContent().then(() => {
      // Continue initialization after parsing is complete
      this.finishInitialization();
    });

    // Create the form container
    this.formContainer = document.createElement('div');
    this.formContainer.className = 'code-block-form';
    this.dom.appendChild(this.formContainer);

    // Create code element (always present, but hidden when in form mode)
    this.codeElement = document.createElement('pre');
    this.codeContent = document.createElement('code');
    this.codeContent.textContent = node.textContent;
    this.codeElement.appendChild(this.codeContent);

    // Set contentDOM only for regular code blocks or when in raw mode
    this.contentDOM = null; // Will be set after parsing
  }

  // Sidebar is created inside the factory; NodeView does not expose panel helpers

  /**
   * Parse the code block content to extract schema and data
   */
  async parseContent() {
    const content = this.node.textContent;

    try {
      // Try to parse as JSON
      const parsed = JSON.parse(content);

      // Check if it's our structured form format
      if (parsed.schema && parsed.data) {
        try {
          const schemaId = parsed.schema;
          if (schemaId && schemaId !== 'inline') {
            // Load schema from external source
            this.schema = await schemaLoader.loadSchema(schemaId);
            this.schemaId = schemaId;
            this.data = parsed.data;
          } else {
            // Inline schema
            this.schema = this.inferSchema(parsed.data);
            this.data = parsed.data;
          }
        } catch (error) {
          // Fall back to treating as regular data
          // Fall back to treating as regular data
          this.schema = this.inferSchema(parsed.data);
          this.data = parsed.data;
        }
      } else {
        // Regular JSON data - try to infer a basic schema
        this.schema = this.inferSchema(parsed);
        this.data = parsed;
      }
    } catch (error) {
      // Not valid JSON - fall back to raw mode
      this.schema = null;
      this.data = null;
    }
  }

  /**
   * Finish initialization after schema parsing is complete.
   * Chooses Form vs Raw mode and mounts UI accordingly.
   */
  finishInitialization() {
    // If schema resolved, mount form via the vanilla factory
    if (this.schema) {
      this.formApi = formMount({
        mount: this.formContainer,
        schema: this.schema,
        data: this.data,
        onChange: (data) => this.updateContent(data),
        onRemove: () => this.removeFormBlock(),
      });
      this.mountedSchemaId = this.schemaId || 'inline';
      this.contentDOM = null; // form mode
    } else {
      // Fallback to raw mode if no valid schema
      this.isRawMode = true;
      this.formContainer.classList.add('raw-mode');
      this.formContainer.appendChild(this.codeElement);
      this.createSimpleHeader();
      this.contentDOM = this.codeContent; // Raw mode - allow direct editing
    }
  }

  /**
   * Infer a basic schema from existing data
   */
  inferSchema(data) {
    if (typeof data !== 'object' || data === null) {
      return null;
    }

    const schema = {
      type: 'object',
      title: 'Form Data',
      properties: {},
    };

    Object.entries(data).forEach(([key, value]) => {
      const type = Array.isArray(value) ? 'array' : typeof value;
      schema.properties[key] = { type, title: this.formatLabel(key) };

      if (type === 'array' && value.length > 0) {
        const itemType = typeof value[0];
        schema.properties[key].items = { type: itemType };
      }
    });

    return schema;
  }

  /**
   * Format field name as label
   */
  formatLabel(name) {
    return name
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, (str) => str.toUpperCase())
      .replace(/_/g, ' ');
  }

  /**
   * Create the form UI and connect it to the sidebar navigation.
   */
  createFormUI() {}

  /**
   * Create a simple header for non-form code blocks
   */
  createSimpleHeader() {
    const header = document.createElement('div');
    header.className = 'form-ui-header';
    header.innerHTML = `
      <div class="form-ui-title-container">
        <span class="form-ui-title">Code Block</span>
        <span class="form-ui-mode">Raw View</span>
      </div>
      <div class="form-ui-controls">
        <button class="form-ui-remove" title="Remove code block" aria-label="Remove code block">${FormIcons.getIconSvg('trash')}</button>
      </div>
    `;
    this.dom.insertBefore(header, this.codeElement);

    // Handle remove for simple code blocks too
    const removeButton = header.querySelector('.form-ui-remove');
    if (removeButton) {
      removeButton.addEventListener('click', () => {
        this.removeFormBlock();
      });
    }
  }

  /**
   * Toggle between form UI and raw JSON mode.
   */
  toggleMode() {
    // Delegate to the factory when available
    if (this.formApi && typeof this.formApi.toggleRawMode === 'function') {
      this.formApi.toggleRawMode();
      return;
    }
    // Fallback (raw mode without factory) – inspect-only, no editing
    this.isRawMode = !this.isRawMode;
    if (this.isRawMode) {
      this.formContainer.classList.add('raw-mode');
      const json = this.codeContent.textContent || '{}';
      this.codeContent.textContent = json;
      this.codeContent.contentEditable = false;
    } else {
      this.formContainer.classList.remove('raw-mode');
      this.codeContent.contentEditable = false;
    }
  }

  /**
   * Handle input in raw mode
   */
  handleRawModeInput() {
    // Update the underlying ProseMirror document when raw content changes
    const pos = this.getPos();
    const { tr } = this.view.state;

    const newContent = this.codeContent.textContent;

    // Replace the text content of the code block
    const start = pos + 1;
    const end = pos + this.node.nodeSize - 1;

    tr.replaceWith(start, end, this.view.state.schema.text(newContent));

    // Dispatch the transaction
    this.view.dispatch(tr);
  }

  /**
   * Remove the entire form block from the document (with confirm flow).
   */
  removeFormBlock() {
    // Find the remove button - now in side panel tabs
    const removeButton = this.sidePanel?.querySelector('.form-ui-remove.form-tab') || this.dom.querySelector('.form-ui-remove');
    if (!removeButton) return;

    // Check if we're already in confirmation state
    if (removeButton.classList.contains('confirm-state')) {
      // Actually delete the form
      const pos = this.getPos();
      const { tr } = this.view.state;

      // Delete the entire node (from start to end of the node)
      tr.delete(pos, pos + this.node.nodeSize);

      // Dispatch the transaction
      this.view.dispatch(tr);
    } else {
      // Switch to confirmation state
      this.showDeleteConfirmation(removeButton);
    }
  }

  /**
   * Show delete confirmation by replacing the remove button
   */
  showDeleteConfirmation(removeButton) {
    // Store original state
    const originalHTML = removeButton.innerHTML;
    const originalTitle = removeButton.title;
    const originalClass = removeButton.className;

    // Change to confirmation state - just use icon for small tab button
    removeButton.innerHTML = '✓';
    removeButton.title = 'Click to confirm deletion';
    removeButton.classList.add('confirm-state');

    // Auto-revert after 3 seconds if not confirmed
    const timeout = setTimeout(() => {
      this.revertDeleteConfirmation(removeButton, originalHTML, originalTitle, originalClass);
    }, 3000);

    // Store timeout and original values for potential early revert
    removeButton.dataset.confirmTimeoutId = String(timeout);
    removeButton.dataset.originalHtml = originalHTML;
    removeButton.dataset.originalTitle = originalTitle;
    removeButton.dataset.originalClass = originalClass;

    // Add click-outside listener to cancel confirmation
    const cancelHandler = (event) => {
      if (!removeButton.contains(event.target)) {
        this.revertDeleteConfirmation(removeButton, originalHTML, originalTitle, originalClass);
        document.removeEventListener('click', cancelHandler);
      }
    };

    // Add listener after a short delay to prevent immediate cancellation
    setTimeout(() => {
      document.addEventListener('click', cancelHandler);
    }, 100);
  }

  /**
   * Revert delete confirmation back to normal state
   */
  revertDeleteConfirmation(removeButton, originalHTML, originalTitle, originalClass) {
    if (removeButton.dataset.confirmTimeoutId) {
      clearTimeout(Number(removeButton.dataset.confirmTimeoutId));
      delete removeButton.dataset.confirmTimeoutId;
    }

    removeButton.innerHTML = originalHTML;
    removeButton.title = originalTitle;
    removeButton.className = originalClass;

    // Clean up stored values
    delete removeButton.dataset.originalHtml;
    delete removeButton.dataset.originalTitle;
    delete removeButton.dataset.originalClass;
  }

  /**
   * Update ProseMirror document content when form data changes.
   */
  updateContent(data) {
    if (this.isRawMode) return;

    const pos = this.getPos();
    const { tr } = this.view.state;

    // Create the new structured content
    const formBlock = {
      schema: this.schemaId || 'inline',
      data,
    };

    const newContent = JSON.stringify(formBlock, null, 2);

    // Replace the text content of the code block
    const start = pos + 1;
    const end = pos + this.node.nodeSize - 1;

    tr.replaceWith(start, end, this.view.state.schema.text(newContent));

    // Dispatch the transaction
    this.view.dispatch(tr);
  }

  /**
   * Handle updates to the node
   */
  update(node) {
    if (node.type !== this.node.type) return false;

    this.node = node;

    // Re-parse content if it changed
    const newContent = node.textContent;
    let currentContent;
    if (this.formApi && typeof this.formApi.getData === 'function') {
      const formBlock = { schema: this.schemaId || 'inline', data: this.formApi.getData() || {} };
      currentContent = JSON.stringify(formBlock, null, 2);
    } else {
      // Raw view fallback
      currentContent = this.codeContent.textContent;
    }

    if (newContent !== currentContent) {
      this.parseContent();

      if (this.schema) {
        // If factory is not present but we now have a schema, ask PM to recreate the NodeView
        if (!this.formApi) return false;
        const nextSchemaId = this.schemaId || 'inline';
        if (nextSchemaId !== this.mountedSchemaId && typeof this.formApi.updateSchema === 'function') {
          this.formApi.updateSchema(this.schema);
          this.mountedSchemaId = nextSchemaId;
        } else if (typeof this.formApi.updateData === 'function') {
          this.formApi.updateData(this.data);
        }
      } else if (this.isRawMode) {
        this.codeContent.textContent = newContent;
      }
    }

    return true;
  }

  /**
   * Handle node selection
   */
  selectNode() {
    this.dom.classList.add('ProseMirror-selectednode');
  }

  /**
   * Handle node deselection
   */
  deselectNode() {
    this.dom.classList.remove('ProseMirror-selectednode');
  }

  /**
   * Prevent certain events from being handled by ProseMirror
   */
  stopEvent() {
    // Allow form interactions when not in raw mode
    if (!this.isRawMode) {
      return true;
    }
    return false;
  }

  // Removed legacy sidebar helpers: sidebar is created and managed inside the factory (core/app.js)

  /**
   * Cleanup resources when NodeView is destroyed.
   */
  destroy() {
    if (this.formApi && typeof this.formApi.destroy === 'function') {
      this.formApi.destroy();
    }

    // Clean up floating side panel
    if (this.sidePanel && this.sidePanel.parentNode) {
      this.sidePanel.parentNode.removeChild(this.sidePanel);
    }

    // Clean up intersection observer
    if (this.formFocusObserver) {
      this.formFocusObserver.disconnect();
    }

    // Clean up any pending confirmation timeouts
    const removeButton = this.dom.querySelector('.form-ui-remove');
    if (removeButton && removeButton.dataset.confirmTimeoutId) {
      clearTimeout(Number(removeButton.dataset.confirmTimeoutId));
    }
  }
}

/**
 * Check if a code block contains form data
 */
export function isFormCodeBlock(content) {
  try {
    const parsed = JSON.parse(content);
    return parsed.schema && parsed.data;
  } catch {
    return false;
  }
}
