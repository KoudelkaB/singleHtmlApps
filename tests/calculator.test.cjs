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
    '2 3', '1.2 1/2', '0.5½', '1234 567', '1.2.3', '1e', 'alert(1)', 'Infinity', 'NaN', '1,234.56', '1=2',
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
      const value = (quoted ?? unquoted ?? '').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
      element.setAttribute(name, value);
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

const numeric = (source, options) => {
  const value = math.evaluate(source, options);
  return Number(value.n) / Number(value.d);
};
const close = (actual, expected, tolerance = 1e-12) => assert.ok(Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)), actual + ' ≠ ' + expected);
const prog = (source, options) => math.evaluateProgrammer(source, options).n;

test('scientific exact arithmetic: right-associative powers, roots, factorials, rounding and logarithms', () => {
  const cases = {
    '2^3^2': '512', '-2^2': '-4', '(-2)^2': '4', '2^-3': '1/8', '2**3': '8',
    '3!^2': '36', '0!': '1', '5!': '120', 'fact(6)': '720', '(1/2)^-3': '8',
    'sqrt(81/16)': '9/4', 'sqrt(0)': '0', 'cbrt(-8/27)': '-2/3',
    'abs(-7/3)': '7/3', 'inv(3)': '1/3', 'floor(-3/2)': '-2', 'ceil(-3/2)': '-1',
    'round(-3/2)': '-2', 'round(3/2)': '2', 'trunc(-3/2)': '-1',
    'ln(1)': '0', 'log(1000)': '3', 'log10(0.01)': '-2', 'log2(1/8)': '-3',
    'sin(90)': '1', 'cos(180)': '-1', 'tan(180)': '0', 'exp(0)': '1',
    'sqrt(1e1000)': '1' + '0'.repeat(500),
  };
  for (const [source, expected] of Object.entries(cases)) {
    const value = math.evaluate(source);
    assert.equal(math.fraction(value), expected, source);
    assert.equal(!!value.approximate, false, 'Should stay exact: ' + source);
  }
});

test('scientific approximations, angle units, constants, domain checks and bounded work', () => {
  close(numeric('sin(30)'), .5);
  close(numeric('sin(pi/6)', { angle: 'rad' }), .5);
  close(numeric('asin(0.5)'), 30);
  close(numeric('acos(0)', { angle: 'rad' }), Math.PI / 2);
  close(numeric('atan(1)'), 45);
  close(numeric('tan(45)'), 1);
  close(numeric('ln(e)'), 1);
  close(numeric('log2(3)'), Math.log2(3));
  close(numeric('exp(2)'), Math.exp(2));
  close(numeric('sqrt(2)'), Math.sqrt(2));
  close(numeric('2^0.5'), Math.sqrt(2));
  close(numeric('cbrt(-2)'), Math.cbrt(-2));
  close(numeric('sinh(1)+cosh(1)'), Math.exp(1));
  close(numeric('tanh(1)'), Math.tanh(1));
  close(numeric('2pi'), 2 * Math.PI);
  close(numeric('√(4)'), 2);
  for (const source of ['pi', 'e', 'sqrt(2)', 'sin(30)', 'approx(1/3)', 'sqrt(2)*0']) {
    assert.equal(math.evaluate(source).approximate, true, source);
  }
  assert.equal(math.decimal(math.evaluate('sin(30)')).text, '0.5');
  for (const source of ['sqrt(-1)', 'ln(0)', 'log(-3)', 'asin(2)', 'acos(-2)', 'tan(90)',
    '(-2)^0.5', '(-1)!', '1.5!', '1001!', '10^10000', '2^10001',
    'exp(1000)', 'exp(-1000)', 'inv(0)', 'sin30', 'sin()', 'constructor(1)', '1e-999^0.5']) {
    assert.throws(() => math.evaluate(source), undefined, source);
  }
  assert.throws(() => math.evaluate('sin('.repeat(81) + '0' + ')'.repeat(81)));
  assert.throws(() => math.evaluate('2^'.repeat(81) + '1'));
  assert.throws(() => math.evaluate('tan(pi/2)', { angle: 'rad' }));
});

test('programmer bases, prefixes, integer arithmetic, aliases and precedence', () => {
  const cases = {
    'FF+1': 256n, '0b1010+0o7+0d3': 20n, '0xFF & 0x0F': 15n,
    '0xF0 OR 0x0F': 255n, '0xFF XOR 0x0F': 240n,
    'NOT 0': -1n, '~0xF0': -241n, '10/3': 5n, // unprefixed 10 is HEX 16
    '0d10/0d3': 3n, '-0d10/0d3': -3n, '-0d10 MOD 0d3': -1n,
    '0d1+0d2<<0d2': 12n, '0d1|0d2&0d4': 1n,
    '0d1 SHL 0d4': 16n, '-0d8 SHR 0d1': -4n, '0xFF_FF': 65535n,
    '(0d3+0d5)*0d2': 16n, 'FACE': 64206n,
  };
  for (const [source, expected] of Object.entries(cases)) assert.equal(prog(source, { base: 16 }), expected, source);
  assert.equal(prog('1010+1', { base: 2 }), 11n);
  assert.equal(prog('77', { base: 8 }), 63n);
  assert.equal(prog('255', { base: 10 }), 255n);
  assert.equal(prog('9007199254740993+1'), 9007199254740994n);
});

test('programmer word wrapping, signedness, division and logical/arithmetic shifts at every width', () => {
  for (const bits of [8, 16, 32, 64]) {
    const modulus = 1n << BigInt(bits), sign = modulus / 2n;
    assert.equal(prog(String(modulus - 1n), { bits, signed: false }), modulus - 1n);
    assert.equal(prog(String(modulus - 1n), { bits, signed: true }), -1n);
    assert.equal(prog(String(modulus - 1n) + '+1', { bits, signed: false }), 0n);
    assert.equal(prog(String(sign - 1n) + '+1', { bits, signed: true }), -sign);
    assert.equal(prog('-1>>1', { bits }), -1n);
    assert.equal(prog('-1>>>1', { bits }), sign - 1n);
    assert.equal(prog('1<<' + bits, { bits }), 0n);
    assert.equal(prog('-1>>' + bits, { bits }), -1n);
    assert.equal(prog('-1>>>' + bits, { bits }), 0n);
    assert.equal(prog(String(-sign) + '/-1', { bits }), -sign);
    assert.equal(prog('NOT 0', { bits, signed: false }), modulus - 1n);
  }
  for (const source of ['1/0', '1%0', '1<<-1', '1<<65', '1.5', 'sqrt(4)', '0xGG', '0b102',
    '0o8', '0dFF', '1__2', '_1', '1_', '1 2', '()', '(1', '1)', 'alert(1)', '1**2']) {
    assert.throws(() => prog(source), undefined, source);
  }
  assert.throws(() => prog('2', { base: 2 }));
  assert.throws(() => prog('8', { base: 8 }));
  assert.throws(() => prog('A', { base: 10 }));
  assert.throws(() => prog('1', { bits: 24 }));
});

test('base conversions round-trip without losing 64-bit precision or signed bit patterns', () => {
  for (const bits of [8, 16, 32, 64]) for (const signed of [true, false]) for (const n of [0n, 1n, -1n, (1n << BigInt(bits - 1)) - 1n, -(1n << BigInt(bits - 1))]) {
    const settings = { bits, signed };
    for (const base of [2, 8, 10, 16]) {
      const text = math.baseText(n, base, settings, true);
      assert.equal(prog(text, { ...settings, base: 16 }), math.word(n, settings), text);
    }
  }
  const source = 'FF AND (F OR 0d16)';
  const qualified = math.qualifyProgrammer(source, { base: 16 });
  assert.equal(prog(qualified, { base: 2 }), prog(source, { base: 16 }));
});

test('scientific UI wraps an operand or selection and puts the caret inside an empty function', async () => {
  const page = app();
  await page.click('mode', 'scientific');
  assert.equal(page.get('scientificTools').hidden, false);
  await page.click('function', 'sqrt');
  assert.equal(page.get('expression').value, 'sqrt()');
  assert.equal(page.get('expression').selectionStart, 5);
  await page.click('insert', '9'); await page.click('insert', ')'); await page.press('Enter');
  assert.equal(page.get('result').textContent, '3');
  await page.click('science', 'square'); await page.press('Enter');
  assert.equal(page.get('result').textContent, '9');
  await page.enter('2+9');
  page.get('expression').setSelectionRange(2, 3);
  await page.click('function', 'sqrt');
  assert.equal(page.get('expression').value, '2+sqrt(9)');
  assert.equal(page.get('result').textContent, '5');
  await page.enter('1');
  await page.click('science', 'reciprocal');
  assert.equal(page.get('result').textContent, '1');
  await page.click('science', 'tenPower');
  assert.equal(page.get('result').textContent, '10');
});

test('scientific approximate results never display or persist as exact fractions', async () => {
  const page = app();
  await page.click('mode', 'scientific'); await page.enter('sqrt(2)');
  assert.equal(page.get('approx').hidden, false);
  assert.equal(page.find('format', 'fraction').disabled, true);
  assert.doesNotMatch(page.get('equivalent').textContent, /Exact:/);
  await page.click('memory', 'store');
  await page.get('historyList').children[0].children[0].fire('click');
  assert.equal(page.get('approx').hidden, false);
  await page.click('insert', '*'); await page.type('2'); await page.press('Enter');
  assert.equal(page.get('approx').hidden, false);
  const restored = app({ storage: page.store.get('singleHtmlApps.calculator.v2') });
  assert.equal(restored.get('historyCount').textContent, '2');
  assert.match(restored.get('memoryNote').textContent, /≈/);
  await restored.click('memory', 'recall');
  assert.equal(restored.get('approx').hidden, false);
});

test('angle changes re-evaluate the preview and history restores the original angle context', async () => {
  const page = app();
  await page.click('mode', 'scientific'); await page.enter('sin(30)');
  assert.equal(page.get('result').textContent, '0.5');
  await page.click('angle', 'rad');
  assert.notEqual(page.get('result').textContent, '0.5');
  await page.get('historyList').children[0].children[1].fire('click');
  assert.equal(page.find('angle', 'deg').getAttribute('aria-pressed'), 'true');
  assert.equal(page.get('result').textContent, '0.5');
});

test('programmer UI bases preserve the expression value, settings undo, and math draft is separate', async () => {
  const page = app();
  await page.enter('1/2');
  await page.click('mode', 'programmer');
  assert.equal(page.get('expression').value, '');
  assert.equal(page.get('programmerTools').hidden, false);
  await page.enter('10+5');
  assert.equal(page.get('result').textContent, '15');
  await page.click('base', '16');
  assert.equal(page.get('result').textContent, '000000000000000F');
  assert.equal(page.get('expression').value, '0d10 + 0d5');
  await page.press('z', { ctrlKey: true });
  assert.equal(page.get('result').textContent, '15');
  assert.equal(page.find('base', '10').getAttribute('aria-pressed'), 'true');
  await page.click('mode', 'standard');
  assert.equal(page.get('expression').value, '1/2');
  assert.equal(page.get('result').textContent, '0.5');
  await page.click('mode', 'programmer');
  assert.equal(page.get('expression').value, '10+5');
});

test('programmer keypad, bit toggling, signed control and word selector use the same word settings', async () => {
  const page = app();
  await page.click('mode', 'programmer'); await page.click('base', '16');
  page.get('wordSize').value = '8'; await page.get('wordSize').fire('change');
  await page.click('hex', 'F'); await page.click('hex', 'F'); await page.press('Enter');
  assert.equal(page.get('result').textContent, 'FF');
  assert.equal(page.get('decReading').textContent, '-1');
  assert.equal(page.get('bitGrid').children.length, 8);
  await page.click('id', 'signedToggle');
  assert.equal(page.get('decReading').textContent, '255');
  await page.get('bitGrid').children[0].fire('click');
  assert.equal(page.get('result').textContent, '7F');
  assert.equal(page.get('decReading').textContent, '127');
  await page.click('program', 'not');
  assert.equal(page.get('result').textContent, '80');
  await page.click('base', '2');
  assert.equal(page.find('insert', '2').disabled, true);
  assert.equal(page.find('insert', '.').disabled, true);
  assert.equal(page.find('hex', 'A').disabled, true);
  assert.equal(page.get('result').textContent, '10000000');
});

test('memory and Ans preserve exact values and Ans is frozen when a calculation is saved', async () => {
  const page = app();
  await page.enter('1/3'); await page.click('memory', 'store');
  await page.enter('1/6'); await page.click('memory', 'add');
  await page.click('action', 'clear'); await page.click('memory', 'recall'); await page.press('Enter');
  assert.equal(page.get('result').textContent, '0.5');
  await page.enter('ans+1');
  assert.equal(page.get('result').textContent, '1.5');
  assert.doesNotMatch(page.get('expression').value, /ans/);
  await page.enter('100');
  await page.get('historyList').children[1].children[1].fire('click');
  assert.equal(page.get('result').textContent, '1.5');
  await page.click('memory', 'clear');
  assert.equal(page.find('memory', 'recall').disabled, true);
});

test('programmer history, persistence and clipboard preserve base, word size and signed interpretation', async () => {
  const copied = [];
  const page = app({ navigator: { clipboard: { writeText: async text => copied.push(text) } } });
  await page.click('mode', 'programmer'); await page.click('base', '16');
  page.get('wordSize').value = '8'; await page.get('wordSize').fire('change');
  await page.enter('FF'); await page.click('id', 'copyResult');
  assert.equal(copied.at(-1), '0xFF');
  await page.click('copyBase', '10');
  assert.equal(copied.at(-1), '-0d1');
  await page.click('id', 'signedToggle'); await page.enter('0d128');
  await page.get('historyList').children[1].children[1].fire('click');
  assert.equal(page.get('signedToggle').getAttribute('aria-pressed'), 'true');
  assert.equal(page.get('decReading').textContent, '-1');
  const restored = app({ storage: page.store.get('singleHtmlApps.calculator.v2') });
  assert.equal(restored.get('historyCount').textContent, '2');
  assert.equal(restored.get('wordSize').value, '8');
  await restored.get('historyList').children[0].children[0].fire('click');
  assert.equal(restored.get('decReading').textContent, '128');
  assert.equal(restored.get('signedToggle').getAttribute('aria-pressed'), 'false');
});

test('scientific and programmer expressions can be pasted and all four tabs support keyboard navigation', async () => {
  const page = app();
  await page.click('mode', 'scientific');
  await page.document.fire('paste', { clipboardData: { getData: () => 'sin(30)+log(100)' } });
  await page.press('Enter');
  assert.equal(page.get('result').textContent, '2.5');
  await page.get('scientificTab').fire('keydown', { key: 'ArrowRight' });
  assert.equal(page.get('programmerTab').getAttribute('aria-selected'), 'true');
  await page.document.fire('paste', { clipboardData: { getData: () => '0xFF AND 0b1111' } });
  await page.press('Enter');
  assert.equal(page.get('decReading').textContent, '15');
  await page.get('programmerTab').fire('keydown', { key: 'ArrowRight' });
  assert.equal(page.get('standardTab').getAttribute('aria-selected'), 'true');
});

test('a previous approximate answer does not prevent unrelated integer programmer calculations', async () => {
  const page = app();
  await page.enter('sqrt(2)');
  await page.click('mode', 'programmer'); await page.enter('42');
  assert.equal(page.get('result').textContent, '42');
});

test('1000! remains exact, persists, and can be reused without overflowing the editor', async () => {
  const result = math.evaluate('1000!');
  assert.equal(result.d, 1n);
  assert.equal(result.n.toString().length, 2568);
  assert.equal(result.n.toString().slice(0, 10), '4023872600');
  const page = app();
  await page.click('mode', 'scientific'); await page.enter('1000!');
  assert.notEqual(page.get('result').textContent, '—');
  assert.ok(page.get('historyList').children[0].children[0].children[1].textContent.length < 64);
  await page.click('insert', '*'); await page.type('2'); await page.press('Enter');
  assert.equal(page.get('expression').value, '(1000!)*2');
  const restored = app({ storage: page.store.get('singleHtmlApps.calculator.v2') });
  assert.equal(restored.get('historyCount').textContent, '2');
  await restored.get('historyList').children[0].children[0].fire('click');
  assert.notEqual(restored.get('result').textContent, '—');
});

test('programmer arithmetic properties hold for all widths without Number rounding', () => {
  let seed = 314159;
  const next = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return BigInt(seed); };
  for (const bits of [8, 16, 32, 64]) for (const signed of [true, false]) {
    const settings = { bits, signed };
    for (let index = 0; index < 30; index++) {
      const a = next() << 32n | next(), b = next() << 32n | next();
      const wa = math.word(a, settings), wb = math.word(b, settings);
      assert.equal(prog('0x' + a.toString(16) + '+0x' + b.toString(16), settings), math.word(wa + wb, settings));
      assert.equal(prog('0x' + a.toString(16) + '^0x' + b.toString(16), settings), math.word(wa ^ wb, settings));
      assert.equal(prog('0x' + a.toString(16) + '*0x' + b.toString(16), settings), math.word(wa * wb, settings));
    }
  }
});

test('every scientific function button inserts a valid expression and both programmer shift shortcuts work', async () => {
  const page = app();
  await page.click('mode', 'scientific');
  for (const node of page.document.nodes.filter(node => node.dataset.function)) {
    await page.enter('1');
    await page.click('function', node.dataset.function);
    await page.press('Enter');
    assert.notEqual(page.get('result').textContent, '—', node.dataset.function);
    assert.equal(page.get('expression').getAttribute('aria-invalid'), 'false', node.dataset.function);
  }
  await page.click('mode', 'programmer'); await page.enter('8');
  await page.click('program', 'left');
  assert.equal(page.get('result').textContent, '16');
  await page.click('program', 'right');
  assert.equal(page.get('result').textContent, '8');
});

test('memory rejects fractions in programmer mode without losing either draft', async () => {
  const page = app();
  await page.enter('1/3'); await page.click('memory', 'store');
  await page.click('mode', 'programmer');
  await page.click('memory', 'recall');
  assert.match(page.get('status').textContent, /exact integer/);
  assert.equal(page.get('expression').value, '');
  await page.click('mode', 'standard');
  assert.equal(page.get('expression').value, '1/3');
});

test('undoing history reuse restores the prior expression and its angle/base/mode context', async () => {
  const page = app();
  await page.click('mode', 'scientific'); await page.enter('sin(30)');
  await page.click('angle', 'rad');
  const radians = page.get('result').textContent;
  await page.get('historyList').children[0].children[1].fire('click');
  assert.equal(page.get('result').textContent, '0.5');
  await page.press('z', { ctrlKey: true });
  assert.equal(page.find('angle', 'rad').getAttribute('aria-pressed'), 'true');
  assert.equal(page.get('result').textContent, radians);
  await page.click('mode', 'programmer'); await page.enter('42');
  await page.click('mode', 'scientific');
  await page.get('historyList').children[0].children[1].fire('click');
  assert.equal(page.get('programmerTab').getAttribute('aria-selected'), 'true');
  await page.press('z', { ctrlKey: true });
  assert.equal(page.get('scientificTab').getAttribute('aria-selected'), 'true');
  assert.equal(page.get('expression').value, 'sin(30)');
});

test('a bit edit can be saved to history with Enter and repeated Enter does not duplicate it', async () => {
  const page = app();
  await page.click('mode', 'programmer'); await page.enter('0');
  await page.get('bitGrid').children.at(-1).fire('click');
  assert.equal(page.get('decReading').textContent, '1');
  await page.press('Enter');
  assert.equal(page.get('historyCount').textContent, '2');
  await page.press('Enter');
  assert.equal(page.get('historyCount').textContent, '2');
});
