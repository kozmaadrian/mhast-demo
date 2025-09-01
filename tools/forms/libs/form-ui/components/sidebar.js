/**
 * Form Sidebar Component
 * Encapsulates all sidebar functionality and provides a clean API
 */

import FormIcons from '../utils/icons.js';

export default class FormSidebar {
  constructor() {
    this.element = null;
    this.navigationTree = null;
    this.isCollapsed = false;
    this.currentMode = 'form'; // 'form' or 'raw'

    // Event handlers
    this.onModeToggle = null;
    this.onRemove = null;
    this.onReset = null;
    this.onNavigationClick = null;
  }

  /**
   * Create and return the sidebar DOM element
   */
  createElement() {
    this.element = document.createElement('div');
    this.element.className = 'form-side-panel';
    const main = document.createElement('div');
    main.className = 'form-side-panel-main';
    const header = document.createElement('div');
    header.className = 'form-side-panel-header';
    const titleWrap = document.createElement('div');
    titleWrap.className = 'form-side-panel-title-container';
    const title = document.createElement('span');
    title.className = 'form-side-panel-title';
    title.textContent = 'Form Structure';
    titleWrap.appendChild(title);
    header.appendChild(titleWrap);
    const content = document.createElement('div');
    content.className = 'form-side-panel-content';
    const tree = document.createElement('div');
    tree.className = 'form-navigation-tree';
    content.appendChild(tree);
    main.appendChild(header);
    main.appendChild(content);
    const tabs = document.createElement('div');
    tabs.className = 'form-side-panel-tabs';
    const collapseBtn = document.createElement('button');
    collapseBtn.className = 'form-side-panel-collapse form-tab';
    collapseBtn.setAttribute('aria-label', 'Collapse panel');
    collapseBtn.title = 'Collapse panel';
    collapseBtn.appendChild(FormIcons.renderIcon('panel-right'));
    const modeBtn = document.createElement('button');
    modeBtn.className = 'form-ui-toggle form-tab';
    modeBtn.setAttribute('aria-label', 'Switch between form and raw JSON view');
    modeBtn.title = 'Switch between form and raw JSON view';
    modeBtn.appendChild(FormIcons.renderIcon('code'));
    const resetBtn = document.createElement('button');
    resetBtn.className = 'form-ui-reset form-tab';
    resetBtn.setAttribute('aria-label', 'Reset form data');
    resetBtn.title = 'Reset form data';
    resetBtn.appendChild(FormIcons.renderIcon('rotate-ccw'));
    const removeBtn = document.createElement('button');
    removeBtn.className = 'form-ui-remove form-tab';
    removeBtn.setAttribute('aria-label', 'Remove this form from the document');
    removeBtn.title = 'Remove this form from the document';
    removeBtn.appendChild(FormIcons.renderIcon('trash'));
    tabs.appendChild(collapseBtn);
    tabs.appendChild(modeBtn);
    tabs.appendChild(resetBtn);
    tabs.appendChild(removeBtn);
    this.element.appendChild(main);
    this.element.appendChild(tabs);

    this.navigationTree = this.element.querySelector('.form-navigation-tree');
    this.setupEventHandlers();

    // Ensure collapsed state is reflected in markup from the start
    this.setCollapsed(this.isCollapsed);

    return this.element;
  }

  /**
   * Setup internal event handlers
   */
  setupEventHandlers() {
    if (!this.element) return;

    // Collapse/expand button
    const collapseBtn = this.element.querySelector('.form-side-panel-collapse');
    if (collapseBtn) {
      collapseBtn.addEventListener('click', () => {
        this.toggleCollapse();
      });
    }

    // Mode toggle button
    const modeToggleBtn = this.element.querySelector('.form-ui-toggle');
    if (modeToggleBtn) {
      modeToggleBtn.addEventListener('click', () => {
        this.toggleMode();
      });
    }

    // Remove button
    const removeBtn = this.element.querySelector('.form-ui-remove');
    if (removeBtn) {
      removeBtn.addEventListener('click', () => {
        if (this.onRemove) {
          this.onRemove();
        }
      });
    }

    // Reset button
    const resetBtn = this.element.querySelector('.form-ui-reset');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        if (this.onReset) {
          // Visual confirm state toggle similar to remove buttons
          if (!resetBtn.classList.contains('confirm-state')) {
            resetBtn.classList.add('confirm-state');
            // swap icon to a check
            resetBtn.textContent = '';
            resetBtn.appendChild(FormIcons.renderIcon('check'));
            const timeout = setTimeout(() => {
              resetBtn.classList.remove('confirm-state');
              resetBtn.textContent = '';
              resetBtn.appendChild(FormIcons.renderIcon('rotate-ccw'));
              delete resetBtn.dataset.confirmTimeoutId;
            }, 3000);
            resetBtn.dataset.confirmTimeoutId = String(timeout);
            return;
          }
          // confirmed: execute handler
          if (resetBtn.dataset.confirmTimeoutId) {
            clearTimeout(Number(resetBtn.dataset.confirmTimeoutId));
            delete resetBtn.dataset.confirmTimeoutId;
          }
          resetBtn.classList.remove('confirm-state');
          resetBtn.textContent = '';
          resetBtn.appendChild(FormIcons.renderIcon('rotate-ccw'));
          this.onReset();
        }
      });
    }

    // Navigation clicks
    if (this.navigationTree) {
      this.navigationTree.addEventListener('click', (e) => {
        if (this.onNavigationClick) {
          this.onNavigationClick(e);
        }
      });
    }
  }

  /**
   * Set the navigation tree content
   */
  setNavigationContent(htmlContent) {
    if (this.navigationTree) {
      this.navigationTree.innerHTML = htmlContent;
    }
  }

  /**
   * Get the navigation tree element
   */
  getNavigationTree() {
    return this.navigationTree;
  }

  /**
   * Toggle collapse/expand state
   */
  toggleCollapse() {
    this.isCollapsed = !this.isCollapsed;

    if (this.element) {
      this.element.classList.toggle('collapsed', this.isCollapsed);
    }

    this.updateCollapseButton();
  }

  /**
   * Set collapse state
   */
  setCollapsed(collapsed) {
    this.isCollapsed = collapsed;

    if (this.element) {
      this.element.classList.toggle('collapsed', this.isCollapsed);
    }

    this.updateCollapseButton();
  }

  /**
   * Update collapse button icon and title
   */
  updateCollapseButton() {
    const collapseBtn = this.element?.querySelector('.form-side-panel-collapse');
    if (!collapseBtn) return;

    if (this.isCollapsed) {
      collapseBtn.textContent = '';
      collapseBtn.appendChild(FormIcons.renderIcon('panel-right'));
      collapseBtn.title = 'Expand panel';
    } else {
      collapseBtn.textContent = '';
      collapseBtn.appendChild(FormIcons.renderIcon('panel-right'));
      const svg = collapseBtn.querySelector('svg');
      if (svg) {
        svg.style.transform = 'scaleX(-1)';
      }
      collapseBtn.title = 'Collapse panel';
    }
  }

  /**
   * Toggle between form and raw mode
   */
  toggleMode() {
    this.currentMode = this.currentMode === 'form' ? 'raw' : 'form';
    this.updateModeButton();

    if (this.onModeToggle) {
      this.onModeToggle(this.currentMode);
    }
  }

  /**
   * Set the current mode
   */
  setMode(mode) {
    this.currentMode = mode;
    this.updateModeButton();
  }

  /**
   * Update mode toggle button
   */
  updateModeButton() {
    const modeToggleBtn = this.element?.querySelector('.form-ui-toggle');
    if (!modeToggleBtn) return;

    if (this.currentMode === 'raw') {
      modeToggleBtn.textContent = '';
      modeToggleBtn.appendChild(FormIcons.renderIcon('sliders'));
      modeToggleBtn.title = 'Switch to form view';
    } else {
      modeToggleBtn.textContent = '';
      modeToggleBtn.appendChild(FormIcons.renderIcon('code'));
      modeToggleBtn.title = 'Switch to raw JSON';
    }
  }

  /**
   * Show the sidebar
   */
  show() {
    if (this.element) {
      this.element.style.display = 'flex';
    }
  }

  /**
   * Hide the sidebar
   */
  hide() {
    if (this.element) {
      this.element.style.display = 'none';
    }
  }

  /**
   * Set event handler for mode toggle
   */
  onModeToggleHandler(handler) {
    this.onModeToggle = handler;
  }

  /**
   * Set event handler for remove button
   */
  onRemoveHandler(handler) {
    this.onRemove = handler;
  }

  /**
   * Set event handler for navigation clicks
   */
  onNavigationClickHandler(handler) {
    this.onNavigationClick = handler;
  }

  /**
   * Set event handler for reset button
   */
  onResetHandler(handler) {
    this.onReset = handler;
  }

  /**
   * Destroy the sidebar and clean up event listeners
   */
  destroy() {
    if (this.element) {
      this.element.remove();
      this.element = null;
      this.navigationTree = null;
    }
  }
}
