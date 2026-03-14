import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const COMPANY_INFO = {
  name: 'URBAN SPACE BUILDERS',
  tagline: 'Building Dreams Into Reality',
  address: 'No.123, Construction Lane, Chennai - 600001',
  phone: '+91 44 2345 6789',
  email: 'info@urbanspacebuilders.com',
  website: 'www.urbanspacebuilders.com',
  gstin: 'GSTIN: 33XXXXX1234X1Z5'
};

const formatPDFCurrency = (amount) => {
  const formatted = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(amount || 0);
  return `Rs. ${formatted}`;
};

export async function generateREPDF(project) {
  if (!project) return;

  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;

  // ─── WATERMARK (render first so it's behind everything) ───
  doc.setTextColor(245, 245, 245);
  doc.setFontSize(50);
  doc.setFont('helvetica', 'bold');
  doc.text('URBAN SPACE', pageWidth / 2, pageHeight / 2 - 10, { align: 'center', angle: 35 });
  doc.text('BUILDERS', pageWidth / 2, pageHeight / 2 + 15, { align: 'center', angle: 35 });

  // ─── HEADER / LETTERPAD ───
  let logoLoaded = false;
  try {
    const logoImg = new Image();
    logoImg.crossOrigin = 'anonymous';
    await new Promise((resolve, reject) => {
      logoImg.onload = resolve;
      logoImg.onerror = reject;
      logoImg.src = '/logo.png';
    });
    doc.addImage(logoImg, 'PNG', margin, 8, 20, 20);
    logoLoaded = true;
  } catch {
    // fallback: text only
  }

  const textStartX = logoLoaded ? margin + 24 : margin;

  // Company Name
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(30, 30, 30);
  doc.text(COMPANY_INFO.name, textStartX, 17);

  // Tagline
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(130, 130, 130);
  doc.text(COMPANY_INFO.tagline, textStartX, 23);

  // Contact info (right-aligned)
  const contactX = pageWidth - margin;
  doc.setFontSize(8.5);
  doc.setTextColor(70, 70, 70);
  doc.text(COMPANY_INFO.phone, contactX, 12, { align: 'right' });
  doc.text(COMPANY_INFO.email, contactX, 17, { align: 'right' });
  doc.text(COMPANY_INFO.website, contactX, 22, { align: 'right' });
  doc.setFontSize(7.5);
  doc.setTextColor(110, 110, 110);
  doc.text(COMPANY_INFO.address, contactX, 27, { align: 'right' });

  // Header separator line
  doc.setDrawColor(50, 50, 50);
  doc.setLineWidth(0.7);
  doc.line(margin, 32, pageWidth - margin, 32);

  // ─── DOCUMENT TITLE (centered, no box) ───
  let y = 44;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(40, 40, 40);
  doc.text('ROUGH ESTIMATE', pageWidth / 2, y, { align: 'center' });

  // Ref and Date centered
  y += 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(120, 120, 120);
  doc.text(`Ref: ${project.re_project_id || '-'}`, pageWidth / 2, y, { align: 'center' });
  y += 5;
  doc.text(`Date: ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}`, pageWidth / 2, y, { align: 'center' });

  // ─── CLIENT INFORMATION (bordered box) ───
  y += 10;
  const clientBoxY = y;
  const boxPadding = 4;
  const fieldRowHeight = 7;

  // Section heading
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(40, 40, 40);
  doc.text('CLIENT INFORMATION', margin + boxPadding, y + boxPadding + 3);

  // Fields inside the box
  const clientFieldsY = y + boxPadding + 10;
  const halfWidth = contentWidth / 2;

  const drawLabelValue = (label, value, x, yy) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(120, 120, 120);
    doc.text(label, x, yy);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(40, 40, 40);
    const labelW = doc.getTextWidth(label);
    doc.text(String(value || '-'), x + labelW + 2, yy);
  };

  drawLabelValue('Name: ', project.client_name, margin + boxPadding, clientFieldsY);
  drawLabelValue('Phone: ', project.client_phone, margin + halfWidth, clientFieldsY);
  drawLabelValue('Email: ', project.client_email, margin + boxPadding, clientFieldsY + fieldRowHeight);
  drawLabelValue('Location: ', project.location, margin + halfWidth, clientFieldsY + fieldRowHeight);

  const clientBoxHeight = boxPadding + 10 + fieldRowHeight * 2 + boxPadding;
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, clientBoxY, contentWidth, clientBoxHeight, 1.5, 1.5, 'S');

  // ─── PROJECT DETAILS (bordered box) ───
  y = clientBoxY + clientBoxHeight + 6;
  const projectBoxY = y;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(40, 40, 40);
  doc.text('PROJECT DETAILS', margin + boxPadding, y + boxPadding + 3);

  const projectFieldsY = y + boxPadding + 10;
  drawLabelValue('Project Name: ', project.project_name, margin + boxPadding, projectFieldsY);
  drawLabelValue('Square Feet: ', project.sqft ? `${project.sqft} sqft` : '-', margin + halfWidth, projectFieldsY);
  drawLabelValue('Building Type: ', project.building_type || '-', margin + boxPadding, projectFieldsY + fieldRowHeight);
  drawLabelValue('Handover: ', project.handover_months ? `${project.handover_months} months` : '-', margin + halfWidth, projectFieldsY + fieldRowHeight);

  const projectBoxHeight = boxPadding + 10 + fieldRowHeight * 2 + boxPadding;
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, projectBoxY, contentWidth, projectBoxHeight, 1.5, 1.5, 'S');

  // ─── SCOPE OF WORKS ───
  y = projectBoxY + projectBoxHeight + 10;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(40, 40, 40);
  doc.text('SCOPE OF WORKS', margin, y);
  y += 5;

  const scopeItems = project.rough_scope_items || [];
  const total = project.estimated_total || scopeItems.reduce((sum, item) => sum + (item.total || 0), 0);

  if (scopeItems.length > 0) {
    const tableData = scopeItems.map((item, idx) => [
      idx + 1,
      item.description || item.name || '-',
      item.quantity || '-',
      item.unit || '-',
      formatPDFCurrency(item.rate || 0),
      formatPDFCurrency(item.total || 0)
    ]);

    autoTable(doc, {
      startY: y,
      head: [['S.No', 'Description', 'Qty', 'Unit', 'Rate', 'Amount']],
      body: tableData,
      theme: 'grid',
      headStyles: {
        fillColor: [55, 55, 55],
        textColor: [255, 255, 255],
        fontSize: 8,
        fontStyle: 'bold',
        cellPadding: 3,
        halign: 'center'
      },
      bodyStyles: {
        fontSize: 8,
        textColor: [50, 50, 50],
        cellPadding: 2.5
      },
      alternateRowStyles: {
        fillColor: [248, 248, 250]
      },
      columnStyles: {
        0: { cellWidth: 14, halign: 'center' },
        1: { cellWidth: 'auto' },
        2: { cellWidth: 16, halign: 'center' },
        3: { cellWidth: 16, halign: 'center' },
        4: { cellWidth: 34, halign: 'right' },
        5: { cellWidth: 38, halign: 'right' }
      },
      margin: { left: margin, right: margin },
      tableLineColor: [210, 210, 210],
      tableLineWidth: 0.2
    });

    y = doc.lastAutoTable.finalY + 8;
  } else {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.setTextColor(160, 160, 160);
    doc.text('No scope items added', margin + 4, y + 4);
    y += 14;
  }

  // ─── ESTIMATED TOTAL (purple box) ───
  const totalBoxWidth = 90;
  const totalBoxHeight = 34;
  const totalBoxX = pageWidth - margin - totalBoxWidth;
  const totalBoxY = y;

  // Purple background
  doc.setFillColor(128, 0, 190);
  doc.roundedRect(totalBoxX, totalBoxY, totalBoxWidth, totalBoxHeight, 3, 3, 'F');

  // Label
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  doc.text('ESTIMATED TOTAL', totalBoxX + totalBoxWidth / 2, totalBoxY + 10, { align: 'center' });

  // Amount
  doc.setFontSize(14);
  doc.text(formatPDFCurrency(total), totalBoxX + totalBoxWidth / 2, totalBoxY + 22, { align: 'center' });

  y = totalBoxY + totalBoxHeight + 10;

  // ─── PLANNING NOTES ───
  if (project.planning_notes) {
    if (y > pageHeight - 50) { doc.addPage(); y = 20; }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(50, 50, 50);
    doc.text('Notes:', margin, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    const splitNotes = doc.splitTextToSize(project.planning_notes, contentWidth - 4);
    doc.text(splitNotes, margin + 2, y + 5);
    y += 5 + splitNotes.length * 4;
  }

  // ─── DISCLAIMER ───
  const disclaimerY = Math.max(y + 6, pageHeight - 38);
  if (disclaimerY < pageHeight - 20) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7);
    doc.setTextColor(140, 140, 140);
    doc.text(
      'This is a rough estimate and subject to change based on site conditions and final specifications.',
      pageWidth / 2, disclaimerY, { align: 'center' }
    );
  }

  // ─── FOOTER ───
  const footerY = pageHeight - 16;
  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.3);
  doc.line(margin, footerY - 4, pageWidth - margin, footerY - 4);

  // Left: Company name
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(60, 60, 60);
  doc.text('URBAN SPACE BUILDERS', margin, footerY);

  // Center: Terms
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(130, 130, 130);
  doc.text('Terms & Conditions | Privacy Policy', pageWidth / 2, footerY, { align: 'center' });

  // Right: GSTIN + timestamp
  doc.setFontSize(6.5);
  doc.text(COMPANY_INFO.gstin, pageWidth - margin, footerY - 2, { align: 'right' });
  const timestamp = new Date().toLocaleString('en-IN', { day: 'numeric', month: 'numeric', year: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', hour12: true });
  doc.text(`Generated on ${timestamp}`, pageWidth - margin, footerY + 3, { align: 'right' });

  // Save
  const fileName = `RE_${project.project_name || project.client_name}_${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(fileName);
  return fileName;
}
