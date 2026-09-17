# NNYJ Tweaks

<div align="center">

[![Stars](https://img.shields.io/github/stars/nnyj/vscode-nnyj-tweaks?style=for-the-badge&labelColor=555&color=e3b341)](https://github.com/nnyj/vscode-nnyj-tweaks/stargazers)
[![Downloads](https://img.shields.io/github/downloads/nnyj/vscode-nnyj-tweaks/total?style=for-the-badge&labelColor=555&color=2ea44f)](https://github.com/nnyj/vscode-nnyj-tweaks/releases)
[![Latest Release](https://img.shields.io/github/v/release/nnyj/vscode-nnyj-tweaks?style=for-the-badge&label=Latest%20Release&labelColor=555&color=3572d6)](https://github.com/nnyj/vscode-nnyj-tweaks/releases/latest)
[![Build](https://img.shields.io/github/actions/workflow/status/nnyj/vscode-nnyj-tweaks/release.yml?style=for-the-badge&labelColor=555)](https://github.com/nnyj/vscode-nnyj-tweaks/actions)

</div>

Quality-of-life bundle for VS Code. Each feature toggles independently in the Settings UI and reacts live, no reload.

## Features

- Policy toggle: status bar item to grant timed allow overrides for AI CLI policy ask groups, reads group names from `policy.json`, writes `overrides.json` consumed by external policy guards
- Open left: when opening a file auto-splits a new editor group to the right of a locked webview group, moves the new group to the left so the webview stays rightmost
- Close empty: when the last tab in a locked group closes, unlocks and closes the group, VS Code otherwise leaves an empty locked canvas that `closeEmptyGroups` skips
- Line highlight: toggle a background highlight on selected lines, single color, tracks line moves during edits, in-session only (cleared on window reload)

## Usage

Policy toggle: click the `$(lock) policy` status bar item, pick a group (or all groups), pick a duration (`30m`, `2h`, custom `90m`/`6h`/`2d`). Active overrides show remaining time in the status bar and expire on their own.

Commands:

| Command | Description |
|---------|-------------|
| `Policy Toggle: Allow Group Temporarily` | Pick group and duration |
| `Policy Toggle: Clear All Overrides` | Remove every override |
| `Line Highlight: Toggle on Selected Lines` | Toggle highlight on selection |
| `Line Highlight: Clear All` | Remove all highlights |

Suggested keybinding:

```jsonc
{ "key": "alt+q", "command": "nnyjTweaks.lineHighlight.toggle", "when": "editorTextFocus" }
```

Open left and close empty run automatically, no commands.

## Settings

| Property | Default | Description |
|----------|---------|-------------|
| `nnyjTweaks.policyToggle.enabled` | `true` | Enable the policy status bar toggle |
| `nnyjTweaks.openLeft.enabled` | `true` | Enable locked-group placement fix |
| `nnyjTweaks.closeEmpty.enabled` | `true` | Enable locked empty group close |
| `nnyjTweaks.lineHighlight.enabled` | `true` | Enable line highlight commands |
| `nnyjTweaks.lineHighlight.color` | `#ffe60030` | Highlight background, hex with alpha |
| `nnyjTweaks.policyToggle.policyPath` | `C:/N/scripts/ai/policy/policy.json` | Source of ask group names |
| `nnyjTweaks.policyToggle.overridesPath` | `C:/N/scripts/ai/policy/overrides.json` | Overrides file read by the policy guards |
| `nnyjTweaks.policyToggle.durations` | `["30m", "1h", "2h", "4h", "8h"]` | Durations offered in the picker |

> [!NOTE]
> Policy toggle only writes the overrides file, enforcement happens in the external guard scripts that read it. Without those, the feature does nothing useful.

## How it works

Policy toggle watches the overrides directory (a directory watch, since guards delete and recreate the file, which kills file-level watches) and refreshes the status bar every 30s so expiry shows without an event. Overrides are written atomically via temp file rename; an empty override set deletes the file.

Open left listens to tab group changes. A newly opened single-file group whose left neighbor contains no file tabs is treated as an auto-split beside a locked webview, and gets moved one group left.

Close empty listens to tab close events. If the closed tab left its group with zero tabs and other groups exist, the group is focused, unlocked, then closed. A sole group is only unlocked, so the next editor reuses it instead of splitting beside it.

## Install

From the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=nnyj.nnyj-tweaks), or sideload a release vsix:

```sh
gh release download -R nnyj/vscode-nnyj-tweaks -p '*.vsix'
code --install-extension nnyj-tweaks-*.vsix
```

Or build locally:

```sh
npm run package
code --install-extension nnyj-tweaks-1.0.1.vsix
```

## License

[MIT](LICENSE)
