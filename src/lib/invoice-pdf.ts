/** Capture the same A4 layout used by browser printing, with additional pages for long orders. */
export async function downloadInvoicePdf(element: HTMLElement, orderId: string): Promise<void> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas'), import('jspdf'),
  ]);
  await document.fonts.ready;
  const canvas = await html2canvas(element, {
    scale: 2, backgroundColor: '#ffffff', useCORS: true,
    onclone(document) {
      const wrapper = document.querySelector<HTMLElement>('[data-invoice-export]');
      if (wrapper) {
        wrapper.style.left = '0';
        wrapper.style.position = 'fixed';
        wrapper.style.top = '0';
      }
      // Remove modal scroll clipping from the offscreen capture.
      let ancestor = wrapper?.parentElement;
      while (ancestor) {
        ancestor.style.overflow = 'visible';
        ancestor.style.maxHeight = 'none';
        ancestor = ancestor.parentElement;
      }
    },
  });
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pixelsPerMm = canvas.width / 210;
  const pageHeight = Math.round(297 * pixelsPerMm);
  const bounds = element.getBoundingClientRect();
  const scale = canvas.width / bounds.width;
  // Prefer breaks between rows, and keep the totals block together.
  const blocks = Array.from(element.querySelectorAll('tr, article > dl'))
    .map(block => {
      const rect = block.getBoundingClientRect();
      return { top: Math.floor((rect.top - bounds.top) * scale), bottom: Math.ceil((rect.bottom - bounds.top) * scale) };
    });
  let offset = 0;
  while (offset < canvas.height) {
    let end = Math.min(offset + pageHeight, canvas.height);
    // CSS millimetres and canvas pixels round independently. Absorb the tiny
    // remainder instead of exporting a second page containing only 1–2 pixels.
    if (canvas.height - end <= 2) end = canvas.height;
    const crossing = blocks.find(block => block.top < end && block.bottom > end && block.top > offset);
    if (crossing) end = crossing.top;
    const page = document.createElement('canvas');
    page.width = canvas.width;
    page.height = end - offset;
    const context = page.getContext('2d');
    if (!context) throw new Error('Could not create the invoice PDF.');
    context.drawImage(canvas, 0, offset, canvas.width, page.height, 0, 0, page.width, page.height);
    if (offset > 0) pdf.addPage();
    pdf.addImage(page.toDataURL('image/png'), 'PNG', 0, 0, 210, Math.min(297, page.height / pixelsPerMm));
    offset = end;
  }
  const filename = orderId.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 100) || 'invoice';
  pdf.save(`Invoice_${filename}.pdf`);
}
