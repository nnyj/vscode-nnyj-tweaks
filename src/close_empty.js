const vscode = require('vscode');

// VS Code keeps locked groups open when their last tab closes, closeEmptyGroups skips them
function start() {
  return vscode.window.tabGroups.onDidChangeTabs(e => {
    const groups = new Set(e.closed.map(tab => tab.group));
    // wait for moves/drag-outs to finish, the group object is live, viewColumns are not stable
    setTimeout(async () => {
      for (const group of groups) {
        const live = vscode.window.tabGroups.all.find(g => g === group);
        if (!live || live.tabs.length !== 0) continue;
        if (vscode.window.tabGroups.all.length > 1) {
          await vscode.window.tabGroups.close(live, true);
        } else if (live.isActive) {
          // sole group cannot be closed, unlocked it accepts the next editor instead of splitting
          await vscode.commands.executeCommand('workbench.action.unlockEditorGroup');
        }
      }
    }, 150);
  });
}

module.exports = { start };
