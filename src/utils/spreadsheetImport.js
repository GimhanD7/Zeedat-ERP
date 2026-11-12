import { cents } from './formatters';

function parseCsvText(text, delimiter = ',') {
  const clean = String(text || '').replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    const next = clean[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(cell.trim());
      cell = '';
    } else if (ch === '\r' && next === '\n') {
      row.push(cell.trim());
      if (row.some(v => v !== '')) rows.push(row);
      row = [];
      cell = '';
      i++;
    } else if (ch === '\n' || ch === '\r') {
      row.push(cell.trim());
      if (row.some(v => v !== '')) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  row.push(cell.trim());
  if (row.some(v => v !== '')) rows.push(row);
  return rows;
}

async function inflateRawBytes(bytes) {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('This browser cannot decompress .xlsx natively. Please save as .csv in Excel.');
  }
  const ds = new DecompressionStream('deflate-raw');
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

async function extractZipEntries(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const view = new DataView(arrayBuffer);
  const decoder = new TextDecoder('utf-8');

  // Locate End of Central Directory (PK\x05\x06)
  let eocdOffset = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset < 0) {
    throw new Error('Invalid .xlsx archive.');
  }

  const cdOffset = view.getUint32(eocdOffset + 16, true);
  const cdSize = view.getUint32(eocdOffset + 12, true);
  const entries = new Map();
  let ptr = cdOffset;

  while (ptr < cdOffset + cdSize) {
    if (view.getUint32(ptr, true) !== 0x02014b50) break;
    const method = view.getUint16(ptr + 10, true);
    const compSize = view.getUint32(ptr + 20, true);
    const nameLen = view.getUint16(ptr + 28, true);
    const extraLen = view.getUint16(ptr + 30, true);
    const commentLen = view.getUint16(ptr + 32, true);
    const localOffset = view.getUint32(ptr + 42, true);
    const name = decoder.decode(bytes.subarray(ptr + 46, ptr + 46 + nameLen));
    ptr += 46 + nameLen + extraLen + commentLen;

    if (!name.startsWith('xl/')) continue;
    const lNameLen = view.getUint16(localOffset + 26, true);
    const lExtraLen = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + lNameLen + lExtraLen;
    const compressed = bytes.subarray(dataStart, dataStart + compSize);

    let outBytes;
    if (method === 0) outBytes = compressed;
    else if (method === 8) outBytes = await inflateRawBytes(compressed);
    else continue;

    entries.set(name, decoder.decode(outBytes));
  }
  return entries;
}

function colRefToIndex(ref) {
  const letters = String(ref || '').replace(/[^A-Z]/gi, '').toUpperCase();
  let idx = 0;
  for (let i = 0; i < letters.length; i++) {
    idx = idx * 26 + (letters.charCodeAt(i) - 64);
  }
  return Math.max(0, idx - 1);
}

async function parseXlsxRows(arrayBuffer) {
  const entries = await extractZipEntries(arrayBuffer);
  const parser = new DOMParser();

  const sharedStrings = [];
  const ssXml = entries.get('xl/sharedStrings.xml');
  if (ssXml) {
    const doc = parser.parseFromString(ssXml, 'application/xml');
    const sis = doc.getElementsByTagName('si');
    for (let i = 0; i < sis.length; i++) {
      const ts = sis[i].getElementsByTagName('t');
      let text = '';
      for (let j = 0; j < ts.length; j++) text += ts[j].textContent || '';
      sharedStrings.push(text);
    }
  }

  let sheetXml = entries.get('xl/worksheets/sheet1.xml');
  if (!sheetXml) {
    for (const [key, val] of entries.entries()) {
      if (key.startsWith('xl/worksheets/sheet') && key.endsWith('.xml')) {
        sheetXml = val;
        break;
      }
    }
  }
  if (!sheetXml) throw new Error('No worksheet found inside Excel file.');

  const sheetDoc = parser.parseFromString(sheetXml, 'application/xml');
  const rowEls = sheetDoc.getElementsByTagName('row');
  const rows = [];

  for (let i = 0; i < rowEls.length; i++) {
    const cells = rowEls[i].getElementsByTagName('c');
    const rowArr = [];
    for (let j = 0; j < cells.length; j++) {
      const c = cells[j];
      const refAttr = c.getAttribute('r') || '';
      const colIdx = refAttr ? colRefToIndex(refAttr) : j;
      const type = c.getAttribute('t') || '';
      let val = '';

      if (type === 'inlineStr') {
        const isEl = c.getElementsByTagName('is')[0];
        val = isEl ? isEl.textContent || '' : '';
      } else {
        const vEl = c.getElementsByTagName('v')[0];
        const raw = vEl ? vEl.textContent || '' : '';
        if (type === 's') val = sharedStrings[parseInt(raw, 10)] ?? '';
        else val = raw;
      }
      rowArr[colIdx] = String(val).trim();
    }
    if (rowArr.some(v => v !== undefined && v !== '')) {
      rows.push(Array.from(rowArr, v => v ?? ''));
    }
  }
  return rows;
}

const normalizeHeader = h => String(h || '').toLowerCase().replace(/[^a-z0-9]/g, '');

const HEADER_MAP = {
  name: 'name',
  itemname: 'name',
  productname: 'name',
  product: 'name',
  item: 'name',
  sku: 'sku',
  itemcode: 'sku',
  code: 'sku',
  barcode: 'barcode',
  ean: 'barcode',
  upc: 'barcode',
  category: 'category',
  brand: 'brand',
  cost: 'cost',
  costlkr: 'cost',
  purchaseprice: 'cost',
  unitcost: 'cost',
  price: 'price',
  sellingprice: 'price',
  sellingpricelkr: 'price',
  retailprice: 'price',
  qty: 'qty',
  stock: 'qty',
  stockqty: 'qty',
  quantity: 'qty',
  reorder: 'reorder_level',
  reorderlevel: 'reorder_level',
  commissiontype: 'commission_type',
  commission: 'commission_value',
  commissionvalue: 'commission_value',
};

export async function parseStockSpreadsheet(file, branches = []) {
  const nameLower = String(file?.name || '').toLowerCase();
  let rawRows = [];

  if (nameLower.endsWith('.xlsx')) {
    const buf = await file.arrayBuffer();
    rawRows = await parseXlsxRows(buf);
  } else {
    const text = await file.text();
    const delimiter = nameLower.endsWith('.tsv') || (!text.includes(',') && text.includes('\t')) ? '\t' : ',';
    rawRows = parseCsvText(text, delimiter);
  }

  if (rawRows.length < 2) {
    throw new Error('The file must contain a header row and at least one product row.');
  }

  // Match standard headers AND per-branch columns like "Battaramulla Mobile Qty" or "Battaramulla Mobile"
  const branchHeaderMap = new Map();
  for (const b of branches || []) {
    const normName = normalizeHeader(b.name);
    if (normName) {
      branchHeaderMap.set(normName, b);
      branchHeaderMap.set(`${normName}qty`, b);
      branchHeaderMap.set(`${normName}stock`, b);
    }
  }

  const branchColIndices = [];
  const headers = rawRows[0].map((rawH, idx) => {
    const norm = normalizeHeader(rawH);
    if (HEADER_MAP[norm]) return HEADER_MAP[norm];
    const matchedBranch = branchHeaderMap.get(norm);
    if (matchedBranch) {
      branchColIndices.push({ idx, branch: matchedBranch });
      return null;
    }
    return null;
  });

  if (!headers.includes('name')) {
    throw new Error('Missing a "Name" / "Product Name" column in the header row.');
  }

  const hasBranchColumns = branchColIndices.length > 0;
  const hasSkuColumn = headers.includes('sku');

  // Deduplicate rows by normalized name (one unique name per catalog item; latest row wins)
  const byKey = new Map();
  let duplicatesMerged = 0;

  for (let i = 1; i < rawRows.length; i++) {
    const row = rawRows[i];
    const obj = {};
    headers.forEach((field, idx) => {
      if (field && row[idx] !== undefined) obj[field] = String(row[idx]).trim();
    });
    const itemName = String(obj.name || '').trim();
    if (!itemName) continue;

    const cleanNum = v => String(v ?? '').replace(/[, ]+/g, '');
    const commType = String(obj.commission_type || '').toLowerCase().includes('perc') ? 'percent' : 'fixed';

    let branchStocks = null;
    let totalBranchQty = 0;
    if (hasBranchColumns) {
      branchStocks = {};
      for (const { idx, branch } of branchColIndices) {
        if (row[idx] !== undefined && String(row[idx]).trim() !== '') {
          const bQty = Math.max(0, parseInt(cleanNum(row[idx]), 10) || 0);
          branchStocks[branch.id] = bQty;
          totalBranchQty += bQty;
        }
      }
    }

    const parsedQty = hasBranchColumns
      ? totalBranchQty
      : Math.max(0, parseInt(cleanNum(obj.qty || 0), 10) || 0);

    const entry = {
      rowNumber: i + 1,
      sku: String(obj.sku || '').trim(),
      name: itemName,
      category: String(obj.category || 'Accessories').trim() || 'Accessories',
      brand: String(obj.brand || '').trim(),
      barcode: String(obj.barcode || '').trim(),
      cost: Math.max(0, cents(cleanNum(obj.cost || 0))),
      price: Math.max(0, cents(cleanNum(obj.price || 0))),
      qty: parsedQty,
      branch_stocks: branchStocks,
      reorder_level: Math.max(0, parseInt(cleanNum(obj.reorder_level || 0), 10) || 0),
      commission_type: commType,
      commission_value: Math.max(0, cents(cleanNum(obj.commission_value || 0))),
    };

    const dedupKey = itemName.toLowerCase().replace(/\s+/g, ' ');
    if (byKey.has(dedupKey)) {
      duplicatesMerged++;
    }
    byKey.set(dedupKey, entry);
  }

  const rows = Array.from(byKey.values());
  if (!rows.length) {
    throw new Error('No valid product rows found in the spreadsheet.');
  }

  return { rows, hasBranchColumns, hasSkuColumn, duplicatesMerged };
}

export function downloadStockImportTemplate() {
  const rows = [
    ['Product Name', 'Category', 'Brand', 'Barcode', 'Cost (LKR)', 'Selling Price (LKR)', 'Stock Qty', 'Reorder Level', 'Commission Type', 'Commission'],
    ['iPhone 15 Silicone Case', 'Accessories', 'Apple', '', '1200.00', '2500.00', '15', '3', 'fixed', '150.00'],
    ['20W USB-C Fast Charger', 'Accessories', 'Anker', '890123456789', '2100.00', '3800.00', '10', '2', 'percent', '5.00'],
    ['Screen Replacement Labor', 'Services', '', '', '0.00', '3500.00', '0', '0', 'fixed', '500.00'],
  ];
  const csv = rows
    .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\r\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'zeedat_stock_import_template.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportStockCsv(items = [], branches = [], selectedBranch = 0) {
  const csvCell = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const branchCols = selectedBranch === 0 ? branches : branches.filter(b => Number(b.id) === Number(selectedBranch));

  const headers = [
    'Item Code',
    'Product Name',
    'Category',
    'Brand',
    'Barcode',
    'Cost (LKR)',
    'Selling Price (LKR)',
    'Stock Qty',
    ...branchCols.map(b => `${b.name} Qty`),
    'Stock Value Cost (LKR)',
    'Stock Value Retail (LKR)',
    'Reorder Level',
    'Commission Type',
    'Commission',
  ];

  const rows = items.map(p => {
    const isService = p.category === 'Services';
    let stockQty = 0;
    if (!isService) {
      if (selectedBranch === 0) {
        stockQty = Number(p.total_qty ?? p.qty ?? 0);
      } else {
        const hit = (p.branch_stocks || []).find(bs => Number(bs.branch_id) === Number(selectedBranch));
        stockQty = hit ? Number(hit.qty || 0) : 0;
      }
    }

    const branchQtys = branchCols.map(b => {
      if (isService) return '0';
      const hit = (p.branch_stocks || []).find(bs => Number(bs.branch_id) === Number(b.id));
      return String(hit ? Number(hit.qty || 0) : 0);
    });

    const costRs = (Number(p.cost || 0) / 100).toFixed(2);
    const priceRs = (Number(p.price || 0) / 100).toFixed(2);
    const costVal = isService ? '0.00' : ((stockQty * Number(p.cost || 0)) / 100).toFixed(2);
    const retailVal = isService ? '0.00' : ((stockQty * Number(p.price || 0)) / 100).toFixed(2);
    const commVal = (Number(p.commission_value || 0) / 100).toFixed(2);

    return [
      p.sku || '',
      p.name || '',
      p.category || '',
      p.brand || '',
      p.barcode || '',
      costRs,
      priceRs,
      isService ? '0' : String(stockQty),
      ...branchQtys,
      costVal,
      retailVal,
      String(Number(p.reorder_level || 0)),
      p.commission_type || 'fixed',
      commVal,
    ];
  });

  const csv = [headers, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const branchTag = selectedBranch === 0 ? 'all_branches' : (branches.find(b => Number(b.id) === Number(selectedBranch))?.name || `branch_${selectedBranch}`).toLowerCase().replace(/[^a-z0-9]+/g, '_');
  const todayStr = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `zeedat_stock_${branchTag}_${todayStr}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
