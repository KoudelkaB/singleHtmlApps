'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { app, functions } = require('./helpers/html-app.cjs');
const file = 'Print File Tools/PJL_PCL6_Inspector.html';
const header = Array.from(new TextEncoder().encode(') HP-PCL XL;2;0\r\n'));
function parse(page, bytes) { page.scope.inputBytes = Uint8Array.from(bytes); return page.run('parseJob(inputBytes)'); }
function nodes(root) { return [root,...(root.children || []).flatMap(nodes)]; }
test('every truncated attribute identifier and embedded length becomes a warning instead of crashing', () => {
  const page = app(file);
  for (const suffix of [[0xf8],[0xf9],[0xf9,1],[0xfa],[0xfa,1],[0xfa,1,0],[0xfa,1,0,0],[0xfb]]) {
    const root = parse(page,header.concat(suffix));
    assert.ok(nodes(root).some(node => node.kind === 'warning'),suffix.join(','));
  }
});
test('truncated embedded payloads report both declared and available lengths', () => {
  const page = app(file);
  const root = parse(page,header.concat([0xfb,5,1,2]));
  const payload = nodes(root).find(node => node.dataType === 'embedded_data_byte_length');
  assert.ok(payload);
  assert.match(payload.valueDetail,/truncat|only|available/i);
  assert.equal(payload.valueStructured.dataLength,5);
  assert.equal(payload.valueStructured.availableLength,2);
});
test('opaque PCL payloads never get misread as PCL XL operators; multiple UEL jobs stay separate', () => {
  const page = app(file);
  const bytes = Array.from(new TextEncoder().encode('\x1B%-12345X@PJL ENTER LANGUAGE=PCL\r\nABC\x1B%-12345X'));
  const root = parse(page,bytes), all = nodes(root);
  assert.equal(all.filter(node => node.kind === 'uel').length,2);
  assert.equal(all.filter(node => node.kind === 'operator').length,0);
});
test('valid scalar, array and page tags still parse; arbitrary truncated streams always make progress', () => {
  const page = app(file);
  const valid = header.concat([0x41,0xc0,2,0xf8,3,0x43,0xc9,0xc0,2,65,0,66,0,0xf8,0xa8,0x44,0x42]);
  const all = nodes(parse(page,valid));
  assert.ok(all.some(node => node.attributeName === 'COLORSPACE' && node.valueStructured === 2));
  assert.ok(all.some(node => node.blockKey === 'PAGE'));
  for (let length=0; length<=valid.length; length++) assert.doesNotThrow(() => parse(page,valid.slice(0,length)));
  for (let tag=0; tag<256; tag++) assert.doesNotThrow(() => parse(page,header.concat([tag])));
});
test('read completion from an older file cannot replace the latest selected job', async () => {
  let finishA;
  const page = app(file);
  const load = functions(file,['loadFile'], {
    state:{loadVersion:0}, parseJob: bytes => ({name:bytes[0],children:[]}), annotateParents() {}, flattenNodes(root,result) {result.push(root);},
    treePanelBody:{classList:{add(){}}},fileInfo:{},treeHint:{},statNodes:{},statOperators:{},statPages:{},
    renderTree(){},renderDetails(){},getNodeById(){},
  });
  const first = load.loadFile({name:'first',arrayBuffer:() => new Promise(resolve => {finishA=resolve;})});
  await load.loadFile({name:'second',arrayBuffer:async () => Uint8Array.of(2).buffer});
  finishA(Uint8Array.of(1).buffer);
  await first;
  assert.equal(load.state.root.name,2);
  assert.match(load.fileInfo.textContent,/second/);
});
