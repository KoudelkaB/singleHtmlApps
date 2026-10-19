'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { functions } = require('./helpers/html-app.cjs');
const file = 'OsmismerkaGenerator.html';
const algorithm = ['wordLength','hashString','mulberry32','randomInt','shuffle','createGrid','inBounds','inspectPlacement','findCandidates','applyPlacement','undoPlacement','countCovered','directionKey','directionCounts','directionBalanceScore','directionSpread','placeRequiredWords','optionalCandidates','finishWithBacktracking','placeOptionalWords','collectOpenCells','fillSecret','clonePuzzleGrid','buildPuzzle','collectSecret'];
test('normalization preserves Czech letters and complete Unicode code points while removing duplicate words', () => {
  const scope = functions(file,['toLetters','normalizeWord','parseWords','wordLength'],{locale:'cs-CZ'});
  assert.deepEqual(Array.from(scope.parseWords('čaj; ČAJ, káva\n𐐨𐐩')),['ČAJ','KÁVA','𐐀𐐁']);
  assert.equal(scope.wordLength('𐐀𐐁'),2);
});
test('placing, overlapping and undoing a word preserves earlier word cells and Unicode letters', () => {
  const scope = functions(file,algorithm,{performance:{now:()=>0}});
  const grid = scope.createGrid(3,3), dir = {dr:0,dc:1,label:'→'};
  const first = scope.applyPlacement(grid,{word:'ABC',row:0,col:0,...scope.inspectPlacement(grid,'ABC',0,0,dir)},'required');
  const second = scope.applyPlacement(grid,{word:'BD',row:0,col:1,...scope.inspectPlacement(grid,'BD',0,1,{dr:1,dc:0,label:'↓'})},'optional');
  scope.undoPlacement(grid,second);
  assert.equal(grid[0][1].letter,'B');
  assert.equal(grid[1][1].letter,'');
  scope.undoPlacement(grid,first);
  assert.equal(scope.countCovered(grid),0);
});
test('seeded generation keeps required words and the exact secret in reading order', () => {
  const scope = functions(file,algorithm,{performance:{now:()=>0},text:{}});
  const config={rows:3,cols:3,secretLetters:['Č','A','J'],required:['ABC','DEF'],optional:[],dirs:[{dr:0,dc:1,label:'→'}],attempts:3,seed:'fixed'};
  const a=scope.buildPuzzle(config), b=scope.buildPuzzle(config);
  assert.equal(JSON.stringify(a),JSON.stringify(b));
  assert.deepEqual(Array.from(scope.collectSecret(a.grid)),config.secretLetters);
  assert.deepEqual(Array.from(a.placements,item=>item.word).sort(),['ABC','DEF']);
  assert.equal(a.exact,true);
});
test('generation without Worker rejects asynchronously so the UI can clear its busy state', async () => {
  const scope = functions(file,['buildPuzzleOffThread'],{
    window:{}, buildPuzzle(){throw Error('Empty secret');}
  });
  let promise;
  assert.doesNotThrow(()=>{promise=scope.buildPuzzleOffThread({});});
  await assert.rejects(promise,/Empty secret/);
});
test('a failed Worker constructor releases its Blob URL before falling back', () => {
  const names=algorithm.filter(name=>!['collectSecret'].includes(name));
  let revoked='';
  const scope = functions(file,[...names,'makeGeneratorWorker'],{
    URL:{createObjectURL:()=> 'blob:worker',revokeObjectURL:url=>{revoked=url;}},
    Worker:class {constructor(){throw Error('Blocked');}}
  });
  assert.throws(()=>scope.makeGeneratorWorker(),/Blocked/);
  assert.equal(revoked,'blob:worker');
});
test('a second generation replaces the first and ignores an older result arriving later', async () => {
  const timers=[],jobs=[];
  const state={busy:false,generationId:0};
  const scope = functions(file,['runGenerate'],{
    state,els:{generate:{},rows:{},cols:{},attempts:{},workspace:{}},text:{},
    window:{setTimeout:callback=>{timers.push(callback);}},setStatus(){},readConfig:()=>({rows:6,cols:6,attempts:20}),
    captureSettings:()=>({}),generationSettingsKey:()=>'',buildPuzzleOffThread:()=>new Promise(resolve=>jobs.push(resolve)),
    renderPuzzle(){},updateStats(){},saveSettings(){},markGeneratedHistory(){},clearPrintSheet(){},clearBoardObserver(){},escapeHtml:String,
  });
  scope.runGenerate();timers.shift()();
  scope.runGenerate();
  assert.equal(timers.length,1,'The new request must not be dropped while busy');
  timers.shift()();
  jobs[1]({id:'new'});await new Promise(resolve=>setImmediate(resolve));
  jobs[0]({id:'old'});await new Promise(resolve=>setImmediate(resolve));
  assert.equal(state.puzzle.id,'new');
  assert.equal(state.busy,false);
});
test('cancelled workers and failed message dispatch release the worker and its Blob URL', async () => {
  for(const fail of [false,true]) {
    let terminated=0,revoked=0;
    const worker={objectUrl:'blob:worker',terminate(){terminated++;},postMessage(){if(fail)throw Error('Cannot clone');}};
    const state={};
    const scope=functions(file,['buildPuzzleOffThread'],{
      state,window:{Worker:true},makeGeneratorWorker:()=>worker,getBuildErrorMessages:()=>({}),
      URL:{revokeObjectURL(){revoked++;}},text:{},
    });
    const pending=scope.buildPuzzleOffThread({});
    if(!fail)state.cancelGeneration();
    await assert.rejects(pending,fail?/Cannot clone/:/cancelled/);
    assert.equal(terminated,1);
    assert.equal(revoked,1);
    assert.equal(state.cancelGeneration,null);
  }
});
