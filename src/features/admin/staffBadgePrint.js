import { encodeCode128B } from '../../components/common/BarcodeSvg';
import { initials, roles } from '../../utils';

export function getStaffBadgeCode(member) {
  const clean = String(member?.badge_code || '').trim().toUpperCase();
  if (clean) return clean;
  const id = Number(member?.id || 0);
  return id > 0 ? `STF${String(id).padStart(5, '0')}` : 'STF00000';
}

const esc = v =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

function renderInlineBarcodeSvg(code, height = 42) {
  const encoded = encodeCode128B(code);
  if (!encoded) return `<div class="bc-text">${esc(code)}</div>`;
  const bars = encoded.bars
    .map(b => `<rect x="${b.x}" y="2" width="${b.width}" height="${height}" fill="#0f172a" />`)
    .join('');
  const totalH = height + 16;
  return `<svg width="100%" height="${totalH}" viewBox="0 0 ${encoded.totalWidth} ${totalH}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="#ffffff" />
    ${bars}
    <text x="${encoded.totalWidth / 2}" y="${height + 13}" text-anchor="middle" font-family="'Courier New', monospace" font-size="11" font-weight="700" fill="#0f172a">${esc(encoded.text)}</text>
  </svg>`;
}

export function buildStaffBadgesPrintHtml(members = [], shopName = 'ZEEDAT POS') {
  const cards = members
    .map(m => {
      const badge = getStaffBadgeCode(m);
      const roleLabel = roles[m.role] || m.role || 'Staff';
      const branchLabel = m.role === 'owner' ? 'All Branches' : m.branch || 'Assigned Branch';
      return `<div class="badge-card">
        <div class="badge-top">
          <span class="shop-tag">${esc(shopName)}</span>
          <span class="id-tag">ID #${esc(m.id)}</span>
        </div>
        <div class="badge-person">
          <div class="avatar">${esc(initials(m.name))}</div>
          <div class="person-meta">
            <div class="name">${esc(m.name)}</div>
            <div class="role">${esc(roleLabel)} · ${esc(branchLabel)}</div>
          </div>
        </div>
        <div class="badge-barcode">
          ${renderInlineBarcodeSvg(badge, 40)}
        </div>
      </div>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Staff ID Badges — ${esc(shopName)}</title>
<style>
  @page { size: A4 portrait; margin: 12mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: 'Segoe UI', Arial, sans-serif; color: #0f172a; background: #ffffff; }
  .sheet { display: flex; flex-wrap: wrap; gap: 10mm; align-items: flex-start; }
  .badge-card {
    width: 86mm;
    height: 54mm;
    border: 1.2px solid #cbd5e1;
    border-radius: 8px;
    padding: 4.5mm 5mm;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    page-break-inside: avoid;
    background: #ffffff;
  }
  .badge-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1.5px solid #0d9488;
    padding-bottom: 2mm;
  }
  .shop-tag { font-size: 9px; font-weight: 800; letter-spacing: 0.6px; color: #0f766e; text-transform: uppercase; }
  .id-tag { font-size: 9px; font-weight: 700; color: #334155; background: #f1f5f9; padding: 1px 6px; border-radius: 4px; }
  .badge-person { display: flex; align-items: center; gap: 3.5mm; margin: 2mm 0; }
  .avatar {
    width: 11mm;
    height: 11mm;
    border-radius: 50%;
    background: #0f766e;
    color: #ffffff;
    font-weight: 800;
    font-size: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .person-meta { min-width: 0; }
  .name { font-size: 13px; font-weight: 700; color: #0f172a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .role { font-size: 9.5px; color: #475569; margin-top: 1px; }
  .badge-barcode { border-top: 1px dashed #e2e8f0; padding-top: 1.5mm; }
</style>
</head>
<body>
  <div class="sheet">${cards}</div>
</body>
</html>`;
}
