'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { functions, readHtml } = require('./helpers/html-app.cjs');
const file = 'ImageBrowser_chrome.html';
const quiet = {warn(){},error(){}};
function load(names, globals = {}) {
  if (readHtml(file).includes('function saveStoredValue(')) names = ['saveStoredValue',...names];
  return functions(file,names,{console:quiet,...globals});
}
test('blocked localStorage writes cannot stop filtering, settings or directory history', () => {
  let writes = 0;
  const scope = load(['saveHistory','saveSettings','saveSessionSnapshot'],{
    state:{history:[{id:'a',name:'A'}]}, MAX_HISTORY:10, HISTORY_STORAGE_KEY:'history',SETTINGS_STORAGE_KEY:'settings',SESSION_STORAGE_KEY:'session',
    localStorage:{setItem(){writes++;throw Error('Quota exceeded');}}
  });
  assert.doesNotThrow(() => scope.saveHistory());
  assert.doesNotThrow(() => scope.saveSettings());
  assert.doesNotThrow(() => scope.saveSessionSnapshot());
  assert.equal(writes,3);
});
test('opening a permitted directory still works when persisting its handle fails', async () => {
  let scans = 0;
  const handle = {kind:'directory',name:'Pictures'};
  const scope = load(['openDirectoryHandle'],{
    state:{history:[]}, verifyDirectoryPermission:async () => true,
    rememberDirectory:async () => {throw Error('IndexedDB blocked');},
    elements:{rescanButton:{}},saveSessionSnapshot(){},scanDirectory:async () => {scans++;}
  });
  await scope.openDirectoryHandle(handle,'picked');
  assert.equal(scope.state.currentHandle,handle);
  assert.equal(scans,1);
});
test('folder-picker support does not depend on optional drag/drop or IndexedDB persistence', () => {
  const scope = load(['isSupported'],{window:{showDirectoryPicker(){}}});
  assert.equal(scope.isSupported(),true);
  scope.window = {};
  assert.equal(scope.isSupported(),false);
});
test('reset invalidates active scans and metadata reads before clearing the old directory', async () => {
  let finish;
  const state = {scanToken:3,imageLoadToken:4,images:[],imageMap:new Map()};
  const scope = load(['loadImageEntryMetadata','resetCurrentDirectory'], {
    state, normalizePath:parts => parts.join('/'), elements:{rescanButton:{}}, revokeImageUrls(){},
    saveSessionSnapshot(){}, renderFolderTree(){},renderFolderNavigator(){},renderGallery(){}, updateStatus(){},
    scheduleGalleryRender(){},yieldToBrowser:async()=>{},closeLightbox(){},
  });
  const pending = scope.loadImageEntryMetadata({getFile:()=>new Promise(resolve=>{finish=resolve;})},[],'old.png',4,{count:0});
  scope.resetCurrentDirectory();
  finish({size:3,lastModified:0});
  await pending;
  assert.equal(state.scanToken,4);
  assert.equal(state.imageLoadToken,5);
  assert.equal(state.images.length,0);
});
test('an empty visible set prunes every queued preview and releases its loading state', () => {
  let released = 0;
  const promise = Promise.resolve(null);
  const image = {previewPromise:promise,previewLoading:true};
  const task = {relativePath:'a.png',promise,resolve(){released++;}};
  const state = {previewQueue:[task],previewQueueMap:new Map([['a.png',task]]),imageMap:new Map([['a.png',image]])};
  const scope = load(['prunePreviewQueue'],{state});
  scope.prunePreviewQueue(new Set());
  assert.equal(released,1);
  assert.equal(state.previewQueue.length,0);
  assert.equal(image.previewLoading,false);
  assert.equal(image.previewPromise,null);
});
test('one unreadable image cannot prevent later images in the same folder from loading', async () => {
  const calls = [];
  const handle = {async *entries(){yield ['bad.png',{kind:'file'}];yield ['good.jpg',{kind:'file'}];}};
  const state = {imageLoadToken:1,imageLoadErrors:0};
  const scope = load(['loadImagesForScope'],{
    state, IMAGE_EXTENSIONS:new Set(['png','jpg']),normalizePath:parts=>parts.join('/'),ensureFolderRecord(){},
    loadImageEntryMetadata:async (_handle,_parts,name) => {calls.push(name);if(name==='bad.png')throw Error('Removed file');}
  });
  await scope.loadImagesForScope(handle,[],false,1,{count:0});
  assert.deepEqual(calls,['bad.png','good.jpg']);
  assert.equal(state.imageLoadErrors,1);
});
test('sort and filter keep Unicode paths, zero-sized images and sort direction stable', () => {
  const state = {filterText:'Čaj JPG',sortKey:'bytes',sortDirection:'asc',images:[
    {relativePath:'Čaj/a.JPG',bytes:0},{relativePath:'Čaj/b.JPG',bytes:10},{relativePath:'else/c.jpg',bytes:1}
  ]};
  const scope = load(['splitFilterTokens','getFilteredImages','compareImages','getSortedVisibleImages'],{state});
  assert.deepEqual(Array.from(scope.getSortedVisibleImages(),image=>image.bytes),[0,10]);
  state.sortDirection='desc';
  assert.deepEqual(Array.from(scope.getSortedVisibleImages(),image=>image.bytes),[10,0]);
});
test('a slower directory-open request cannot overwrite a directory picked later', async () => {
  let finish;
  const scope=load(['openDirectoryHandle'],{
    state:{history:[]},elements:{rescanButton:{}},saveSessionSnapshot(){},scanDirectory:async()=>{},
    rememberDirectory:async()=>null,
    verifyDirectoryPermission: handle=>handle.name==='first' ? new Promise(resolve=>{finish=resolve;}) : Promise.resolve(true),
  });
  const first=scope.openDirectoryHandle({name:'first',kind:'directory'},'picked');
  await scope.openDirectoryHandle({name:'second',kind:'directory'},'picked');
  finish(true);await first;
  assert.equal(scope.state.currentDirectoryName,'second');
});
