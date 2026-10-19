'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { app } = require('./helpers/html-app.cjs');
const file = 'MouseButtonTest.html';
test('middle-button events are logged and cancel default browser actions; left button remains normal', async () => {
  const page=app(file);
  const middle=await page.get('testZone').fire('pointerdown',{button:1,buttons:4,pointerType:'mouse'});
  assert.equal(middle.defaultPrevented,true);
  assert.match(page.get('middleSeen').textContent,/yes/);
  assert.match(page.get('pointerSeen').textContent,/yes/);
  assert.match(page.get('logOutput').textContent,/button=1/);
  const left=await page.get('testZone').fire('mousedown',{button:0,buttons:1});
  assert.equal(left.defaultPrevented,undefined);
});
test('log stays bounded and Clear resets both status flags and keyboard focus', async () => {
  const page=app(file);
  for(let index=0;index<350;index++)await page.get('testZone').fire('mousedown',{button:1,buttons:4});
  assert.equal(page.get('logOutput').textContent.split('\n').length,300);
  await page.get('clearLogButton').fire('click');
  assert.equal(page.get('logOutput').textContent,'');
  assert.match(page.get('middleSeen').textContent,/no/);
  assert.equal(page.document.activeElement,page.get('testZone'));
});
test('Copy Log has a working fallback when the clipboard API is unavailable on a local file', async () => {
  const page=app(file);
  let copied='';
  page.document.execCommand=command=>{
    assert.equal(command,'copy');
    copied=page.document.activeElement.value;
    return true;
  };
  page.get('logOutput').textContent='pointerdown button=1';
  await page.get('copyLogButton').fire('click');
  assert.equal(copied,'pointerdown button=1');
  assert.match(page.get('lastEvent').textContent,/log copied/);
});
test('Copy Log reports failure instead of claiming success when both clipboard paths are blocked', async () => {
  const page=app(file,{navigator:{clipboard:{writeText:async()=>{throw Error('Denied');}}}});
  page.document.execCommand=()=>false;
  await page.get('copyLogButton').fire('click');
  assert.match(page.get('lastEvent').textContent,/failed|Ctrl\+C/);
});
