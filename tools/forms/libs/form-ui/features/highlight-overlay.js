/**
 * HighlightOverlay
 * Renders the blue vertical overlay aligned with a target group.
 * Extracted so visual effect is isolated from form generation logic.
 */

export default class HighlightOverlay {
  constructor() {
    this.container = null;
    this.overlay = null;
  }

  attach(containerEl) {
    this.container = containerEl;
  }

  clear() {
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }
  }

  showFor(targetGroup) {
    if (!this.container || !targetGroup) return;
    this.clear();

    const overlay = document.createElement('div');
    overlay.className = 'form-ui-highlight-overlay';

    const getOffsetTopWithinContainer = (el, container) => {
      let top = 0;
      let node = el;
      // eslint-disable-next-line no-cond-assign
      while (node && node !== container) {
        top += node.offsetTop;
        node = node.offsetParent;
      }
      return top;
    };

    const topValue = getOffsetTopWithinContainer(targetGroup, this.container);
    const heightValue = targetGroup.offsetHeight;

    overlay.style.top = `${topValue}px`;
    overlay.style.height = `${heightValue}px`;
    overlay.style.left = '0px';

    this.container.appendChild(overlay);
    this.overlay = overlay;
  }
}


