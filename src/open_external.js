const vscode = require('vscode');
const path = require('node:path');

function start() {
  return vscode.window.tabGroups.onDidChangeTabs(async e => {
    const extensions = vscode.workspace.getConfiguration('nnyjTweaks.openExternal').get('extensions', ['.pdf']);
    for (const tab of e.opened) {
      // text tab for binary files, custom tab when a viewer extension claims the file
      const uri = tab.input?.uri;
      if (uri?.scheme !== 'file') continue;
      if (!extensions.includes(path.extname(uri.fsPath).toLowerCase())) continue;
      await vscode.env.openExternal(uri);
      await vscode.window.tabGroups.close(tab);
    }
  });
}

module.exports = { start };
