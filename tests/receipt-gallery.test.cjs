const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function harness() {
  const states = [], refs = [];
  let stateIndex = 0, refIndex = 0;
  let images = ['https://example.com/old.jpg'];
  let failure = false;
  let downloads = 0, prints = 0;
  const exports = {};
  const dependencies = {
    react: {
      useState(initial) { const i = stateIndex++; if (!(i in states)) states[i] = initial;
        return [states[i], next => { states[i] = typeof next === 'function' ? next(states[i]) : next; }]; },
      useRef(initial) { const i = refIndex++; return refs[i] ||= { current: initial }; },
      useEffect() {}, useCallback(fn) { return fn; },
    },
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    'lucide-react': {}, '@/lib/supabase-client': { supabase: {} },
    '@/lib/storage': { uploadInvoiceImage: async () => 'https://example.com/new.jpg' },
    '@/lib/pos': {
      errorMessage: e => e.message,
      attachInvoiceImage: async (_, url) => { if (!images.includes(url)) images = [...images, url]; return images; },
      removeInvoiceImage: async (_, url) => { if (failure) throw new Error('Permission denied'); images = images.filter(image => image !== url); return images; },
    },
    '@/components/order/A4InvoiceTemplate': {}, '@/lib/invoice-pdf': { downloadInvoicePdf: async () => { downloads++; } },
    '@/components/ui/DataTable': {}, '@/components/order/OrderDetailsModal': { OrderDetailsModal: 'OrderDetailsModal' },
    '@/lib/utils': { formatDateTime: () => '', formatPKR: value => String(value) },
  };
  const code = ts.transpileModule(fs.readFileSync('src/app/dashboard/history/page.tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(code, { exports, require: name => dependencies[name],
    document: { title: 'History', fonts: { ready: Promise.resolve() }, getElementById: () => ({}) },
    window: { print: () => { prints++; } },
  });
  function render() { stateIndex = refIndex = 0; return exports.default(); }
  render();
  const order = { id: 'order', image_urls: images, total: 10, created_at: '', status: 'completed' };
  states[0] = [order]; states[3] = order;
  function find(node, predicate) {
    if (!node || typeof node !== 'object') return null;
    if (predicate(node)) return node;
    for (const child of [node.props?.children].flat(Infinity)) { const result = find(child, predicate); if (result) return result; }
    return null;
  }
  return {
    states,
    output: async download => {
      refs[1].current = { firstElementChild: {} };
      const modal = find(render(), node => node.type === 'OrderDetailsModal');
      assert.ok(modal);
      if (modal.props.invoiceReady && !modal.props.exporting) {
        (download ? modal.props.onDownload : modal.props.onPrint)();
      }
      await new Promise(setImmediate);
    },
    downloads: () => downloads, prints: () => prints,
    upload: async () => { find(render(), node => node.type === 'input' && node.props.type === 'file').props.onChange({ target: { files: [{}], value: 'file' } }); await new Promise(setImmediate); },
    remove: async () => { find(render(), node => node.props?.['aria-label'] === 'Remove receipt 1').props.onClick(); await new Promise(setImmediate); },
    failRemoval: () => { failure = true; },
  };
}

test('upload preserves existing receipts and retrying the same URL does not duplicate it', async () => {
  const modal = harness();
  await modal.upload();
  assert.deepEqual(Array.from(modal.states[3].image_urls), ['https://example.com/old.jpg', 'https://example.com/new.jpg']);
  await modal.upload();
  assert.equal(modal.states[3].image_urls.length, 2);
  assert.equal(modal.states[0][0].image_urls.length, 2);
});

test('removing one thumbnail preserves other receipts in the gallery and order list', async () => {
  const modal = harness();
  await modal.upload(); await modal.remove();
  assert.deepEqual(Array.from(modal.states[3].image_urls), ['https://example.com/new.jpg']);
  assert.equal(modal.states[0][0].image_urls.length, 1);
});

test('failed removal retains the gallery and displays the database error', async () => {
  const modal = harness(); modal.failRemoval(); await modal.remove();
  assert.equal(modal.states[3].image_urls.length, 1);
  assert.equal(modal.states[6], 'Permission denied');
});


test('invoice output waits for loaded items and supports PDF download and printing', async () => {
  const modal = harness();
  await modal.output(true);
  assert.equal(modal.downloads(), 0);
  modal.states[11] = true;
  await modal.output(true);
  await modal.output(false);
  assert.equal(modal.downloads(), 1);
  assert.equal(modal.prints(), 1);
});
