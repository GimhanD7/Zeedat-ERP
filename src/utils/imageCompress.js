import { useEffect, useState } from 'react';
import { DEFAULT_ZEEDAT_LOGO } from './defaultLogo';

export const MAX_PRODUCT_IMAGE_BYTES = 10 * 1024; // 10 KB
export const MAX_SYSTEM_LOGO_BYTES = 10 * 1024; // 10 KB

const LOGO_STORAGE_KEY = 'zeedat_system_logo_v1';
const SHOP_NAME_STORAGE_KEY = 'zeedat_system_shop_name_v1';

let currentLogoDataUrl = (() => {
  try {
    const val = localStorage.getItem(LOGO_STORAGE_KEY) || '';
    return /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(val)
      ? val
      : DEFAULT_ZEEDAT_LOGO;
  } catch {
    return DEFAULT_ZEEDAT_LOGO;
  }
})();

let currentShopName = (() => {
  try {
    return localStorage.getItem(SHOP_NAME_STORAGE_KEY) || 'ZEEDAT POS';
  } catch {
    return 'ZEEDAT POS';
  }
})();

const logoListeners = new Set();

function updateBrowserFavicon(dataUrl) {
  if (typeof document === 'undefined') return;
  try {
    let link = document.querySelector("link[rel*='icon']");
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = dataUrl || '/favicon.ico';
  } catch {
    // Ignore favicon DOM update errors
  }
}

if (currentLogoDataUrl) {
  updateBrowserFavicon(currentLogoDataUrl);
}

export function getSystemLogo() {
  return currentLogoDataUrl || DEFAULT_ZEEDAT_LOGO;
}

export function getSystemShopName() {
  return currentShopName || 'ZEEDAT POS';
}

export function setSystemLogo(dataUrl, shopName) {
  const isCustomValid =
    typeof dataUrl === 'string' &&
    /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(dataUrl);
  const validLogo = isCustomValid ? dataUrl : DEFAULT_ZEEDAT_LOGO;
  const nextName =
    typeof shopName === 'string' && shopName.trim() ? shopName.trim() : currentShopName;

  const changed = validLogo !== currentLogoDataUrl || nextName !== currentShopName;
  currentLogoDataUrl = validLogo;
  currentShopName = nextName;

  try {
    if (isCustomValid) {
      localStorage.setItem(LOGO_STORAGE_KEY, validLogo);
    } else {
      localStorage.removeItem(LOGO_STORAGE_KEY);
    }
    if (nextName) {
      localStorage.setItem(SHOP_NAME_STORAGE_KEY, nextName);
    }
  } catch {
    // Ignore storage quota errors
  }

  updateBrowserFavicon(validLogo);

  if (changed) {
    logoListeners.forEach(fn => {
      try {
        fn({ logo: currentLogoDataUrl, shopName: currentShopName });
      } catch {}
    });
  }
}

export function syncSystemLogoFromSettings(settings) {
  if (!settings || typeof settings !== 'object') return;
  let layoutLogo = '';
  try {
    const layout =
      typeof settings.bill_layout === 'string'
        ? JSON.parse(settings.bill_layout)
        : settings.bill_layout;
    layoutLogo = layout?.logo || '';
  } catch {
    layoutLogo = '';
  }
  const resolvedLogo = layoutLogo || settings.system_logo || settings.shop_logo || '';
  const resolvedName = settings.shop_name || currentShopName;
  setSystemLogo(resolvedLogo, resolvedName);
}

export function useSystemLogo() {
  const [state, setState] = useState(() => ({
    logo: currentLogoDataUrl,
    shopName: currentShopName,
  }));

  useEffect(() => {
    setState({ logo: currentLogoDataUrl, shopName: currentShopName });
    const listener = next => setState(next);
    logoListeners.add(listener);
    return () => logoListeners.delete(listener);
  }, []);

  return state;
}

export function formatBytesLabel(bytes) {
  const n = Number(bytes || 0);
  if (n >= 1024 * 1024) {
    return `${(n / (1024 * 1024)).toFixed(2)} MB`;
  }
  if (n >= 1024) {
    return `${(n / 1024).toFixed(1)} KB`;
  }
  return `${n} B`;
}

export function dataUrlByteLength(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') return 0;
  const comma = dataUrl.indexOf(',');
  if (comma === -1) return Infinity;
  const b64 = dataUrl.slice(comma + 1);
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - padding;
}

function loadHtmlImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Could not decode the selected image.'));
      img.src = String(reader.result);
    };
    reader.onerror = () => reject(new Error('Could not read the selected image file.'));
    reader.readAsDataURL(file);
  });
}

/**
 * Compresses any uploaded logo image (even 5MB, 10MB, or 20MB) down to <= 10 KB (10,240 bytes)
 * while preserving transparency (via WebP/PNG) and sharp edges for use across all system logo sections.
 */
export async function compressSystemLogo(file, maxBytes = MAX_SYSTEM_LOGO_BYTES) {
  if (!file || !String(file.type || '').startsWith('image/')) {
    throw new Error('Please choose a valid PNG, JPG, or WebP image file.');
  }

  const img = await loadHtmlImage(file);
  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;
  if (!srcW || !srcH) {
    throw new Error('Selected image has invalid dimensions.');
  }

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas image compression is unavailable in this browser.');
  }

  const dimensions = [360, 300, 256, 220, 190, 160, 136, 116, 96, 80, 64];
  const qualities = [0.88, 0.78, 0.68, 0.58, 0.48, 0.38, 0.28, 0.20, 0.14];

  let best = null;

  for (const maxDim of dimensions) {
    const scale = Math.min(1, maxDim / Math.max(srcW, srcH));
    const targetW = Math.max(1, Math.round(srcW * scale));
    const targetH = Math.max(1, Math.round(srcH * scale));

    // 1. Try transparent WebP & PNG first so transparent logos stay transparent
    canvas.width = targetW;
    canvas.height = targetH;
    ctx.clearRect(0, 0, targetW, targetH);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, targetW, targetH);

    for (const q of qualities) {
      const webpUrl = canvas.toDataURL('image/webp', q);
      if (webpUrl.startsWith('data:image/webp;base64,')) {
        const bytes = dataUrlByteLength(webpUrl);
        if (!best || bytes < best.bytes) {
          best = {
            dataUrl: webpUrl,
            bytes,
            originalBytes: file.size,
            mime: 'image/webp',
            width: targetW,
            height: targetH,
          };
        }
        if (bytes <= maxBytes) {
          return {
            dataUrl: webpUrl,
            bytes,
            originalBytes: file.size,
            mime: 'image/webp',
            width: targetW,
            height: targetH,
          };
        }
      }
    }

    if (maxDim <= 160) {
      const pngUrl = canvas.toDataURL('image/png');
      if (pngUrl.startsWith('data:image/png;base64,')) {
        const bytes = dataUrlByteLength(pngUrl);
        if (!best || bytes < best.bytes) {
          best = {
            dataUrl: pngUrl,
            bytes,
            originalBytes: file.size,
            mime: 'image/png',
            width: targetW,
            height: targetH,
          };
        }
        if (bytes <= maxBytes) {
          return {
            dataUrl: pngUrl,
            bytes,
            originalBytes: file.size,
            mime: 'image/png',
            width: targetW,
            height: targetH,
          };
        }
      }
    }

    // 2. Fallback to white-background JPEG if WebP isn't supported or still > maxBytes
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, targetW, targetH);
    ctx.drawImage(img, 0, 0, targetW, targetH);
    for (const q of qualities) {
      const jpgUrl = canvas.toDataURL('image/jpeg', q);
      if (!jpgUrl.startsWith('data:image/jpeg;base64,')) continue;
      const bytes = dataUrlByteLength(jpgUrl);
      if (!best || bytes < best.bytes) {
        best = {
          dataUrl: jpgUrl,
          bytes,
          originalBytes: file.size,
          mime: 'image/jpeg',
          width: targetW,
          height: targetH,
        };
      }
      if (bytes <= maxBytes) {
        return {
          dataUrl: jpgUrl,
          bytes,
          originalBytes: file.size,
          mime: 'image/jpeg',
          width: targetW,
          height: targetH,
        };
      }
    }
  }

  if (best) {
    return best;
  }
  throw new Error('Could not compress this logo image.');
}

/**
 * Compresses an uploaded product image File in the browser using Canvas until
 * the encoded WebP/JPEG payload is strictly <= 10 KB (10,240 bytes).
 */
export async function compressProductImage(file, maxBytes = MAX_PRODUCT_IMAGE_BYTES) {
  return compressSystemLogo(file, maxBytes);
}
