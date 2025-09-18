import { render, html } from 'da-lit';
import { assetPickerModalTemplate } from '../templates/asset-picker/modal.js';
import { cropsToolbarTemplate, cropsListTemplate, structureSelectTemplate } from '../templates/asset-picker/crops.js';
import { errorTemplate } from '../templates/asset-picker/error.js';

const ASSET_SELECTOR_URL = 'https://experience.adobe.com/solutions/CQ-assets-selectors/assets/resources/assets-selectors.js';

let scriptsLoaded = false;
let hostInstance = null;

async function loadScriptOnce(src) {
  if (document.querySelector(`script[data-src="${src}"]`)) return;
  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.defer = true;
    s.dataset.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

async function loadStyleOnce(href) {
  if (document.querySelector(`link[data-href="${href}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  link.dataset.href = href;
  document.head.appendChild(link);
}

function ensureDialog() {
  let dialog = document.querySelector('.da-dialog-asset');
  if (!dialog) {
    const mount = document.createElement('div');
    render(assetPickerModalTemplate(), mount);
    dialog = mount.firstElementChild;
    const parent = document.body.querySelector('main') || document.body;
    parent.insertAdjacentElement('afterend', dialog);
  }
  const assetSelectorWrapper = dialog.querySelector('.da-dialog-asset-inner[data-part="assets"]');
  const cropSelectorWrapper = dialog.querySelector('.da-dialog-asset-inner[data-part="crops"]');
  return { dialog, assetSelectorWrapper, cropSelectorWrapper };
}

class AssetPickerHost {
  constructor() {
    this.dialog = null;
    this.assetSelectorWrapper = null;
    this.cropSelectorWrapper = null;
    this.initialized = false;
  }

  async show({ selectorConfig, meta, helpers, callbacks }) {
    await loadStyleOnce(new URL('../styles/asset-picker.css', import.meta.url).href);
    if (!scriptsLoaded) {
      await loadScriptOnce(ASSET_SELECTOR_URL);
      scriptsLoaded = true;
    }
    if (!window.PureJSSelectors || !window.PureJSSelectors.renderAssetSelector) {
      throw new Error('Assets selector library failed to load');
    }

    const { dialog, assetSelectorWrapper, cropSelectorWrapper } = ensureDialog();
    this.dialog = dialog;
    this.assetSelectorWrapper = assetSelectorWrapper;
    this.cropSelectorWrapper = cropSelectorWrapper;

    const resetCropSelector = () => {
      if (!this.cropSelectorWrapper || !this.assetSelectorWrapper) return;
      this.cropSelectorWrapper.style.display = 'none';
      this.cropSelectorWrapper.innerHTML = '';
      this.assetSelectorWrapper.style.display = 'block';
    };

    const emitResult = (payload) => {
      try { this.dialog.close(); } catch {}
      callbacks?.onResult?.(payload);
    };

    const onClose = () => {
      if (this.assetSelectorWrapper && this.assetSelectorWrapper.style.display !== 'none') {
        try { this.dialog.close(); } catch {}
        callbacks?.onCancel?.();
      }
    };

    const handleSelection = async (assets) => {
      const asset = assets && assets[0];
      if (!asset) return;
      const { getBaseDmUrl, getAssetUrl, getResponsiveImageConfig, buildResultObject } = helpers || {};
      const { org, repo, repoId, aemTierType, dmDeliveryEnabled, prodOrigin, injectLink, alt } = meta || {};

      const mimetype = ((asset && (asset.mimetype || asset['dc:format'])) || '').toLowerCase();
      const isImage = mimetype.startsWith('image/');
      const metadata = asset && asset._embedded && asset._embedded['http://ns.adobe.com/adobecloud/rel/metadata/asset'];
      const status = metadata && metadata['dam:assetStatus'];
      const activationTarget = metadata && metadata['dam:activationTarget'];

      if (dmDeliveryEnabled && activationTarget !== 'delivery' && status !== 'approved') {
        if (this.assetSelectorWrapper && this.cropSelectorWrapper) {
          this.assetSelectorWrapper.style.display = 'none';
          this.cropSelectorWrapper.style.display = 'block';
          render(errorTemplate({ message: 'The selected asset is not available because it is not approved for delivery. Please check the status.' }), this.cropSelectorWrapper);
          const cancelBtn = this.cropSelectorWrapper.querySelector('.cancel');
          const backBtn = this.cropSelectorWrapper.querySelector('.back');
          if (cancelBtn) cancelBtn.addEventListener('click', () => { resetCropSelector(); emitResult(null); });
          if (backBtn) backBtn.addEventListener('click', () => { resetCropSelector(); });
        } else {
          emitResult(null);
        }
        return;
      }

      if (isImage && meta && meta.smartCropSelectEnabled) {
        if (!this.assetSelectorWrapper || !this.cropSelectorWrapper) { emitResult(null); return; }
        this.assetSelectorWrapper.style.display = 'none';
        this.cropSelectorWrapper.style.display = 'block';

        const listSmartCropsResponse = await fetch(`${getBaseDmUrl(asset)}/smartCrops`);
        const listSmartCrops = await listSmartCropsResponse.json();
        if (!(listSmartCrops.items && listSmartCrops.items.length > 0)) {
          resetCropSelector();
          const payload = buildResultObject({ asset, src: getAssetUrl(asset) }, { org, repo, repoId, aemTierType, dmDeliveryEnabled, prodOrigin, injectLink, alt });
          emitResult(payload);
          return;
        }

        const responsive = await getResponsiveImageConfig(org, repo);
        const parentBlockName = null;
        const configs = Array.isArray(responsive)
          ? (parentBlockName
            ? responsive.filter((c) => (c.position === 'everywhere' || c.position === parentBlockName) && c.crops.every((cr) => listSmartCrops.items.find((it) => it.name === cr)))
            : responsive.filter((c) => (c.position === 'everywhere' || c.position === 'outside-blocks') && c.crops.every((cr) => listSmartCrops.items.find((it) => it.name === cr))))
          : [];

        const cropItems = listSmartCrops.items.map((smartCrop) => ({
          name: smartCrop.name,
          src: `${getAssetUrl(asset, `${smartCrop.name}-${asset.name}`)}?smartcrop=${smartCrop.name}`,
        }));

        render(html`
          ${cropsToolbarTemplate()}
          ${structureSelectTemplate({ configs })}
          <h2>Smart Crops</h2>
          ${cropsListTemplate({ items: cropItems, originalSrc: getAssetUrl(asset) })}
        `, this.cropSelectorWrapper);

        const cropSelectorList = this.cropSelectorWrapper.querySelector('.da-dialog-asset-crops');

        const cancelBtn = this.cropSelectorWrapper.querySelector('.cancel');
        const backBtn = this.cropSelectorWrapper.querySelector('.back');
        const insertBtn = this.cropSelectorWrapper.querySelector('.insert');
        if (cancelBtn) cancelBtn.addEventListener('click', () => { resetCropSelector(); emitResult(null); });
        if (backBtn) backBtn.addEventListener('click', () => resetCropSelector());
        if (insertBtn) insertBtn.addEventListener('click', () => {
          const insertTypeSelection = this.cropSelectorWrapper.querySelector('.da-dialog-asset-structure-select input:checked');
          const structureConfig = !insertTypeSelection || insertTypeSelection.value === 'single' ? null : JSON.parse(decodeURIComponent(insertTypeSelection.value));
          const selectedCropLis = cropSelectorList.querySelectorAll('li.selected');
          const selectedCrops = Array.prototype.slice.call(selectedCropLis).map((li) => ({ name: li.dataset.name, src: (li.querySelector('img') && li.querySelector('img').src) || '' }));
          const firstSelected = selectedCrops[0];
          const primary = (firstSelected && firstSelected.src) || getAssetUrl(asset);
          const payload = buildResultObject({ asset, src: primary }, { org, repo, repoId, aemTierType, dmDeliveryEnabled, prodOrigin, injectLink, alt });
          payload.selectedCrops = selectedCrops;
          payload.structure = structureConfig || { type: 'single' };
          emitResult(payload);
          resetCropSelector();
        });

        const structureSelect = this.cropSelectorWrapper.querySelector('.da-dialog-asset-structure-select');
        if (structureSelect) structureSelect.addEventListener('change', (e) => {
          if (e.target.value === 'single') {
            cropSelectorList.querySelectorAll('li').forEach((li) => li.classList.remove('selected'));
            const original = cropSelectorList.querySelector('li[data-name="original"]');
            if (original) original.classList.add('selected');
          } else {
            const structure = JSON.parse(decodeURIComponent(e.target.value));
            cropSelectorList.querySelectorAll('li').forEach((li) => {
              if (structure.crops.indexOf(li.dataset.name) !== -1) li.classList.add('selected');
              else li.classList.remove('selected');
            });
          }
        });

        cropSelectorList.addEventListener('click', () => {
          const structure = this.cropSelectorWrapper.querySelector('.da-dialog-asset-structure-select input:checked');
          if (structure && structure.value !== 'single') return;
          const li = cropSelectorList.querySelector('li:hover');
          if (!li) return;
          const currentSel = cropSelectorList.querySelector('.selected');
          if (currentSel) currentSel.classList.remove('selected');
          li.classList.add('selected');
        });
        return;
      }

      const renditionLinks = (asset && asset._links && asset._links['http://ns.adobe.com/adobecloud/rel/rendition']) || [];
      const videoLinkObj = renditionLinks.find((link) => link && link.href && link.href.endsWith('/play'));
      const videoLink = videoLinkObj && videoLinkObj.href;
      let src;
      if (aemTierType === 'author') src = getAssetUrl(asset);
      else if (mimetype.startsWith('video/')) src = videoLink;
      else src = (renditionLinks[0] && renditionLinks[0].href && renditionLinks[0].href.split('?')[0]) || null;
      const payload = buildResultObject({ asset, src }, { org, repo, repoId, aemTierType, dmDeliveryEnabled, prodOrigin, injectLink, alt });
      emitResult(payload);
    };

    if (!this.initialized || (this.assetSelectorWrapper && this.assetSelectorWrapper.childElementCount === 0)) {
      window.PureJSSelectors.renderAssetSelector(this.assetSelectorWrapper, {
        imsToken: selectorConfig.imsToken,
        repositoryId: selectorConfig.repositoryId,
        aemTierType: selectorConfig.aemTierType,
        onClose,
        handleSelection,
      });
      this.initialized = true;
    }

    this.dialog.showModal();
  }

  close() {
    if (this.dialog) {
      try { this.dialog.close(); } catch {}
    }
  }
}

export function getAssetPickerHost() {
  if (!hostInstance) hostInstance = new AssetPickerHost();
  return hostInstance;
}

export default { getAssetPickerHost };


