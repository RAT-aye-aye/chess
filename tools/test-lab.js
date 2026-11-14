/* Headless checks for the HTML Lab page. Run with:
   NODE_PATH=/tmp/opencode/domtest/node_modules node tools/test-lab.js */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const dir = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(dir, 'lab', 'index.html'), 'utf8');

let failures = 0;
function ok(name, cond, extra) {
  if (cond) console.log('PASS ' + name);
  else {
    failures++;
    console.log('FAIL ' + name + (extra !== undefined ? ' -> ' + JSON.stringify(extra) : ''));
  }
}

const vc = new VirtualConsole();
vc.on('jsdomError', () => {});

const dom = new JSDOM(html, {
  url: 'http://localhost/lab/',
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  virtualConsole: vc
});
const w = dom.window;
const doc = w.document;

const code = doc.getElementById('code');
const out = doc.getElementById('out');

ok('editor starts with an example', code.value.includes('<!DOCTYPE html>'), code.value.slice(0, 40));
ok('preview rendered on load', (out.getAttribute('srcdoc') || '').includes('Hello from the lab'));

code.value = '<h1 id="x">hi</h1>';
code.dispatchEvent(new w.Event('input', { bubbles: true }));
ok('input is saved locally', (w.localStorage.getItem('lab.code.v1') || '').includes('hi'));

doc.getElementById('run').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
ok('Run updates the preview', out.getAttribute('srcdoc') === '<h1 id="x">hi</h1>', out.getAttribute('srcdoc'));

const sel = doc.getElementById('examples');
sel.value = 'clock';
sel.dispatchEvent(new w.Event('change', { bubbles: true }));
ok('example loads', code.value.includes('setInterval'), code.value.slice(0, 30));

doc.getElementById('reset').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
ok('reset restores starter example', code.value.includes('Clicked 0 times'), code.value.slice(0, 30));

ok('sandboxed preview', out.getAttribute('sandbox') === 'allow-scripts allow-modals allow-forms');
ok('no external scripts on the page', doc.querySelectorAll('script[src]').length === 0);

console.log(failures === 0 ? '\nALL LAB TESTS PASSED' : '\n' + failures + ' LAB TEST(S) FAILED');
process.exit(failures ? 1 : 0);
