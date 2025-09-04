export default class FormBreadcrumb {
  constructor(formGenerator) {
    this.formGenerator = formGenerator;
    this.el = null;
    this._formEl = null;
    this._headerEl = null;
    this._onResize = null;
  }

  init(formEl) {
    this._formEl = formEl;
    const headerEl = formEl?.querySelector?.('.form-ui-header') || null;
    if (!headerEl) return null;
    this._headerEl = headerEl;

    const contentBreadcrumb = document.createElement('div');
    contentBreadcrumb.className = 'form-content-breadcrumb';
    headerEl.appendChild(contentBreadcrumb);
    this.el = contentBreadcrumb;

    try {
      const updateHeaderOffset = () => {
        const headerH = headerEl.offsetHeight || 0;
        const extra = 32;
        formEl.style.setProperty('--form-scroll-offset', `${headerH + extra}px`);
        if (this.formGenerator) this.formGenerator._headerOffset = headerH + extra;
      };
      this._onResize = updateHeaderOffset;
      updateHeaderOffset();
      window.addEventListener('resize', this._onResize, { passive: true });
    } catch {}

    return contentBreadcrumb;
  }

  setElement(el) {
    this.el = el || null;
  }

  update(activeGroupId) {
    const bc = this.el;
    if (!bc) return;

    const schemaPath = this.formGenerator?.activeSchemaPath || '';

    const buildTitleForToken = (parentSchema, token, index) => {
      const m = token.match(/^([^\[]+)(?:\[(\d+)\])?$/);
      const key = m ? m[1] : token;
      const idx = m && m[2] ? Number(m[2]) : null;
      const norm = this.formGenerator.normalizeSchema(this.formGenerator.derefNode(parentSchema) || parentSchema || {});
      const propSchema = norm?.properties?.[key];
      const propNorm = this.formGenerator.normalizeSchema(this.formGenerator.derefNode(propSchema) || propSchema || {});
      if (propNorm?.type === 'array') {
        const title = this.formGenerator.getSchemaTitle(propNorm, key);
        const labels = [];
        if (title) labels.push(title);
        if (idx != null) labels.push(`${title} #${(idx || 0) + 1}`);
        return { label: labels, nextSchema: this.formGenerator.derefNode(propNorm.items) || propNorm.items };
      }
      return { label: [this.formGenerator.getSchemaTitle(propNorm || {}, key)], nextSchema: propNorm };
    };

    bc.innerHTML = '';
    const separator = () => {
      const s = document.createElement('span');
      s.textContent = ' › ';
      return s;
    };
    const tokens = String(schemaPath)
      .split('.')
      .filter((t) => t && t !== 'root');
    let curSchema = this.formGenerator.schema;
    let accPath = '';
    tokens.forEach((tok, i) => {
      const m = tok.match(/^([^\[]+)(?:\[(\d+)\])?$/);
      const key = m ? m[1] : tok;
      const idx = m && m[2] ? Number(m[2]) : null;
      accPath = accPath ? `${accPath}.${key}` : key;
      const { label, nextSchema } = buildTitleForToken(curSchema, tok, idx);

      const addCrumb = (text, dataset) => {
        if (!text) return;
        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'form-ui-breadcrumb-item';
        el.textContent = text;
        Object.entries(dataset || {}).forEach(([k, v]) => { if (v != null) el.dataset[k] = v; });
        el.addEventListener('click', (e) => {
          e.preventDefault(); e.stopPropagation();
          const path = el.dataset.path;
          const gid = el.dataset.groupId;
          if (gid) {
            this.formGenerator.navigation.navigateToGroup(gid);
            return;
          }
          if (path) {
            const isActive = this.formGenerator.isOptionalGroupActive(path);
            if (!isActive) {
              this.formGenerator.commandActivateOptional(path);
              requestAnimationFrame(() => {
                const value = this.formGenerator.model.getNestedValue(this.formGenerator.data, path);
                if (Array.isArray(value) && value.length > 0) {
                  const id = this.formGenerator.arrayItemId(path, 0);
                  this.formGenerator.navigation.navigateToGroup(id);
                } else {
                  const target = this.formGenerator.navigation.resolveFirstDescendantGroupPath(path) || path;
                  const gid2 = this.formGenerator.pathToGroupId(target);
                  this.formGenerator.navigation.navigateToGroup(gid2);
                }
                this.formGenerator.validation.validateAllFields();
              });
            } else {
              const target = this.formGenerator.navigation.resolveFirstDescendantGroupPath(path) || path;
              const gid2 = this.formGenerator.pathToGroupId(target);
              this.formGenerator.navigation.navigateToGroup(gid2);
            }
          }
        });
        bc.appendChild(el);
      };

      if (Array.isArray(label) && label.length > 0) {
        addCrumb(label[0], { path: accPath });
        if (idx != null && label[1]) {
          bc.appendChild(separator());
          const itemGroupId = this.formGenerator.arrayItemId(accPath, idx);
          addCrumb(label[1], { groupId: itemGroupId });
        }
      } else if (!Array.isArray(label)) {
        addCrumb(label, { path: accPath });
      }

      if (i < tokens.length - 1) bc.appendChild(separator());

      const curNorm = this.formGenerator.normalizeSchema(this.formGenerator.derefNode(curSchema) || curSchema || {});
      let next = curNorm?.properties?.[key];
      const nextNorm = this.formGenerator.normalizeSchema(this.formGenerator.derefNode(next) || next || {});
      curSchema = nextNorm?.type === 'array' ? (this.formGenerator.derefNode(nextNorm.items) || nextNorm.items) : nextNorm || nextSchema;
      if (idx != null) accPath = `${accPath}[${idx}]`;
    });
  }

  destroy() {
    if (this._onResize) window.removeEventListener('resize', this._onResize);
    this._onResize = null;
    if (this.el) this.el.innerHTML = '';
    this.el = null;
    this._headerEl = null;
    this._formEl = null;
  }
}


