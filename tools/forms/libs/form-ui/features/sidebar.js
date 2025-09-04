/**
 * Form Sidebar Component (navigation-only)
 */

/**
 * FormSidebar
 *
 * Lightweight component that renders the left-side navigation panel used by
 * the Form UI. It creates a titled container and exposes the `.form-navigation-tree`
 * element for the navigation feature to populate and control.
 */
export default class FormSidebar {
  /** Create a new sidebar instance (DOM is created via createElement). */
  constructor() {
    this.element = null;
    this.navigationTree = null;
    // Navigation click handler
    this.onNavigationClick = null;
  }

  /** Create and return the sidebar DOM element. */
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

  /** Attach internal event handlers for delegated navigation clicks. */
  setupEventHandlers() {
    if (!this.element) return;
    if (this.navigationTree) {
      this.navigationTree.addEventListener('click', (e) => {
        if (this.onNavigationClick) this.onNavigationClick(e);
      });
    }
  }

  /** Replace the entire navigation tree innerHTML with provided markup. */
  setNavigationContent(htmlContent) {
    if (this.navigationTree) {
      this.navigationTree.innerHTML = htmlContent;
    }
  }

  /** Return the navigation tree root element for external manipulation. */
  getNavigationTree() { return this.navigationTree; }

  /** Register a handler invoked when the navigation tree is clicked. */
  onNavigationClickHandler(handler) { this.onNavigationClick = handler; }

  /** Remove the sidebar from DOM and clear references. */
  destroy() {
    if (this.element) {
      this.element.remove();
      this.element = null;
      this.navigationTree = null;
    }
  }
}
