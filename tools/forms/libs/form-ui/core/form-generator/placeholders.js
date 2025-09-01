export function createAddPlaceholder(label, onClick) {
  const placeholder = document.createElement('div');
  placeholder.className = 'form-ui-placeholder-add';
  placeholder.textContent = label;
  placeholder.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    onClick && onClick(e);
  });
  return placeholder;
}



