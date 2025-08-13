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
    this.onNavigationClick = null;
  }

  /**
   * Create and return the sidebar DOM element
   */
  createElement() {
    this.element = document.createElement('div');
    this.element.className = 'form-side-panel';
    this.element.innerHTML = `
      <div class="form-side-panel-main">
        <div class="form-side-panel-header">
          <div class="form-side-panel-title-container">
            <span class="form-side-panel-title">Form Structure</span>
          </div>
        </div>
        <div class="form-side-panel-content">
          <div class="form-navigation-tree"></div>
        </div>
      </div>
      <div class="form-side-panel-tabs">
        <button class="form-side-panel-collapse form-tab" aria-label="Collapse panel" title="Collapse panel">
          ${FormIcons.getIconSvg('panel-right')}
        </button>
        <button class="form-ui-toggle form-tab" aria-label="Switch between form and raw JSON view" title="Switch between form and raw JSON view">
          ${FormIcons.getIconSvg('code')}
        </button>
        <button class="form-ui-remove form-tab" aria-label="Remove this form from the document" title="Remove this form from the document">
          ${FormIcons.getIconSvg('trash')}
        </button>
      </div>
    `;

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
      collapseBtn.innerHTML = FormIcons.getIconSvg('panel-right');
      collapseBtn.title = 'Expand panel';
    } else {
      collapseBtn.innerHTML = FormIcons.getIconSvg('panel-right');
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
      modeToggleBtn.innerHTML = FormIcons.getIconSvg('sliders');
      modeToggleBtn.title = 'Switch to form view';
    } else {
      modeToggleBtn.innerHTML = FormIcons.getIconSvg('code');
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
