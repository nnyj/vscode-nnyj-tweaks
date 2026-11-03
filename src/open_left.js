const vscode = require('vscode');

const ORD = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth'];

function is_file_tab(tab) {
  return tab.input instanceof vscode.TabInputText || tab.input instanceof vscode.TabInputTextDiff;
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function start() {
  return vscode.window.tabGroups.onDidChangeTabs(async e => {
    const opened = e.opened.filter(is_file_tab);
    if (!opened.length) return;
    // tab open arrives before the group activation update, wait so activeTabGroup tells foreground from background opens
    await sleep(100);
    for (const tab of opened) {
      const group = tab.group;
      // fresh auto-created group holding just this file
      if (!vscode.window.tabGroups.all.includes(group) || group.tabs.length !== 1) continue;
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
