const fs = require('node:fs');
const path = require('node:path');
const { spawnSync: spawn_sync } = require('node:child_process');

for (const directory of ['src', 'scripts']) {
  for (const name of fs.readdirSync(directory).filter(name => name.endsWith('.js'))) {
    const result = spawn_sync(process.execPath, ['--check', path.join(directory, name)], { stdio: 'inherit' });
    if (result.status !== 0) process.exit(result.status || 1);
  }
}
console.log('JavaScript syntax checks passed.');
