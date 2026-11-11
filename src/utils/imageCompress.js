export const MAX_PRODUCT_IMAGE_BYTES = 10 * 1024; // 10 KB

function dataUrlByteLength(dataUrl) {
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
 * Compresses an uploaded image File in the browser using Canvas until
 * the encoded WebP/JPEG payload is strictly <= 10 KB (10,240 bytes).
 */
export async function compressProductImage(file, maxBytes = MAX_PRODUCT_IMAGE_BYTES) {
  if (!file || !String(file.type || '').startsWith('image/')) {
    throw new Error('Please choose a valid JPG, PNG, or WebP image.');
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

  const dimensions = [320, 260, 210, 170, 136, 108, 84];
  const qualities = [0.82, 0.70, 0.58, 0.45, 0.34, 0.24, 0.16];
  const mimes = ['image/webp', 'image/jpeg'];

  let best = null;

  for (const maxDim of dimensions) {
    const scale = Math.min(1, maxDim / Math.max(srcW, srcH));
    const targetW = Math.max(1, Math.round(srcW * scale));
    const targetH = Math.max(1, Math.round(srcH * scale));

    canvas.width = targetW;
    canvas.height = targetH;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, targetW, targetH);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, targetW, targetH);

    for (const mime of mimes) {
      for (const q of qualities) {
        const dataUrl = canvas.toDataURL(mime, q);
        if (!dataUrl.startsWith(`data:${mime};base64,`)) continue;
        const bytes = dataUrlByteLength(dataUrl);
        if (!best || bytes < best.bytes) {
          best = { dataUrl, bytes, mime, width: targetW, height: targetH };
        }
        if (bytes <= maxBytes) {
          return { dataUrl, bytes, mime, width: targetW, height: targetH };
        }
      }
    }
  }

  if (best && best.bytes <= maxBytes) {
    return best;
  }
  throw new Error('Could not compress this image under 10 KB. Try a simpler image.');
}
