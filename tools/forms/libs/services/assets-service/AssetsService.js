/*
 * Lightweight wrapper around the DA asset selector used in da-live/edit/da-assets.
 * Copied with minimal changes to work inside tools/forms without external /root references.
 */

import DA_SDK from 'https://da.live/nx/utils/sdk.js';
import { DA_ORIGIN, DA_LIVE } from '../../../utils.js';

const ASSET_SELECTOR_URL = 'https://experience.adobe.com/solutions/CQ-assets-selectors/assets/resources/assets-selectors.js';

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

function getNx() {
  try {
    const base = (DA_LIVE || '').replace(/\/$/, '');
    return `${base}/nx`;
  } catch {
    return 'https://da.live/nx';
  }
}

function ensureDialogRoot() {
  let dialog = document.querySelector('.da-dialog-asset');
  if (!dialog) {
    dialog = document.createElement('dialog');
    dialog.className = 'da-dialog-asset';
    const assetSelectorWrapper = document.createElement('div');
    assetSelectorWrapper.className = 'da-dialog-asset-inner';
    assetSelectorWrapper.dataset.part = 'assets';
    dialog.append(assetSelectorWrapper);
    const cropSelectorWrapper = document.createElement('div');
    cropSelectorWrapper.className = 'da-dialog-asset-inner';
    cropSelectorWrapper.dataset.part = 'crops';
    cropSelectorWrapper.style.display = 'none';
    dialog.append(cropSelectorWrapper);
    const parent = document.body.querySelector('main') || document.body;
    parent.insertAdjacentElement('afterend', dialog);
  } else {
    // Ensure both wrappers exist even if dialog was created earlier
    if (!dialog.querySelector('.da-dialog-asset-inner[data-part="assets"]')) {
      const a = document.createElement('div');
      a.className = 'da-dialog-asset-inner';
      a.dataset.part = 'assets';
      dialog.append(a);
    }
    if (!dialog.querySelector('.da-dialog-asset-inner[data-part="crops"]')) {
      const c = document.createElement('div');
      c.className = 'da-dialog-asset-inner';
      c.dataset.part = 'crops';
      c.style.display = 'none';
      dialog.append(c);
    }
  }
  return dialog;
}

// Persist handlers between opens so we can reuse the same selector instance
let pendingFinalize = null;
let scriptsLoaded = false;
let initialized = false;

// ==== Begin: Config helpers (aligned with da-assets.js) ====
const fullConfJsons = {};
const CONFS = {};

async function fetchConf(path) {
  if (CONFS[path]) return CONFS[path];
  const resp = await fetch(`${DA_ORIGIN}/config${path}`);
  if (!resp.ok) return null;
  fullConfJsons[path] = await resp.json();
  const data = extractFirstSheet(fullConfJsons[path]);
  if (!data) return null;
  CONFS[path] = data;
  return data;
}

function extractFirstSheet(json) {
  if (!json || typeof json !== 'object') return null;
  if (Array.isArray(json.data)) return json.data;
  const firstArray = Object.values(json).find((v) => Array.isArray(v));
  if (firstArray && Array.isArray(firstArray)) return firstArray;
  const firstObjWithData = Object.values(json).find((v) => v && typeof v === 'object' && Array.isArray(v.data));
  return firstObjWithData ? firstObjWithData.data : null;
}

async function fetchValue(path, key) {
  if (CONFS[path]?.[key]) return CONFS[path][key];
  const data = await fetchConf(path);
  if (!data) return null;
  const confKey = data.find((conf) => conf.key === key);
  if (!confKey) return null;
  return confKey.value;
}

function constructConfigPaths(owner, repo) {
  return [`/${owner}/${repo}/`, `/${owner}/`];
}

async function getConfKey(owner, repo, key) {
  if (!(repo || owner)) return null;
  for (const path of constructConfigPaths(owner, repo)) {
    const value = await fetchValue(path, key);
    if (value) return value;
  }
  return null;
}
// ==== End: Config helpers ====

export class AssetsService {
  /** Check if IMS authentication is ready for the asset picker */
  async getAuthStatus() {
    try {
      const { token } = await DA_SDK;
      const authenticated = !!token;
      return { authenticated };
    } catch (e) {
      return { authenticated: false, error: e };
    }
  }

  /** Prompt IMS sign-in (non-blocking). */
  async promptSignIn() {
    try {
      const mod = await import(`${getNx()}/utils/ims.js`);
      const { loadIms, handleSignIn } = mod;
      try { await loadIms(); } catch {}
      handleSignIn();
    } catch (e) {
      // ignore
    }
  }

  /** Open asset picker and resolve with a selected asset URL (image rendition). */
  async openPicker() {
    try {
      // Align with da-assets.js: use IMS for token and repoId from config
      const { token, context } = await DA_SDK;
      if (!token) {
        try { window.dispatchEvent(new CustomEvent('da-asset-auth-required')); } catch {}
        return null;
      }
      const imsToken = token;

      const { org, repo } = context || {};
      if (!org || !repo || !imsToken) return null;

      // Prefer configured repositoryId; fallback to author tier
      const repoId = (await getConfKey(org, repo, 'aem.repositoryId')) || `${org}/${repo}/author`;
      const aemTierType = repoId.includes('delivery') ? 'delivery' : 'author';

      // Compute prodOrigin and DM delivery like the original implementation
      let prodOrigin = await getConfKey(org, repo, 'aem.assets.prod.origin');
      const smartCropSelectEnabled = (await getConfKey(org, repo, 'aem.asset.smartcrop.select')) === 'on';
      const dmDeliveryEnabled = smartCropSelectEnabled || (await getConfKey(org, repo, 'aem.asset.dm.delivery')) === 'on' || (prodOrigin && prodOrigin.startsWith('delivery-'));
      prodOrigin = prodOrigin || `${repoId.replace('author', dmDeliveryEnabled ? 'delivery' : 'publish')}`;

      const getBaseDmUrl = (asset) => `https://${prodOrigin}${prodOrigin.includes('/') ? '' : '/adobe/assets/'}${asset['repo:id']}`;
      const getAssetUrl = (asset, name = asset.name) => {
        if (!dmDeliveryEnabled) {
          return `https://${prodOrigin}${asset.path}`;
        }
        return `${getBaseDmUrl(asset)}/as/${name}`;
      };

      // Load styles and selector once
      await loadStyleOnce(new URL('./da-assets.css', import.meta.url).href);
      if (!scriptsLoaded) {
        await loadScriptOnce(ASSET_SELECTOR_URL);
        scriptsLoaded = true;
      }
      if (!window.PureJSSelectors || !window.PureJSSelectors.renderAssetSelector) {
        throw new Error('Assets selector library failed to load');
      }

      const dialog = ensureDialogRoot();
      const assetSelectorWrapper = dialog.querySelector('.da-dialog-asset-inner[data-part="assets"]');
      const cropSelectorWrapper = dialog.querySelector('.da-dialog-asset-inner[data-part="crops"]');

      const resetCropSelector = () => {
        if (!cropSelectorWrapper || !assetSelectorWrapper) return;
        cropSelectorWrapper.style.display = 'none';
        cropSelectorWrapper.innerHTML = '';
        assetSelectorWrapper.style.display = 'block';
      };

      const emitResult = (payload) => {
        try { dialog.close(); } catch {}
        // Emit global event so listeners in UI can react without relying on stored closures
        try { window.dispatchEvent(new CustomEvent('da-asset-selected', { detail: payload })); } catch {}
        if (typeof pendingFinalize === 'function') pendingFinalize(payload);
        pendingFinalize = null;
      };

      const onClose = () => {
        // Only close if asset selector is visible (match upstream behavior)
        if (assetSelectorWrapper && assetSelectorWrapper.style.display !== 'none') {
          try { dialog.close(); } catch {}
          try { window.dispatchEvent(new CustomEvent('da-asset-cancelled')); } catch {}
          if (typeof pendingFinalize === 'function') pendingFinalize(null);
          pendingFinalize = null;
        }
      };

      const handleSelection = async (assets) => {
        const [asset] = assets || [];
        if (!asset) return;
        const mimetype = (asset.mimetype || asset['dc:format'] || '').toLowerCase();
        const isImage = mimetype.startsWith('image/');
        // eslint-disable-next-line no-underscore-dangle
        const status = asset?._embedded?.['http://ns.adobe.com/adobecloud/rel/metadata/asset']?.['dam:assetStatus'];
        // eslint-disable-next-line no-underscore-dangle
        const activationTarget = asset?._embedded?.['http://ns.adobe.com/adobecloud/rel/metadata/asset']?.['dam:activationTarget'];
        const alt = asset?._embedded?.['http://ns.adobe.com/adobecloud/rel/metadata/asset']?.['dc:description']
          || asset?._embedded?.['http://ns.adobe.com/adobecloud/rel/metadata/asset']?.['dc:title'];
        const injectLink = (await getConfKey(org, repo, 'aem.assets.image.type')) === 'link';

        if (dmDeliveryEnabled && activationTarget !== 'delivery' && status !== 'approved') {
          // Show not-available message
          if (assetSelectorWrapper && cropSelectorWrapper) {
            assetSelectorWrapper.style.display = 'none';
            cropSelectorWrapper.style.display = 'block';
            cropSelectorWrapper.innerHTML = '<p class="da-dialog-asset-error">The selected asset is not available because it is not approved for delivery. Please check the status.</p><div class="da-dialog-asset-buttons"><button class="back">Back</button><button class="cancel">Cancel</button></div>';
            cropSelectorWrapper.querySelector('.cancel')?.addEventListener('click', () => { resetCropSelector(); emitResult(null); });
            cropSelectorWrapper.querySelector('.back')?.addEventListener('click', () => { resetCropSelector(); });
          } else {
            emitResult(null);
          }
          return;
        }

        if (isImage && smartCropSelectEnabled) {
          // Smart crop selection UI
          if (!assetSelectorWrapper || !cropSelectorWrapper) { emitResult(null); return; }
          assetSelectorWrapper.style.display = 'none';
          cropSelectorWrapper.style.display = 'block';

          // Fetch smart crops
          const listSmartCropsResponse = await fetch(`${getBaseDmUrl(asset)}/smartCrops`);
          const listSmartCrops = await listSmartCropsResponse.json();
          if (!(listSmartCrops.items?.length > 0)) {
            resetCropSelector();
            // Fall back to single FPO
            const payload = buildResultObject({ asset, src: getAssetUrl(asset) }, {
              org, repo, repoId, aemTierType, dmDeliveryEnabled, prodOrigin, injectLink, alt,
            });
            emitResult(payload);
            return;
          }

          // Load responsive image config
          const responsive = await getResponsiveImageConfig(org, repo);
          const parentBlockName = null; // Not applicable outside prose editor; keep everywhere / outside-blocks logic
          const configs = Array.isArray(responsive)
            ? (parentBlockName
              ? responsive.filter((c) => (c.position === 'everywhere' || c.position === parentBlockName) && c.crops.every((cr) => listSmartCrops.items.find((it) => it.name === cr)))
              : responsive.filter((c) => (c.position === 'everywhere' || c.position === 'outside-blocks') && c.crops.every((cr) => listSmartCrops.items.find((it) => it.name === cr))))
            : [];

          const structureSelection = configs.length === 0 ? '' : `<h2>Insert Type</h2><ul class="da-dialog-asset-structure-select">
              <li><input checked type="radio" id="single" name="da-dialog-asset-structure-select" value="single"><label for="single">Single, Manual</label></li>
              <li>${configs.map((config, i) => `<input type="radio" id="da-dialog-asset-structure-select-${i}" name="da-dialog-asset-structure-select" value="${encodeURIComponent(JSON.stringify(config))}"><label for="da-dialog-asset-structure-select-${i}">${config.name}</label>`).join('</li><li>')}</li>
            </ul>`;

          cropSelectorWrapper.innerHTML = `<div class="da-dialog-asset-crops-toolbar"><button class="cancel">Cancel</button><button class="back">Back</button><button class="insert">Insert</button></div>${structureSelection}<h2>Smart Crops</h2>`;
          const cropSelectorList = document.createElement('ul');
          cropSelectorList.classList.add('da-dialog-asset-crops');
          cropSelectorWrapper.append(cropSelectorList);

          cropSelectorWrapper.querySelector('.cancel')?.addEventListener('click', () => { resetCropSelector(); emitResult(null); });
          cropSelectorWrapper.querySelector('.back')?.addEventListener('click', () => resetCropSelector());
          cropSelectorWrapper.querySelector('.insert')?.addEventListener('click', () => {
            const insertTypeSelection = cropSelectorWrapper.querySelector('.da-dialog-asset-structure-select input:checked');
            const structureConfig = !insertTypeSelection || insertTypeSelection.value === 'single' ? null : JSON.parse(decodeURIComponent(insertTypeSelection.value));
            const selectedCropLis = cropSelectorList.querySelectorAll('li.selected');
            const selectedCrops = Array.from(selectedCropLis).map((li) => ({ name: li.dataset.name, src: li.querySelector('img')?.src }));
            const primary = selectedCrops[0]?.src || getAssetUrl(asset);
            const payload = buildResultObject({ asset, src: primary }, {
              org, repo, repoId, aemTierType, dmDeliveryEnabled, prodOrigin, injectLink, alt,
            });
            payload.selectedCrops = selectedCrops;
            payload.structure = structureConfig || { type: 'single' };
            emitResult(payload);
            resetCropSelector();
          });

          cropSelectorWrapper.querySelector('.da-dialog-asset-structure-select')?.addEventListener('change', (e) => {
            if (e.target.value === 'single') {
              cropSelectorList.querySelectorAll('li').forEach((crop) => crop.classList.remove('selected'));
              cropSelectorList.querySelector('li[data-name="original"]')?.classList.add('selected');
            } else {
              const structure = JSON.parse(decodeURIComponent(e.target.value));
              cropSelectorList.querySelectorAll('li').forEach((crop) => {
                if (structure.crops.includes(crop.dataset.name)) crop.classList.add('selected');
                else crop.classList.remove('selected');
              });
            }
          });

          const cropItems = listSmartCrops.items.map((smartCrop) => `<li data-name="${smartCrop.name}"><p>${smartCrop.name}</p><img src="${getAssetUrl(asset, `${smartCrop.name}-${asset.name}`)}?smartcrop=${smartCrop.name}">`).join('</li>');
          cropSelectorList.innerHTML = `<li class="selected" data-name="original"><p>Original</p><img src="${getAssetUrl(asset)}"></li>${cropItems}</li>`;
          cropSelectorList.addEventListener('click', () => {
            const structure = cropSelectorWrapper.querySelector('.da-dialog-asset-structure-select input:checked');
            if (structure && structure.value !== 'single') return;
            const li = cropSelectorList.querySelector('li:hover');
            if (!li) return;
            cropSelectorList.querySelector('.selected')?.classList.remove('selected');
            li.classList.add('selected');
          });
          return;
        }

        // Default selection behavior (non-image or no smart crop selection)
        // eslint-disable-next-line no-underscore-dangle
        const renditionLinks = asset?._links?.['http://ns.adobe.com/adobecloud/rel/rendition'] || [];
        const videoLink = renditionLinks?.find((link) => link.href.endsWith('/play'))?.href;
        let src;
        if (aemTierType === 'author') src = getAssetUrl(asset);
        else if (mimetype.startsWith('video/')) src = videoLink;
        else src = renditionLinks?.[0]?.href?.split('?')[0];
        const payload = buildResultObject({ asset, src }, { org, repo, repoId, aemTierType, dmDeliveryEnabled, prodOrigin, injectLink, alt });
        emitResult(payload);
      };

      // Match original behavior: render once and reuse; if wrapper cleared, re-render
      if (!initialized || assetSelectorWrapper.childElementCount === 0) {
        window.PureJSSelectors.renderAssetSelector(assetSelectorWrapper, {
          imsToken: imsToken,
          repositoryId: repoId,
          aemTierType,
          onClose,
          handleSelection,
        });
        initialized = true;
      }

      dialog.showModal();
      return new Promise((resolve) => {
        pendingFinalize = (value) => resolve(value);
      });
    } catch (error) {
      try { console.error('[AssetsService] openPicker error:', error); } catch {}
      return null;
    }
  }

}

function buildResultObject({ asset, src }, meta) {
  const { org, repo, repoId, aemTierType, dmDeliveryEnabled, prodOrigin, injectLink, alt } = meta || {};
  return {
    src: src || null,
    org,
    repo,
    repoId,
    aemTierType,
    dmDeliveryEnabled,
    prodOrigin,
    injectLink,
    alt: alt || null,
    asset: {
      id: asset && asset['repo:id'],
      name: asset && asset.name,
      path: asset && asset.path,
      mimetype: (asset && (asset.mimetype || asset['dc:format'])) || null,
      // eslint-disable-next-line no-underscore-dangle
      status: asset && asset._embedded && asset._embedded['http://ns.adobe.com/adobecloud/rel/metadata/asset'] && asset._embedded['http://ns.adobe.com/adobecloud/rel/metadata/asset']['dam:assetStatus'],
      // eslint-disable-next-line no-underscore-dangle
      activationTarget: asset && asset._embedded && asset._embedded['http://ns.adobe.com/adobecloud/rel/metadata/asset'] && asset._embedded['http://ns.adobe.com/adobecloud/rel/metadata/asset']['dam:activationTarget'],
      // eslint-disable-next-line no-underscore-dangle
      links: asset && asset._links,
    },
  };
}

export default AssetsService;


