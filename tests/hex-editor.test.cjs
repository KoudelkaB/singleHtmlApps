'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { functions, readHtml, documentFor } = require('./helpers/html-app.cjs');
const file = 'HexEditorAndComparer.html';
const defs = [{name:'Int8',size:1},{name:'Uint8',size:1},{name:'Int16',size:2},{name:'Uint16',size:2},{name:'Int32',size:4},{name:'Uint32',size:4},{name:'Float32',size:4},{name:'Float64',size:8}];
function load(names, globals = {}) {
  if (readHtml(file).includes('function parseInspectorNumber(')) names = ['parseInspectorNumber', ...names];
  return functions(file, names, { inspectorDefs: defs, alert() {}, ...globals });
}
test('hex parser rejects invalid characters rather than silently deleting or changing data', () => {
  const scope = load(['parseHex']);
  assert.deepEqual(Array.from(scope.parseHex('00 ff A1\n23')), [0,255,161,35]);
  assert.deepEqual(Array.from(scope.parseHex('')), []);
  for (const text of ['GG', '12ZZ34', '123', '0xFF', '<FF>']) assert.equal(scope.parseHex(text), null, text);
});
test('typed searches reject overflow, partial input, decimals in integer fields and float overflow', () => {
  const scope = load(['getNeedleFromQuery', 'parseHex', 'encodeUtf16le']);
  for (const [value, type] of [['256','Uint8-LE'],['-1','Uint8-LE'],['128','Int8-LE'],['65536','Uint16-LE'],['1.5','Int16-LE'],['12oops','Int32-LE'],['','Int32-LE'],['1e999','Float64-LE'],['1e39','Float32-LE']]) {
    assert.equal(scope.getNeedleFromQuery(value, type), null, value + ' ' + type);
  }
  assert.deepEqual(Array.from(scope.getNeedleFromQuery('65535','Uint16-BE')), [255,255]);
  assert.deepEqual(Array.from(scope.getNeedleFromQuery('-32768','Int16-LE')), [0,128]);
  assert.equal(new DataView(Uint8Array.from(scope.getNeedleFromQuery('1.5','Float32-LE')).buffer).getFloat32(0,true), 1.5);
});
test('invalid inspector input never writes wrapped bytes to the file', () => {
  let changes = 0;
  const scope = load(['handleInspectorEdit'], {
    fileData1: [17,34], selectionStart1:0, selectionEnd1:0, updateInspector() {}, fileDataChanged() { changes++; }
  });
  scope.handleInspectorEdit('Uint8',1,true,'300');
  assert.deepEqual(scope.fileData1, [17,34]);
  assert.equal(changes,0);
  scope.handleInspectorEdit('Uint8',1,true,'255');
  assert.deepEqual(scope.fileData1, [255,34]);
  assert.equal(changes,1);
});
test('large replacements do not overflow the JS argument stack; deletion leaves a valid selection', () => {
  const document = documentFor(file);
  const input = document.createElement('textarea'); input.setAttribute('id','selection-text-input'); document.nodes.push(input);
  const encoding = document.createElement('select'); encoding.setAttribute('id','selection-encoding-select'); encoding.value = 'UTF8'; document.nodes.push(encoding);
  const scope = load(['handleStringEdit', 'parseHex', 'encodeUtf16le'], {
    document, fileData1:[1,2,3], selectionStart1:1, selectionEnd1:1, fileDataChanged() {}
  });
  input.value = 'A'.repeat(200000);
  assert.doesNotThrow(() => scope.handleStringEdit());
  assert.equal(scope.fileData1.length,200002);
  assert.equal(scope.fileData1.at(-1),3);
  scope.fileData1 = [1,2,3]; scope.selectionStart1=1; scope.selectionEnd1=1;
  input.value='';
  scope.handleStringEdit();
  assert.deepEqual(Array.from(scope.fileData1),[1,3]);
  assert.equal(scope.selectionStart1,1);
  assert.equal(scope.selectionEnd1,1);
});
test('search finds overlapping hits and encodes UTF-16 surrogate pairs without truncation', () => {
  const scope = load(['findInFile','encodeUtf16le']);
  assert.deepEqual(Array.from(scope.findInFile([1,1,1],[1,1]).sortedHitOffsets), [0,1]);
  assert.deepEqual(Array.from(scope.encodeUtf16le('A😀')), [65,0,61,216,0,222]);
  assert.equal(scope.findInFile([1,2],[]).sortedHitOffsets.length,0);
});
test('explicit IEEE Infinity and NaN remain editable without accepting accidental overflow', () => {
  const scope = load(['getNeedleFromQuery','parseHex','encodeUtf16le']);
  const infinity = new DataView(Uint8Array.from(scope.getNeedleFromQuery('Infinity','Float64-LE')).buffer).getFloat64(0,true);
  const nan = new DataView(Uint8Array.from(scope.getNeedleFromQuery('NaN','Float32-LE')).buffer).getFloat32(0,true);
  assert.equal(infinity,Infinity);
  assert.ok(Number.isNaN(nan));
  assert.equal(scope.getNeedleFromQuery('1e400','Float64-LE'),null);
});
test('scientific notation that underflows a typed float is rejected, while explicit zero remains valid', () => {
  const scope=load(['getNeedleFromQuery','parseHex','encodeUtf16le']);
  assert.equal(scope.getNeedleFromQuery('1e-400','Float64-LE'),null);
  assert.equal(scope.getNeedleFromQuery('1e-50','Float32-LE'),null);
  assert.deepEqual(Array.from(scope.getNeedleFromQuery('0e-999','Float32-LE')),[0,0,0,0]);
});
