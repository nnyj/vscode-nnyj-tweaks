const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');
const { name, version } = require('../package.json');

const root_dir = path.resolve(__dirname, '..');
const vsix_name = `${name}-${version}.vsix`;

for (const file of fs.readdirSync(root_dir)) {
  if (file.startsWith(`${name}-`) && file.endsWith('.vsix') && file !== vsix_name) fs.rmSync(path.join(root_dir, file));
}
execSync('npm run package', { cwd: root_dir, stdio: 'inherit' });
execSync(`code --install-extension ${vsix_name} --force`, { cwd: root_dir, stdio: 'inherit' });
