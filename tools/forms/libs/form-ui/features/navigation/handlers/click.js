import { UI_CLASS as CLASS } from '../../../constants.js';

/**
 * Factory for the delegated nav tree click handler.
 * Binds to a FormNavigation instance to access navigation and generator APIs.
 * @param {import('../../navigation.js').default} nav
 * @returns {(e:MouseEvent)=>void}
 */
export function createTreeClickHandler(nav) {
  return function onTreeClick(e) {
    const navItem = e.target.closest(`.${CLASS.navItem}`);
    if (!navItem) return;
    e.preventDefault();
    e.stopPropagation();

    if (navItem.classList.contains(CLASS.navItemAdd) && navItem.dataset && navItem.dataset.arrayPath) {
      const arrayPath = navItem.dataset.arrayPath;
      nav.formGenerator.commandAddArrayItem(arrayPath);
      requestAnimationFrame(() => {
        const arr = nav.formGenerator.model.getNestedValue(nav.formGenerator.data, arrayPath) || [];
        const newIndex = Math.max(0, arr.length - 1);
        const targetId = nav.formGenerator.arrayItemId(arrayPath, newIndex);
        nav.navigateToGroup(targetId);
        nav.formGenerator.validation.validateAllFields();
      });
      return;
    }

    const { groupId } = navItem.dataset;
    if (!groupId) return;
    if (navItem.dataset && navItem.dataset.path) {
      const path = navItem.dataset.path;
      const target = nav.resolveFirstDescendantGroupPath(path) || path;
      const gid = nav.formGenerator.pathToGroupId(target);
      nav.navigateToGroup(gid);
      return;
    }

    nav.navigateToGroup(groupId);
  };
}

export default { createTreeClickHandler };


