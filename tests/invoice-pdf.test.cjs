const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

async function exportPdf(height) {
  const output = {};
  let pages = 1, filename;
  const imageHeights = [];
  const canvas = { width: 1587, height };
  const dependencies = {
    html2canvas: { default: async () => canvas },
    jspdf: { jsPDF: class {
      addPage() { pages++; }
      addImage(_, __, ___, ____, _____, height) { imageHeights.push(height); }
      save(name) { filename = name; }
    } },
  };
  const document = {
    fonts: { ready: Promise.resolve() },
    createElement: () => ({ getContext: () => ({ drawImage() {} }), toDataURL: () => 'data:image/png;base64,test' }),
  };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/invoice-pdf.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, { exports: output, document, require: name => dependencies[name] });
  await output.downloadInvoicePdf({ getBoundingClientRect: () => ({ width: 793.5, top: 0 }), querySelectorAll: () => [] }, 'order-123');
  return { pages, filename, imageHeights };
}

test('A4 canvas with a tiny pixel rounding remainder stays on one page', async () => {
  for (const height of [2244, 2245, 2246]) {
    const result = await exportPdf(height);
    assert.equal(result.pages, 1);
    assert.equal(result.filename, 'Invoice_order-123.pdf');
    assert.ok(result.imageHeights[0] <= 297);
  }
});

test('genuinely longer invoices retain their additional pages', async () => {
  assert.equal((await exportPdf(4000)).pages, 2);
});
