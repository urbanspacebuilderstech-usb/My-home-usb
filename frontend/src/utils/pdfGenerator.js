import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const COMPANY_INFO = {
  name: 'URBAN SPACE BUILDERS',
  phone: '9150030450',
  email: 'info@urbanspacebuilders.com',
  state: '33-Tamil Nadu'
};

const STANDARD_NOTE =
  'Based upon soil test report foundation details will be worked out and cost may vary depends upon the structural design.\n' +
  '(If Pile foundation, double matt reinforcement for pile cap etc. the cost for the same will be additional)';

const TERMS = [
  '1) The estimation shows you construction cost in Chennai area.',
  '2) Price may vary depending on location, site actual measurements, material cost at the time of project and design, building specification.',
  '3) Our team will work out detailed quote understanding requirement.',
  '4) Site near by land required for making Labour shed and material shed (Land provided is in client scope)',
  '5) EB, Construction water, Borewell, Soil test, Borewell yield point checking, etc are all in client scope.',
  '6) Unit rate will be freezed at the time of project finalization.',
  '7) Elevation cost will be additional quotation will be provided at the time of drawing finalization.',
  '8) Sqft rate considered for Safe bearing capacity of soil is 230 Kn/m2',
  'Thanks for doing business with us!'
];

// Landscape A4, laid out like the Excel estimate sheet: one fixed column grid
// shared by every table so their borders line up into a single sheet.
const MARGIN = 10;
const AMBER = [255, 192, 0];
const COLUMN_STYLES = {
  0: { cellWidth: 22, halign: 'center' },
  1: { cellWidth: 149 },
  2: { cellWidth: 24, halign: 'right' },
  3: { cellWidth: 20, halign: 'center' },
  4: { cellWidth: 28, halign: 'right' },
  5: { cellWidth: 34, halign: 'right' }
};

// The Excel sheet is printed "fit to one page"; do the same by stepping the
// font down until the estimate fits. If even the smallest size runs over,
// print at the normal size across pages instead.
const FONT_SIZES = [8, 7.5, 7, 6.5, 6];

const sheetOptions = (fontSize) => ({
  theme: 'grid',
  margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN },
  columnStyles: COLUMN_STYLES,
  styles: {
    font: 'helvetica',
    fontSize,
    textColor: [0, 0, 0],
    lineColor: [0, 0, 0],
    lineWidth: 0.2,
    cellPadding: [fontSize * 0.1, 1.5],
    valign: 'middle'
  }
});

const formatQty = (qty) => {
  const n = Math.abs(Number(qty) || 0);
  return n ? String(Number(n.toFixed(2))) : '';
};
const formatRate = (rate) => {
  const n = Math.abs(Number(rate) || 0);
  return n ? new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(n) : '';
};
const formatAmount = (amount) => {
  const n = Math.abs(Number(amount) || 0);
  return n ? new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n) : '-';
};

// Item names are usually pasted from Excel: wrapped in quotes with doubled
// inner quotes, and padded with long runs of spaces standing in for line
// breaks. Treat those runs as line breaks so each floor sits on its own line.
function cleanText(text) {
  let s = String(text || '').trim();
  if (s.length > 1 && s.startsWith('"') && s.endsWith('"')) {
    s = s.slice(1, -1).replace(/""/g, '"');
  }
  return s
    .split(/\r?\n|[ \t]{6,}/)
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

const twoDigitWords = (n) => (n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ''}`);
const threeDigitWords = (n) => [
  n >= 100 && `${ONES[Math.floor(n / 100)]} Hundred`,
  n % 100 && twoDigitWords(n % 100)
].filter(Boolean).join(' ');

// Indian numbering: 1,83,85,248 → One Crore Eighty Three Lakh Eighty Five Thousand Two Hundred Forty Eight
function indianWords(n) {
  return [
    n >= 1e7 && `${indianWords(Math.floor(n / 1e7))} Crore`,
    Math.floor((n % 1e7) / 1e5) && `${twoDigitWords(Math.floor((n % 1e7) / 1e5))} Lakh`,
    Math.floor((n % 1e5) / 1e3) && `${twoDigitWords(Math.floor((n % 1e5) / 1e3))} Thousand`,
    n % 1e3 && threeDigitWords(n % 1e3)
  ].filter(Boolean).join(' ');
}

const amountInWords = (amount) => {
  const n = Math.round(Math.abs(Number(amount) || 0));
  return n ? `Rupees ${indianWords(n)} Only` : 'Rupees Zero Only';
};

// The Login Logo from Settings → App Branding. An upload overwrites
// /logo.webp and bumps its version, so /api/branding gives the current
// cache-busted URL.
async function brandingLogoUrl() {
  try {
    const res = await axios.get(`${API}/branding`);
    return res.data?.logo_url || '/logo.webp';
  } catch {
    return '/logo.webp';
  }
}

// Crop the logo to its visible mark, so padding in the uploaded file does not
// shrink it in the header cell. Cached per URL, i.e. until a new upload.
let logoCache = { url: null, logo: null };
async function loadLogo() {
  const url = await brandingLogoUrl();
  if (logoCache.url === url) return logoCache.logo;
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let minX = width, minY = height, maxX = -1, maxY = -1;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        if (data[i + 3] > 32 && Math.min(data[i], data[i + 1], data[i + 2]) < 230) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) return null;
    const w = maxX - minX + 1;
    const h = maxY - minY + 1;
    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    out.getContext('2d').drawImage(canvas, minX, minY, w, h, 0, 0, w, h);
    logoCache = { url, logo: { dataUrl: out.toDataURL('image/png'), ratio: w / h } };
    return logoCache.logo;
  } catch {
    return null;
  }
}

function drawCompanyBlock(doc, cell, logo, fontSize) {
  if (logo) {
    const h = cell.height - 4;
    doc.addImage(logo.dataUrl, 'PNG', cell.x + 3, cell.y + 2, h * logo.ratio, h);
  }
  const right = cell.x + cell.width - 3;
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(fontSize + 4);
  doc.text(COMPANY_INFO.name, right, cell.y + cell.height * 0.4, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(fontSize - 0.5);
  doc.text(`Phone no.: ${COMPANY_INFO.phone}   Email: ${COMPANY_INFO.email}`, right, cell.y + cell.height * 0.66, { align: 'right' });
  doc.text(`State: ${COMPANY_INFO.state}`, right, cell.y + cell.height * 0.86, { align: 'right' });
}

function drawSignatureBlock(doc, cell, fontSize) {
  const centerX = cell.x + cell.width / 2;
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(fontSize + 0.5);
  doc.text(`For, ${COMPANY_INFO.name}`, centerX, cell.y + 8, { align: 'center' });
  doc.text('Authorized Signatory', centerX, cell.y + cell.height - 4, { align: 'center' });
}

function buildEstimate(project, logo, fontSize) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const sheet = sheetOptions(fontSize);
  const bold = { fontStyle: 'bold' };

  // ─── TITLE, COMPANY & CLIENT DETAILS ───
  const label = { fontStyle: 'bold', fontSize: fontSize - 0.5, halign: 'left' };
  const value = { fontStyle: 'bold', fontSize: fontSize + 1, halign: 'left' };
  const infoRow = (leftLabel, leftValue, rightLabel, rightValue) => [
    { content: leftLabel, styles: label },
    { content: leftValue || '', styles: value },
    { content: rightLabel, styles: { ...label, halign: 'right' } },
    { content: rightValue || '', colSpan: 3, styles: value }
  ];

  autoTable(doc, {
    ...sheet,
    startY: MARGIN,
    body: [
      [{ content: 'Estimate', colSpan: 6, styles: { halign: 'center', fontStyle: 'bold', fontSize: fontSize + 3 } }],
      [{ content: '', colSpan: 6, styles: { minCellHeight: fontSize * 2 } }],
      infoRow('Estimate for :', project.client_name, 'Estimate No :', project.re_number || project.re_project_id),
      infoRow('Site Location :', project.location, 'CRN Number :', ''),
      infoRow('Mobile No :', project.client_phone, 'Date :', new Date().toLocaleDateString('en-GB').replace(/\//g, '-')),
      infoRow('Alternate No :', project.alternative_phone, 'Revision :', String(project.revision || 0))
    ],
    didDrawCell: (data) => {
      if (data.section === 'body' && data.row.index === 1 && data.column.index === 0) {
        drawCompanyBlock(doc, data.cell, logo, fontSize);
      }
    }
  });

  // ─── SCOPE ITEMS, DISCOUNT & TOTALS ───
  // Lines with a negative amount (entered as a negative rate) are discounts:
  // listed under "Discount" and taken off the Total.
  const items = (project.rough_scope_items || []).map(item => ({
    ...item,
    amount: Number(item.total ?? (Number(item.quantity) || 0) * (Number(item.rate) || 0)) || 0
  }));
  const charges = items.filter(item => item.amount >= 0);
  const discounts = items.filter(item => item.amount < 0);
  const grossTotal = charges.reduce((sum, item) => sum + item.amount, 0);
  const discountTotal = discounts.reduce((sum, item) => sum - item.amount, 0);
  const projectValue = items.length ? grossTotal - discountTotal : (project.estimated_total || 0);

  const itemRow = (item, slNo) => [
    slNo ?? '',
    cleanText(item.description || item.name) || '-',
    formatQty(item.quantity),
    item.unit || '',
    formatRate(item.rate),
    { content: formatAmount(item.amount), styles: slNo ? bold : {} }
  ];
  const summaryRow = (text, amount) => [
    '',
    { content: text, styles: bold },
    '', '', '',
    { content: amount, styles: bold }
  ];

  const body = charges.map((item, idx) => itemRow(item, idx + 1));
  if (!items.length) {
    body.push(['', { content: 'No scope items added', styles: { fontStyle: 'italic', textColor: [120, 120, 120] } }, '', '', '', '']);
  }
  if (discounts.length) {
    body.push(summaryRow('Total', formatAmount(grossTotal)));
    body.push(summaryRow('Discount', ''));
    discounts.forEach(item => body.push(itemRow(item)));
    body.push(summaryRow('Total discount', formatAmount(discountTotal)));
  }
  body.push(summaryRow('Total Project Value', formatAmount(projectValue)));
  body.push([
    { content: 'Note:', styles: { ...bold, halign: 'left' } },
    { content: [STANDARD_NOTE, cleanText(project.planning_notes)].filter(Boolean).join('\n') },
    { content: '', colSpan: 4 }
  ]);

  autoTable(doc, {
    ...sheet,
    startY: doc.lastAutoTable.finalY,
    rowPageBreak: 'avoid',
    head: [['Sl.No', 'Item name', 'Quantity', 'Unit', 'Price / Unit', 'Amount']],
    headStyles: { fillColor: AMBER, textColor: [0, 0, 0], fontStyle: 'bold', halign: 'center' },
    body
  });

  // ─── AMOUNT IN WORDS, TERMS & SIGNATURE ───
  const band = (text) => ({ content: text, colSpan: 2, styles: { fillColor: AMBER, fontStyle: 'bold', halign: 'center' } });

  autoTable(doc, {
    ...sheet,
    startY: doc.lastAutoTable.finalY,
    pageBreak: 'avoid',
    rowPageBreak: 'avoid',
    body: [
      [band('Estimate Amount in Words'), { content: '', colSpan: 4, rowSpan: 2 }],
      [{ content: amountInWords(projectValue), colSpan: 2, styles: { fontStyle: 'bold', halign: 'left' } }],
      [band('Terms and Conditions'), { content: '', colSpan: 4, rowSpan: 2 }],
      [{ content: TERMS.join('\n'), colSpan: 2, styles: { fontSize: fontSize - 0.5, halign: 'left' } }]
    ],
    didDrawCell: (data) => {
      if (data.section === 'body' && data.row.index === 2 && data.column.index === 2) {
        drawSignatureBlock(doc, data.cell, fontSize);
      }
    }
  });

  return doc;
}

function addPageNumbers(doc) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page++) {
    doc.setPage(page);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(110, 110, 110);
    doc.text(`Page ${page} of ${pageCount}`, pageWidth - MARGIN, pageHeight - 4, { align: 'right' });
  }
}

export async function generateREPDF(project) {
  if (!project) return;

  const logo = await loadLogo();
  let doc = null;
  for (const fontSize of FONT_SIZES) {
    doc = buildEstimate(project, logo, fontSize);
    if (doc.getNumberOfPages() === 1) break;
  }
  if (doc.getNumberOfPages() > 1) {
    doc = buildEstimate(project, logo, FONT_SIZES[0]);
    addPageNumbers(doc);
  }

  // Save
  const fileName = `RE_${project.project_name || project.client_name}_${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(fileName);
  return fileName;
}
