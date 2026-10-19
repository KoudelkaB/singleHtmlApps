'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { app } = require('./helpers/html-app.cjs');
const basic='Pre-release Apps/Alpha/calc.html';
const gnome='Pre-release Apps/Alpha/GnomeCalculator.html';
const hex='Pre-release Apps/Beta/hexViewer_UpTo26MB.html';
test('legacy simple calculator handles equals and ignores F-keys, modifiers and invalid whole-key names', async () => {
  const page=app(basic);
  for(const key of ['2','+','3','='])await page.document.fire('keydown',{key});
  assert.equal(page.get('display').value,'5');
  for(const event of [{key:'F1'},{key:'F12'},{key:'c',ctrlKey:true},{key:'1',altKey:true}])await page.document.fire('keydown',event);
  assert.equal(page.get('display').value,'5');
  await page.document.fire('keydown',{key:'Backspace'});
  assert.equal(page.get('display').value,'');
});
test('legacy simple calculator recovers from non-finite results and starts fresh after equals', () => {
  const page=app(basic);
  page.scope.appendToDisplay('1/0');page.scope.calculate();
  assert.equal(page.get('display').value,'Error');
  page.scope.appendToDisplay('2+3');page.scope.calculate();
  assert.equal(page.get('display').value,'5');
  page.scope.appendToDisplay('7');
  assert.equal(page.get('display').value,'7');
});
test('Gnome calculator computes zero operands, retains history and starts a new number after a result', () => {
  const page=app(gnome);
  page.scope.appendNumber('5');page.scope.appendOperator('*');page.scope.appendNumber('0');page.scope.calculate();
  assert.equal(page.get('current-value').innerText,'0');
  assert.equal(page.get('history').children.length,1);
  page.scope.clearDisplay();
  page.scope.appendNumber('2');page.scope.appendOperator('+');page.scope.appendNumber('3');page.scope.calculate();
  page.scope.appendNumber('7');
  assert.equal(page.get('current-value').innerText,'7');
});
test('Gnome unary scientific functions keep pending operands and non-finite results become errors', () => {
  const page=app(gnome);
  page.scope.appendNumber('2');page.scope.appendOperator('+');page.scope.appendNumber('9');page.scope.appendFunction('sqrt');page.scope.calculate();
  assert.equal(page.get('current-value').innerText,'5');
  page.scope.clearDisplay();
  page.scope.appendNumber('1');page.scope.appendOperator('/');page.scope.appendNumber('0');page.scope.calculate();
  assert.equal(page.get('current-value').innerText,'Error');
  page.scope.appendNumber('4');
  assert.equal(page.get('current-value').innerText,'4');
});
test('Gnome keyboard modifiers and F-keys do not append invalid input; parentheses and percent work', async () => {
  const page=app(gnome);
  await page.document.fire('keydown',{key:'F1'});
  assert.equal(page.run('currentInput'),'0');
  for(const key of ['2','*','(','3','+','4',')','Enter'])await page.document.fire('keydown',{key});
  assert.equal(page.get('current-value').innerText,'14');
  page.scope.clearDisplay();
  page.scope.appendNumber('5');page.scope.appendNumber('0');page.scope.appendOperator('%');
  assert.equal(page.get('current-value').innerText,'0.5');
});
test('legacy hex viewer renders ASCII as text, including angle brackets and ampersands', async () => {
  const page=app(hex);
  await page.scope.readFile({name:'sample.bin',size:5,arrayBuffer:async()=>new TextEncoder().encode('<b>&!').buffer});
  const row=page.get('viewer-content').children[0];
  assert.equal(row.children.length,3);
  assert.equal(row.children[2].textContent,'<b>&!');
});
test('legacy hex viewer keeps the newest dropped file when reads finish out of order', async () => {
  const page=app(hex);let finish;
  const old=page.scope.readFile({name:'old',size:1,arrayBuffer:()=>new Promise(resolve=>{finish=resolve;})});
  await page.scope.readFile({name:'new',size:1,arrayBuffer:async()=>Uint8Array.of(2).buffer});
  finish(Uint8Array.of(1).buffer);await old;
  assert.equal(page.run('fileBytes[0]'),2);
  assert.equal(page.get('viewer-title').textContent,'new');
});
test('legacy hex read errors clear old bytes so scrolling cannot resurrect the previous file', async () => {
  const page=app(hex);
  await page.scope.readFile({name:'good',size:1,arrayBuffer:async()=>Uint8Array.of(1).buffer});
  await page.scope.readFile({name:'bad',size:1,arrayBuffer:async()=>{throw Error('Cannot read <file>');}});
  assert.equal(page.run('fileBytes'),null);
  page.scope.renderVisibleRows();
  assert.match(page.get('viewer-content').children[0].textContent,/Cannot read <file>/);
});
test('Gnome scientific functions apply to a closed group and preserve the left operand', async () => {
  const page=app(gnome);
  for(const key of ['2','+','(','9',')'])await page.document.fire('keydown',{key});
  page.scope.appendFunction('sqrt');page.scope.calculate();
  assert.equal(page.get('current-value').innerText,'5');
  page.scope.calculate();
  assert.equal(page.get('history').children.length,1);
});
test('Gnome percent applies to the last closed group rather than the whole sum', async () => {
  const page=app(gnome);
  for(const key of ['2','+','(','5','0',')','%','Enter'])await page.document.fire('keydown',{key});
  assert.equal(page.get('current-value').innerText,'2.5');
});
