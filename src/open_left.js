const vscode = require('vscode');

const ORD = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth'];

function is_file_tab(tab) {
  return tab.input instanceof vscode.TabInputText || tab.input instanceof vscode.TabInputTextDiff;
}

function start() {
  return vscode.window.tabGroups.onDidChangeTabs(async e => {
    for (const tab of e.opened) {
      const group = tab.group;
      // fresh auto-created group holding just this file
      if (!is_file_tab(tab) || group.tabs.length !== 1) continue;
      const left_neighbor = vscode.window.tabGroups.all.find(g => g.viewColumn === group.viewColumn - 1);
      // left neighbor with tabs but no file tabs = panel/chat group we want to stay right of us
      if (!left_neighbor || !left_neighbor.tabs.length || left_neighbor.tabs.some(is_file_tab)) continue;
      // background open while chat is active: move chat right, the moved group stays active so focus stays in chat
      if (vscode.window.tabGroups.activeTabGroup === left_neighbor) {
        await vscode.commands.executeCommand('workbench.action.moveActiveEditorGroupRight');
        continue;
      }
      const ord = ORD[group.viewColumn - 1];
      if (!ord) continue;
      await vscode.commands.executeCommand(`workbench.action.focus${ord}EditorGroup`);
      await vscode.commands.executeCommand('workbench.action.moveActiveEditorGroupLeft');
    }
  });
}

module.exports = { start };
