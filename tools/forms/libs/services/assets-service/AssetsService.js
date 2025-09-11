import DA_SDK from 'https://da.live/nx/utils/sdk.js';
import { DA_ORIGIN, DA_LIVE } from '../../../utils.js';
import { getAssetPickerHost } from '../../form-ui/renderers/asset-picker-host.js';


// Persist handlers between opens so we can reuse the same selector instance
let pendingFinalize = null;

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
  if (CONFS[path] && CONFS[path][key]) return CONFS[path][key];
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

async function getResponsiveImageConfig(owner, repo) {
  if (!(repo || owner)) return null;
  for (const path of constructConfigPaths(owner, repo)) {
    if (!fullConfJsons[path]) await fetchConf(path);
    const fullConfigJson = fullConfJsons[path];
    const responsiveImages = fullConfigJson && fullConfigJson['responsive-images'];
    if (responsiveImages && responsiveImages.data) {
      return responsiveImages.data.map((config) => ({
        ...config,
        crops: (config && config.crops ? String(config.crops).split(/\s*,\s*/) : []),
      }));
    }
  }
  return false;
}
// ==== End: Config helpers ====

export class AssetsService {
  async getAuthStatus() {
    try {
      let token = null;
      if (this._context && this._context.services && this._context.services.auth && this._context.services.auth.getToken) {
        token = await this._context.services.auth.getToken();
      } else {
        const sdk = await DA_SDK;
        token = sdk && sdk.token;
      }
      return { authenticated: !!token };
    } catch (e) {
      return { authenticated: false, error: e };
    }
  }

  /** Open asset picker and resolve with a selected asset URL (image rendition). */
  async openPicker() {
    try {
      // Align with da-assets.js: use token and repoId from config
      const sdk = await DA_SDK;
      let imsToken = null;
      if (this._context && this._context.services && this._context.services.auth && this._context.services.auth.getToken) {
        imsToken = await this._context.services.auth.getToken();
      } else {
        imsToken = sdk && sdk.token;
      }
      if (!imsToken) {
        try { window.dispatchEvent(new CustomEvent('da-asset-auth-required')); } catch {}
        return null;
      }

      const ctx = sdk && sdk.context;
      const org = ctx && ctx.org;
      const repo = ctx && ctx.repo;
      if (!org || !repo) return null;

      // Prefer configured repositoryId; fallback to author tier
      const repoId = (await getConfKey(org, repo, 'aem.repositoryId')) || `${org}/${repo}/author`;
      const aemTierType = repoId.includes('delivery') ? 'delivery' : 'author';

      // Compute prodOrigin and DM delivery like the original implementation
      let prodOrigin = await getConfKey(org, repo, 'aem.assets.prod.origin');
      const smartCropSelectEnabled = (await getConfKey(org, repo, 'aem.asset.smartcrop.select')) === 'on';
      const dmDeliveryEnabled = smartCropSelectEnabled || (await getConfKey(org, repo, 'aem.asset.dm.delivery')) === 'on' || (prodOrigin && prodOrigin.startsWith('delivery-'));
      prodOrigin = prodOrigin || `${repoId.replace('author', dmDeliveryEnabled ? 'delivery' : 'publish')}`;

      const baseDmUrlFor = (asset) => `https://${prodOrigin}${prodOrigin.includes('/') ? '' : '/adobe/assets/'}${asset['repo:id']}`;
      const assetUrlFor = (asset, name = asset.name) => {
        if (!dmDeliveryEnabled) return `https://${prodOrigin}${asset.path}`;
        return `${baseDmUrlFor(asset)}/as/${name}`;
      };

      const injectLink = (await getConfKey(org, repo, 'aem.assets.image.type')) === 'link';

      const host = getAssetPickerHost();
      const selectorConfig = { imsToken, repositoryId: repoId, aemTierType };
      const meta = { org, repo, repoId, aemTierType, dmDeliveryEnabled, prodOrigin, injectLink, smartCropSelectEnabled };
      const helpers = {
        getBaseDmUrl: baseDmUrlFor,
        getAssetUrl: assetUrlFor,
        getResponsiveImageConfig,
        buildResultObject,
      };

      return await new Promise((resolve) => {
        pendingFinalize = (value) => resolve(value);
        host.show({
          selectorConfig,
          meta,
          helpers,
          callbacks: {
            onResult: (payload) => {
              try { window.dispatchEvent(new CustomEvent('da-asset-selected', { detail: payload })); } catch {}
              if (typeof pendingFinalize === 'function') pendingFinalize(payload);
              pendingFinalize = null;
            },
            onCancel: () => {
              try { window.dispatchEvent(new CustomEvent('da-asset-cancelled')); } catch {}
              if (typeof pendingFinalize === 'function') pendingFinalize(null);
              pendingFinalize = null;
            },
          },
        });
      });
    } catch (error) {
      try { console.error('[AssetsService] openPicker error:', error); } catch {}
      return null;
    }
  }
}

function buildResultObject({ asset, src }, meta) {
  const org = meta && meta.org;
  const repo = meta && meta.repo;
  const repoId = meta && meta.repoId;
  const aemTierType = meta && meta.aemTierType;
  const dmDeliveryEnabled = meta && meta.dmDeliveryEnabled;
  const prodOrigin = meta && meta.prodOrigin;
  const injectLink = meta && meta.injectLink;
  const alt = (meta && meta.alt) || null;
  return {
    src: src || null,
    org,
    repo,
    repoId,
    aemTierType,
    dmDeliveryEnabled,
    prodOrigin,
    injectLink,
    alt,
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


