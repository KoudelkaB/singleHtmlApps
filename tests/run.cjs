'use strict';
const fs = require('node:fs');
const path = require('node:path');
// Load every suite in one process so the runner also works where child processes
// are restricted. node:test runs the registered tests and sets the exit status.
for (const file of fs.readdirSync(__dirname).filter(name => name.endsWith('.test.cjs')).sort()) {
  require(path.join(__dirname,file));
}
