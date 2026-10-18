'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'calculator.html'), 'utf8');
function script(id) {
  const match = html.match(new RegExp('<script id="' + id + '">([\\s\\S]*?)<\\/script>'));
  assert.ok(match, 'Missing script: ' + id);
  return match[1];
}
const engine = script('calculator-engine');
const context = vm.createContext({});
vm.runInContext(engine + '\nglobalThis.math = CalculatorMath;', context);
const math = context.math;
const exact = source => math.fraction(math.evaluate(source));

test('basic operations, zero, precedence and unary signs', () => {
  const cases = {
    '0': '0', '10+20': '30', '7-12': '-5', '8*0': '0', '8/2': '4',
    '2+3*4': '14', '(2+3)*4': '20', '2(3+4)': '14', '(2+3)(4-1)': '15',
    '(2)3': '6', '8/2*2': '8', '2--3': '5', '-(-3)': '3', '2*-3': '-6',
    '1/2+1/3': '5/6', '(1/2)/(3/4)': '2/3', '0.1+0.2': '3/10',
    '9007199254740993+1': '9007199254740994',
  };
  for (const [source, expected] of Object.entries(cases)) assert.equal(exact(source), expected, source);
});

test('mixed numbers, negative fractions, decimal comma, scientific notation and pasted typography', () => {
  const cases = {
    '1 1/2': '3/2', '-1 1/2': '-3/2', '-0 1/2': '-1/2', '-2 2/3 + 1/3': '-7/3',
    '1½ + ¼': '7/4', '1 ½': '3/2', '-2 ⅓': '-7/3', '½+⅓': '5/6', '½½': '1/4', '1,5 + 0,25': '7/4',
    '1\u00a0234,50+0,5': '1235', '1 234 567.89': '123456789/100',
    '1e-7 + 2E-7': '3/10000000', '1e+20/1e19': '10', '1.2e3': '1200',
    '2 × (3 − 1) ÷ 4 =': '1', '1⁄2+1/4': '3/4', '2x3': '6',
    '200*10%': '20', '200*(1+10%)': '220', '50%': '1/2',
  };
  for (const [source, expected] of Object.entries(cases)) assert.equal(exact(source), expected, source);
});

test('invalid and incomplete expressions fail explicitly, without executing code', () => {
  for (const source of ['', '.', '1/0', '0/0', '1/(2-2)', '1 0/0', '2+', '(2+3', '2+3)',
    '2 3', '1.2 1/2', '0.5½', '1234 567', '1.2.3', '1e', 'alert(1)', 'Infinity', 'NaN', '2**3', '1,234.56', '1=2',
    '1e1001', '1e-1001', '('.repeat(81) + '1' + ')'.repeat(81), '1'.repeat(1201)]) {
    assert.throws(() => math.evaluate(source), undefined, source.slice(0, 100));
  }
});

test('formatting preserves signs, whole numbers, large integers and exact fraction round trips', () => {
  for (const source of ['0', '4', '-1/2', '-7/3', '7/3', '1e-1000', '1e1000', '9007199254740993']) {
    const result = math.evaluate(source);
    assert.equal(exact(math.fraction(result)), math.fraction(result));
    assert.equal(exact(math.mixed(result)), math.fraction(result));
  }
  assert.equal(math.mixed(math.evaluate('-7/3')), '-2 1/3');
  assert.equal(math.mixed(math.evaluate('-1/2')), '-1/2');
  assert.equal(math.decimal(math.evaluate('0.1+0.2')).text, '0.3');
  assert.equal(math.decimal(math.evaluate('0.1+0.2')).approximate, false);
  assert.equal(math.decimal(math.evaluate('1/3')).text, '0.3333333333333333');
  assert.equal(math.decimal(math.evaluate('1/3')).approximate, true);
  assert.equal(math.decimal(math.evaluate('1e-7')).text, '1e-7');
  assert.equal(math.decimal(math.evaluate('1e1000')).text, '1e+1000');
  assert.equal(math.decimal(math.evaluate('99999999999999999/100000000000000000')).text, '1');
  assert.equal(math.decimal(math.evaluate('99999999999999999/100000000000000000')).approximate, true);
});

test('deterministic arithmetic properties across positive and negative rational numbers', () => {
  let seed = 123456;
  const random = limit => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % limit; };
  for (let i = 0; i < 250; i++) {
    const a = math.rational(BigInt(random(2001) - 1000), BigInt(random(99) + 1));
    const b = math.rational(BigInt(random(2001) - 1000), BigInt(random(99) + 1));
    const source = '(' + math.fraction(a) + ')+(' + math.fraction(b) + ')-(' + math.fraction(b) + ')';
    assert.equal(exact(source), math.fraction(a));
    if (b.n !== 0n) {
      const inverse = '(' + math.fraction(a) + ')*(' + math.fraction(b) + ')/(' + math.fraction(b) + ')';
      assert.equal(exact(inverse), math.fraction(a));
    }
  }
});

// A small DOM adapter exercises the real app script and event handlers in Node.
// These are interaction regression tests, not browser rendering/clipboard permission tests.
class Element {
  constructor(tagName, document) {
    this.tagName = tagName.toUpperCase(); this.ownerDocument = document;
    this.attributes = {}; this.dataset = {}; this.children = []; this.listeners = {};
    this.value = ''; this.selectionStart = 0; this.selectionEnd = 0; this.hidden = false;
    this.disabled = false; this.style = {}; this._text = ''; this._className = '';
    this.classList = {
      toggle: (name, force) => {
        const classes = new Set(this.className.split(/\s+/).filter(Boolean));
        const add = force === undefined ? !classes.has(name) : force;
        if (add) classes.add(name); else classes.delete(name);
        this.className = [...classes].join(' '); return add;
      },
      contains: name => this.className.split(/\s+/).includes(name),
    };
  }
  set className(value) { this._className = value; }
  get className() { return this._className; }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === 'class') this.className = value;
    if (name === 'id') this.id = value;
    if (name === 'hidden') this.hidden = true;
    if (name === 'disabled') this.disabled = true;
    if (name.startsWith('data-')) this.dataset[name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = value;
  }
  getAttribute(name) { return this.attributes[name] ?? null; }
  append(...children) { for (const child of children) { this.children.push(child); child.parentNode = this; } }
  replaceChildren(...children) { this._text = ''; this.children = []; this.append(...children); }
  remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(child => child !== this); }
  focus() { this.ownerDocument.activeElement = this; }
  setSelectionRange(start, end) { this.selectionStart = Math.min(this.value.length, start); this.selectionEnd = Math.min(this.value.length, end); }
  select() { this.focus(); this.setSelectionRange(0, this.value.length); }
  addEventListener(name, handler) { (this.listeners[name] ||= []).push(handler); }
  async fire(name, props = {}) {
    const event = { target: this, preventDefault() { this.defaultPrevented = true; }, ...props };
    for (const handler of this.listeners[name] || []) await handler(event);
    return event;
  }
}
function app(options = {}) {
  const document = new Element('document', null);
  document.ownerDocument = document;
  document.body = new Element('body', document);
  document.activeElement = document.body;
  document.nodes = [];
  const body = html.split('<body>')[1].split('<script')[0];
  for (const [, tag, attrs] of body.matchAll(/<([a-z][\w-]*)\b([^<>]*?)>/gi)) {
    const element = new Element(tag, document);
    for (const [, name, , quoted, unquoted] of attrs.matchAll(/([^\s=]+)(?:\s*=\s*(?:(["'])(.*?)\2|([^\s"'=<>]+)))?/g)) {
      element.setAttribute(name, quoted ?? unquoted ?? '');
    }
    document.nodes.push(element);
  }
  document.getElementById = id => document.nodes.find(element => element.id === id);
  document.querySelectorAll = selector => document.nodes.filter(element => {
    if (selector.startsWith('.')) return element.classList.contains(selector.slice(1));
    const attribute = selector.slice(1, -1);
    return element.getAttribute(attribute) !== null;
  });
  document.createElement = tag => new Element(tag, document);
  document.createTextNode = text => ({ textContent: text });
  document.execCommand = () => options.fallbackCopy !== false;
  document.createRange = () => ({ selectNodeContents() {} });
  const selection = { text: '', toString() { return this.text; }, removeAllRanges() { this.text = ''; }, addRange() { this.text = 'selected result'; } };
  const store = new Map(options.storage ? [['singleHtmlApps.calculator.v2', options.storage]] : []);
  const localStorage = {
    getItem(key) { if (options.storageFails) throw Error('Storage blocked'); return store.get(key) ?? null; },
    setItem(key, value) { if (options.storageFails) throw Error('Storage blocked'); store.set(key, value); },
  };
  const navigator = options.navigator || {};
  const scope = vm.createContext({ document, window: { getSelection: () => selection }, navigator, localStorage });
  vm.runInContext(engine + '\n' + script('calculator-app'), scope);
  const get = id => document.getElementById(id);
  const find = (name, value) => document.nodes.find(node => node.dataset[name] === value);
  const press = (key, props = {}) => document.fire('keydown', { key, target: document.activeElement, ...props });
  const click = async (name, value) => {
    const node = name === 'id' ? get(value) : find(name, value);
    assert.ok(node, name + '=' + value);
    if (node.disabled) return;
    node.focus();
    await node.fire('click');
  };
  const type = async text => {
    const input = get('expression'); input.focus();
    for (const character of text) {
      const keyEvent = await press(character);
      if (keyEvent.defaultPrevented) continue;
      const event = await input.fire('beforeinput', { inputType: 'insertText', data: character });
      if (event.defaultPrevented) continue;
      const start = input.selectionStart;
      input.value = input.value.slice(0, start) + character + input.value.slice(input.selectionEnd);
      input.setSelectionRange(start + 1, start + 1);
      await input.fire('input');
    }
  };
  const enter = async text => { await click('action', 'clear'); await type(text); await press('Enter'); };
  return { document, get, find, press, click, type, enter, store, selection, localStorage };
}

test('both keypads: all digits, zero, operators, quick fractions, sign, parentheses and backspace', async () => {
  const page = app();
  await page.click('insert', '1'); await page.click('insert', '0'); await page.click('insert', '+'); await page.click('insert', '2');
  await page.click('action', 'calculate');
  assert.equal(page.get('result').textContent, '12');
  await page.click('insert', '*'); await page.click('insert', '3'); await page.click('action', 'calculate');
  assert.equal(page.get('result').textContent, '36');
  await page.click('insert', '0');
  assert.equal(page.get('expression').value, '0');
  await page.click('action', 'clear'); await page.click('mode', 'fraction');
  await page.click('insert', '(1/2)'); await page.click('insert', '+'); await page.click('insert', '(1/4)');
  await page.click('action', 'calculate');
  assert.equal(page.get('result').getAttribute('aria-label'), '3/4');
  await page.click('action', 'calculate');
  assert.equal(page.get('historyCount').textContent, '3');
  await page.click('format', 'mixed'); await page.click('format', 'decimal'); await page.click('format', 'fraction');
  assert.equal(page.get('result').getAttribute('aria-label'), '3/4');
  assert.equal(page.get('historyCount').textContent, '3');
  await page.click('action', 'clear'); await page.click('insert', '3'); await page.click('action', 'fraction'); await page.click('insert', '4');
  await page.click('action', 'sign');
  assert.equal(page.get('expression').value, '3/-4');
  assert.equal(page.get('result').getAttribute('aria-label'), '-3/4');
  await page.click('action', 'sign');
  assert.equal(page.get('expression').value, '3/4');
  await page.click('action', 'backspace');
  assert.equal(page.get('expression').value, '3/');
});

test('native keyboard editing, decimal comma, numpad-style keys, result continuation and undo/redo', async () => {
  const page = app();
  await page.enter('0,1+0,2');
  assert.equal(page.get('result').textContent, '0.3');
  await page.type('*3'); await page.press('Enter');
  assert.equal(page.get('result').textContent, '0.9');
  await page.type('2');
  assert.equal(page.get('expression').value, '2');
  await page.press('z', { ctrlKey: true });
  assert.equal(page.get('result').textContent, '0.9');
  await page.press('z', { ctrlKey: true, shiftKey: true });
  assert.equal(page.get('expression').value, '2');
  await page.press('F9');
  assert.equal(page.get('result').textContent, '-2');
  await page.press('Escape');
  assert.equal(page.get('result').textContent, '0');
});

test('caret and selection survive keypad insertions; replacing selected text and deleting are precise', async () => {
  const page = app();
  await page.type('1234');
  page.get('expression').setSelectionRange(1, 3);
  await page.click('insert', '0');
  assert.equal(page.get('expression').value, '104');
  assert.equal(page.get('expression').selectionStart, 2);
  await page.click('action', 'backspace');
  assert.equal(page.get('expression').value, '14');
  page.get('expression').setSelectionRange(0, 2);
  await page.click('insert', '(1/2)');
  assert.equal(page.get('expression').value, '(1/2)');
  assert.equal(page.get('result').textContent, '0.5');
});

test('division errors stay visible and editable; new valid expressions recover immediately', async () => {
  const page = app();
  await page.enter('1/0');
  assert.match(page.get('status').textContent, /zero/);
  assert.equal(page.get('expression').value, '1/0');
  assert.equal(page.get('expression').getAttribute('aria-invalid'), 'true');
  assert.equal(page.get('copyResult').disabled, true);
  page.get('expression').setSelectionRange(2, 3);
  await page.type('2'); await page.press('Enter');
  assert.equal(page.get('result').textContent, '0.5');
  assert.equal(page.get('expression').getAttribute('aria-invalid'), 'false');
});

test('history restores exact results and expressions, persists safely, and tolerates denied/corrupt storage', async () => {
  const page = app();
  await page.enter('1/3');
  const item = page.get('historyList').children[0];
  await item.children[0].fire('click');
  await page.click('insert', '*'); await page.type('3'); await page.press('Enter');
  assert.equal(page.get('result').textContent, '1');
  await page.get('historyList').children[1].children[1].fire('click');
  assert.equal(page.get('expression').value, '1/3');
  await page.press('ArrowUp');
  assert.equal(page.get('expression').value, '(1/3)*3');
  await page.press('ArrowDown');
  assert.equal(page.get('expression').value, '1/3');
  const restored = app({ storage: page.store.get('singleHtmlApps.calculator.v2') });
  assert.equal(restored.get('historyCount').textContent, '2');
  for (const options of [{ storageFails: true }, { storage: '{bad' }, { storage: '{"history":[null,{"expression":"<script>","n":"1","d":"0"}]}' }]) {
    const instance = app(options);
    await instance.enter('2+2');
    assert.equal(instance.get('result').textContent, '4');
  }
});

test('copy uses active format, respects text selection and falls back when clipboard API fails', async () => {
  const copied = [];
  const page = app({ navigator: { clipboard: { writeText: async text => copied.push(text) } } });
  await page.enter('-7/3'); await page.click('format', 'mixed'); await page.click('id', 'copyResult');
  assert.equal(copied.at(-1), '-2 1/3');
  assert.match(page.get('status').textContent, /copied/);
  await page.click('format', 'fraction'); await page.click('id', 'copyResult');
  assert.equal(copied.at(-1), '-7/3');
  page.get('expression').focus(); page.get('expression').setSelectionRange(0, 2);
  assert.equal((await page.press('c', { ctrlKey: true })).defaultPrevented, undefined);
  const fallback = app({ navigator: { clipboard: { writeText: async () => { throw Error('Denied'); } } } });
  await fallback.enter('1/2'); await fallback.click('id', 'copyResult');
  assert.match(fallback.get('status').textContent, /copied/);
  const blocked = app({ fallbackCopy: false });
  await blocked.enter('-7/3'); await blocked.click('format', 'mixed'); await blocked.click('id', 'copyResult');
  assert.match(blocked.get('status').textContent, /blocked/);
  assert.equal(blocked.get('manualCopy').hidden, false);
  assert.equal(blocked.get('copyField').value, '-2 1/3');
  assert.equal(blocked.get('copyField').selectionEnd, 6);
  await blocked.get('copyField').fire('keydown', { key: 'Escape' });
  assert.equal(blocked.get('manualCopy').hidden, true);
});

test('a solved expression remains editable at the caret and in a selection', async () => {
  const page = app();
  await page.enter('12+3');
  page.get('expression').setSelectionRange(1, 1);
  await page.type('0');
  assert.equal(page.get('expression').value, '102+3');
  assert.equal(page.get('result').textContent, '105');
  await page.press('Enter');
  page.get('expression').setSelectionRange(0, 3);
  await page.click('insert', '4');
  assert.equal(page.get('expression').value, '4+3');
  assert.equal(page.get('result').textContent, '7');
});

test('copy feedback remains safe if the expression changes while permission is pending', async () => {
  let finish;
  const page = app({ navigator: { clipboard: { writeText: () => new Promise(resolve => { finish = resolve; }) } } });
  await page.enter('1/3');
  const pending = page.click('id', 'copyResult');
  await page.type('('); // Invalid preview: no rational value remains.
  finish();
  await pending;
  assert.match(page.get('status').textContent, /rounded/);
  assert.equal(page.get('expression').value, '(');
});

test('paste supports normalization, selection and denied permissions; rejects arbitrary text', async () => {
  const page = app({ navigator: { clipboard: { readText: async () => '−1½ + 0,25' } } });
  await page.click('id', 'pasteExpression'); await page.press('Enter');
  assert.equal(page.get('result').textContent, '-1.25');
  await page.document.fire('paste', { clipboardData: { getData: () => '1/4' } });
  assert.equal(page.get('expression').value, '1/4');
  page.get('expression').setSelectionRange(2, 3);
  await page.document.fire('paste', { clipboardData: { getData: () => '8' } });
  assert.equal(page.get('expression').value, '1/8');
  await page.document.fire('paste', { clipboardData: { getData: () => '<script>alert(1)</script>' } });
  assert.equal(page.get('expression').value, '1/8');
  assert.match(page.get('status').textContent, /arithmetic expression/);
  const denied = app();
  await denied.click('id', 'pasteExpression');
  assert.match(denied.get('status').textContent, /Ctrl\+V/);
});

test('async clipboard reads cannot overwrite edits made while permission is pending', async () => {
  let finish;
  const page = app({ navigator: { clipboard: { readText: () => new Promise(resolve => { finish = resolve; }) } } });
  const pending = page.click('id', 'pasteExpression');
  await page.type('42');
  finish('1+2');
  await pending;
  assert.equal(page.get('expression').value, '42');
  assert.match(page.get('status').textContent, /changed/);
});

test('tabs and result format controls have independent accessible state', async () => {
  const page = app();
  await page.type('1/2'); await page.press('Enter');
  await page.click('mode', 'fraction');
  assert.equal(page.get('fractionTools').hidden, false);
  assert.equal(page.get('fractionTab').getAttribute('aria-selected'), 'true');
  assert.equal(page.get('keypadPanel').getAttribute('aria-labelledby'), 'fractionTab');
  assert.equal(page.get('result').getAttribute('aria-label'), '1/2');
  await page.get('fractionTab').fire('keydown', { key: 'ArrowLeft' });
  assert.equal(page.get('fractionTools').hidden, true);
  assert.equal(page.get('historyCount').textContent, '1');
});

test('every numeric keypad key works in both modes, including decimals, zero and percent', async () => {
  const page = app();
  for (const mode of ['standard', 'fraction']) {
    await page.click('mode', mode);
    for (const digit of '0123456789') {
      await page.click('action', 'clear');
      await page.click('insert', digit);
      assert.equal(page.get('expression').value, digit);
      assert.equal(page.get('result').getAttribute('aria-label'), digit);
    }
    await page.click('action', 'clear');
    for (const key of ['(', '2', '+', '3', ')', '*', '.', '5']) await page.click('insert', key);
    await page.click('action', 'calculate');
    assert.equal(page.get('result').getAttribute('aria-label'), mode === 'standard' ? '2.5' : '5/2');
    await page.click('insert', '%');
    await page.click('action', 'calculate');
    assert.equal(page.get('result').getAttribute('aria-label'), mode === 'standard' ? '0.025' : '1/40');
  }
});

test('history is bounded, duplicate calculation is stable, and clearing works', async () => {
  const page = app();
  for (let index = 0; index < 33; index++) await page.enter(String(index));
  assert.equal(page.get('historyCount').textContent, '30');
  await page.press('Enter');
  assert.equal(page.get('historyCount').textContent, '30');
  await page.click('id', 'clearHistory');
  assert.equal(page.get('historyCount').textContent, '0');
  assert.equal(page.get('clearHistory').disabled, true);
  assert.equal(page.get('emptyHistory').hidden, false);
});

test('paste respects a caret inside a solved expression and Shift+arrows keep native selection behavior', async () => {
  const page = app();
  await page.enter('12+3');
  page.get('expression').setSelectionRange(1, 1);
  await page.document.fire('paste', { clipboardData: { getData: () => '0' } });
  assert.equal(page.get('expression').value, '102+3');
  const event = await page.press('ArrowUp', { shiftKey: true });
  assert.equal(event.defaultPrevented, undefined);
  assert.equal(page.get('expression').value, '102+3');
});
