'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
function readHtml(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function scripts(file) {
  return [...readHtml(file).matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter(match => !/\bsrc\s*=|\btype\s*=\s*["'](?:application\/|importmap)/i.test(match[1]))
    .map(match => match[2]);
}
function functionSource(file, name) {
  const source = scripts(file).join('\n');
  const pattern = new RegExp('^([ \\t]*)(?:async\\s+)?function\\s+' + name + '\\s*\\(', 'm');
  const start = pattern.exec(source);
  if (!start) throw Error('Function not found: ' + file + ':' + name);
  const closing = new RegExp('^' + start[1] + '\\}(?:;)?[ \\t]*$', 'm');
  const tail = source.slice(start.index + start[0].length);
  const end = closing.exec(tail);
  if (!end) throw Error('Function end not found: ' + name);
  return source.slice(start.index, start.index + start[0].length + end.index + end[0].length);
}
function context(globals = {}) {
  return vm.createContext({ TextEncoder, TextDecoder, URL, Blob, Set, Map, console, setTimeout, clearTimeout, ...globals });
}
function functions(file, names, globals = {}) {
  const scope = context(globals);
  const source = names.map(name => functionSource(file, name)).join('\n');
  vm.runInContext(source, scope, { filename: file });
  return scope;
}
class Element {
  constructor(tagName, document) {
    this.tagName = tagName.toUpperCase(); this.ownerDocument = document;
    this.listeners = {}; this.attributes = {}; this.children = []; this.value = '';
    this.textContent = ''; this.innerText = ''; this._html = ''; this.className = '';
    this.style = {}; this.dataset = {}; this.scrollTop = 0; this.clientHeight = 80;
    this.hidden = false; this.disabled = false; this.checked = false;
    this.classList = {
      add: (...names) => { this.className = [...new Set(this.className.split(/\s+/).concat(names))].filter(Boolean).join(' '); },
      remove: (...names) => { this.className = this.className.split(/\s+/).filter(name => !names.includes(name)).join(' '); },
      contains: name => this.className.split(/\s+/).includes(name),
      toggle: (name, on) => {
        if (on === undefined) on = !this.classList.contains(name);
        if (on) this.classList.add(name); else this.classList.remove(name);
        return on;
      }
    };
  }
  get innerHTML() { return this._html; }
  set innerHTML(value) { this._html = String(value); this.children = []; this.textContent = ''; }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === 'id') this.id = String(value);
    if (name === 'class') this.className = String(value);
    if (name === 'value') this.value = String(value);
    if (['checked','hidden','disabled'].includes(name)) this[name] = true;
    if (name.startsWith('data-')) this.dataset[name.slice(5)] = value;
  }
  getAttribute(name) { return this.attributes[name] ?? null; }
  addEventListener(name, handler) { (this.listeners[name] ||= []).push(handler); }
  async fire(name, properties = {}) {
    const event = { type: name, target: this, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {}, ...properties };
    for (const handler of this.listeners[name] || []) await handler(event);
    return event;
  }
  append(...nodes) {
    for (const node of nodes) {
      if (node.tagName === '#FRAGMENT') this.append(...node.children);
      else { node.parentNode = this; this.children.push(node); }
    }
  }
  appendChild(node) { this.append(node); return node; }
  prepend(node) { node.parentNode = this; this.children.unshift(node); }
  replaceChildren(...nodes) { this.children = []; this.textContent = ''; this._html = ''; this.append(...nodes); }
  remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(node => node !== this); }
  focus() { this.ownerDocument.activeElement = this; }
  select() { this.focus(); this.selectionStart = 0; this.selectionEnd = this.value.length; }
  setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; }
}
function documentFor(file) {
  const document = new Element('document', null);
  document.ownerDocument = document; document.body = new Element('body', document);
  document.activeElement = document.body; document.nodes = [];
  for (const [, tag, attrs] of readHtml(file).split('<script')[0].matchAll(/<([a-z][\w-]*)\b([^<>]*?)>/gi)) {
    const element = new Element(tag, document);
    for (const [, name, , quoted, unquoted] of attrs.matchAll(/([^\s=]+)(?:\s*=\s*(?:(["'])(.*?)\2|([^\s"'=<>]+)))?/g)) {
      const value = (quoted ?? unquoted ?? '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
      element.setAttribute(name, value);
    }
    document.nodes.push(element);
  }
  document.getElementById = id => document.nodes.find(element => element.id === id);
  document.createElement = tag => new Element(tag, document);
  document.createDocumentFragment = () => new Element('#fragment', document);
  document.createTextNode = text => ({ textContent: text });
  return document;
}
function app(file, globals = {}) {
  const document = documentFor(file);
  const scope = context({ document, navigator: {}, requestAnimationFrame: callback => callback(), window: {addEventListener(){}}, ...globals });
  for (const script of scripts(file)) vm.runInContext(script, scope, { filename: file });
  return { scope, document, get: id => document.getElementById(id), run: code => vm.runInContext(code, scope) };
}
module.exports = { root, readHtml, scripts, functionSource, context, functions, documentFor, app };
