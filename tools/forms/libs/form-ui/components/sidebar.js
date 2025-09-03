/**
 * Form Sidebar Component (navigation-only)
 */

export default class FormSidebar {
  constructor() {
    this.element = null;
    this.navigationTree = null;
    // Navigation click handler
    this.onNavigationClick = null;
  }

  /**
   * Create and return the sidebar DOM element
   */
  createElement() {
    this.element = document.createElement('div');
    // Default to inline panel by class so no conversion is needed in mount
    this.element.className = 'form-side-panel form-inline-panel';
    const main = document.createElement('div');
    main.className = 'form-side-panel-main';
    const header = document.createElement('div');
    header.className = 'form-side-panel-header';
    const titleWrap = document.createElement('div');
    titleWrap.className = 'form-side-panel-title-container';
    const title = document.createElement('span');
    title.className = 'form-side-panel-title';
    title.textContent = 'Navigation';
    titleWrap.appendChild(title);
    header.appendChild(titleWrap);
    const content = document.createElement('div');
    content.className = 'form-side-panel-content';
    const tree = document.createElement('div');
    tree.className = 'form-navigation-tree';
    content.appendChild(tree);
    main.appendChild(header);
    main.appendChild(content);
    this.element.appendChild(main);

    this.navigationTree = this.element.querySelector('.form-navigation-tree');
    this.setupEventHandlers();

    return this.element;
  }

  /**
   * Setup internal event handlers
   */
  setupEventHandlers() {
    if (!this.element) return;
    if (this.navigationTree) {
      this.navigationTree.addEventListener('click', (e) => {
        if (this.onNavigationClick) this.onNavigationClick(e);
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
  getNavigationTree() { return this.navigationTree; }

  /**
   * Set event handler for mode toggle
   */
  onNavigationClickHandler(handler) { this.onNavigationClick = handler; }

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
