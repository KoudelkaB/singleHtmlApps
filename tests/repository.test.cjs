'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { root, readHtml, scripts } = require('./helpers/html-app.cjs');
function pages(directory = root) {
  return fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry => {
    if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'tests') return [];
    const file=path.join(directory,entry.name);
    return entry.isDirectory() ? pages(file) : /\.html?$/i.test(entry.name) ? [path.relative(root,file)] : [];
  });
}
for (const file of pages()) {
  test(file + ': inline scripts compile and static ids and local links resolve', () => {
    for (const source of scripts(file)) assert.doesNotThrow(() => new vm.Script(source,{filename:file}));
    const html=readHtml(file).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'');
    const ids=[...html.matchAll(/\bid\s*=\s*["']([^"']+)["']/g)].map(match=>match[1]);
    assert.equal(new Set(ids).size,ids.length,'Duplicate static ids');
    for (const [,ref] of html.matchAll(/\bhref\s*=\s*["']([^"']+)["']/g)) {
      if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(ref)) continue;
      const [route,fragment]=ref.split('#');
      const pathname=decodeURIComponent(route.split('?')[0]);
      const target=pathname ? path.resolve(root,path.dirname(file),pathname) : path.resolve(root,file);
      assert.ok(fs.existsSync(target),'Broken local link: '+ref);
      if (fragment) {
        const targetHtml=target===path.resolve(root,file) ? html : fs.readFileSync(target,'utf8');
        const targetIds=[...targetHtml.matchAll(/\bid\s*=\s*["']([^"']+)["']/g)].map(match=>match[1]);
        assert.ok(targetIds.includes(decodeURIComponent(fragment)),'Missing link fragment: '+ref);
      }
    }
  });
}
test('README app links reference existing files with the correct case', () => {
  const text=fs.readFileSync(path.join(root,'README.md'),'utf8');
  for(const [,route] of text.matchAll(/https:\/\/koudelkab\.github\.io\/singleHtmlApps\/([^)\s#]+)/g)) {
    assert.ok(fs.existsSync(path.join(root,decodeURIComponent(route))),'Missing README target: '+route);
  }
});
