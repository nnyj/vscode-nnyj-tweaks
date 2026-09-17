const vscode = require('vscode');

const ORD = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth'];

// VS Code keeps locked groups open when their last tab closes, closeEmptyGroups skips them
function start() {
  return vscode.window.tabGroups.onDidChangeTabs(async e => {
    for (const tab of e.closed) {
      const col = tab.group.viewColumn;
      const group = vscode.window.tabGroups.all.find(g => g.viewColumn === col);
      if (!group || group.tabs.length !== 0) continue;
      const ord = ORD[col - 1];
      if (!ord) continue;
      await vscode.commands.executeCommand(`workbench.action.focus${ord}EditorGroup`);
      await vscode.commands.executeCommand('workbench.action.unlockEditorGroup');
      // sole group cannot be closed, unlocked it accepts the next editor instead of splitting
      if (vscode.window.tabGroups.all.length > 1) {
        await vscode.commands.executeCommand('workbench.action.closeEditorsAndGroup');
      }
    }
  });
}

module.exports = { start };
