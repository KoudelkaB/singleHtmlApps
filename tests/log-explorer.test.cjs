'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { functions } = require('./helpers/html-app.cjs');
const file = 'LogExplorer.html';
const parsers = ['parseDateTime','parseTimeSpan','formatTimeSpan','parseTypedValue'];
test('Czech dotted dates are day-month-year before the browser can guess US order', () => {
  const scope = functions(file,parsers);
  const date = new Date(scope.parseDateTime('1.2.2026 03:04:05'));
  assert.equal(date.getFullYear(),2026);
  assert.equal(date.getMonth(),1);
  assert.equal(date.getDate(),1);
  assert.equal(date.getHours(),3);
  assert.equal(scope.parseDateTime('2026-02-01T03:04:05Z'),Date.parse('2026-02-01T03:04:05Z'));
});
test('invalid calendar dates and times are not silently rolled into a different month', () => {
  const scope = functions(file,parsers);
  for (const text of ['31.2.2026','29.2.2025','1.13.2026','0.2.2026','1.2.2026 25:00','1.2.2026 12:60','1.2.2026 12:00:60']) assert.equal(scope.parseDateTime(text),null,text);
  assert.notEqual(scope.parseDateTime('29.2.2024'),null);
});
test('blank numeric sort fields stay invalid rather than becoming zero-valued block headers', () => {
  const scope = functions(file,parsers);
  assert.equal(scope.parseTypedValue('   ','number',false).ok,false);
  assert.equal(scope.parseTypedValue('0','number',false).comparable,0);
  assert.equal(scope.parseTypedValue('-1,25','number',false).comparable,-1.25);
});
test('time spans validate clock fields and finite numeric milliseconds', () => {
  const scope = functions(file,parsers);
  for (const text of ['01:60','01:02:60','1.24:00:00','Infinity','NaN','']) assert.equal(scope.parseTimeSpan(text),null,text);
  for (const ms of [0,1,-1,1234,90061001,-90061001,359999999]) assert.equal(scope.parseTimeSpan(scope.formatTimeSpan(ms)),ms,String(ms));
  assert.equal(scope.parseTimeSpan('30:00:00'),108000000);
  assert.equal(scope.parseTimeSpan('1.02:03:04.005'),93784005);
});
test('number sorting keeps continuation lines attached to their original blocks and source ids', () => {
  const names = ['cloneSourceCatalog','buildLineStage','materializeStageLines','getStageLineSourceIds','getStageLineRowIds','getStageSourceCatalog','extractSortSlice','parseTypedValue','parseDateTime','parseTimeSpan','buildGroupedBlocks','compareValues','appendLineRange','applySort'];
  const scope = functions(file,names);
  const stage = scope.buildLineStage(['2 first','  detail','1 second'], 'input','input', {lineSourceIds:[0,0,1],lineRowIds:[10,11,20],sourceCatalog:[{label:'a'},{label:'b'}]});
  const output = scope.applySort(stage,{mode:'column',pos:0,len:1,valueType:'number',order:'asc'},'sort');
  assert.deepEqual(Array.from(output.lines),['1 second','2 first','  detail']);
  assert.deepEqual(Array.from(output.lineSourceIds),[1,0,0]);
  assert.deepEqual(Array.from(output.lineRowIds),[20,10,11]);
});
test('unreadable inputs do not discard readable files or change their ordering', async () => {
  const scope = functions(file,['readLoadInputs'],{
    readFileAsInput: async file => { if (file.bad) throw Error('Not readable'); return {name:file.name}; }
  });
  const result = await scope.readLoadInputs([{name:'a'},{name:'b',bad:true},{name:'c'}],['/a','/b','/c']);
  assert.deepEqual(Array.from(result.inputs,entry => entry && entry.name),['a',null,'c']);
  assert.match(result.unreadable[0],/\/b - Not readable/);
});
