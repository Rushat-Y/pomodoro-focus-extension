# Pomodoro Focus

A minimal cross-browser extension for the Pomodoro technique. No accounts, no tracking, works offline.

> **Firefox Users:** You can install this instantly from the [Firefox Add-ons Store](https://addons.mozilla.org/addon/pomodoro-focus-stats/).

- Adjustable work / break durations
- Task labels that carry over between sessions
- Stats dashboard with activity heatmap and session log
- Site blocker during focus sessions
- Toolbar badge shows minutes remaining

Built with plain HTML/CSS/JS. No heavy build step, no dependencies.

## Cross-Browser Architecture
This extension natively supports both Firefox and Chrome from a single codebase. The included `package.sh` script automatically generates two separate zips by swapping between Manifest V2 (Firefox) and Manifest V3 (Chrome). 

To make this work seamlessly across both browsers, we use a few specific approaches:
- **Resilient Timer**: Chrome puts background scripts to sleep, which freezes normal countdowns. We built a stateless timer that calculates exactly when it should end and schedules a system alarm to wake itself up.
- **Dynamic Site Blocker**: Chrome forbids classic Javascript network blocking. The extension dynamically injects `declarativeNetRequest` JSON rules in Chrome, while using the `webRequest` API in Firefox.
- **Offscreen Audio**: Chrome MV3 blocks background scripts from playing sounds. When the timer ends, the extension checks the browser environment. If on Chrome, it silently spawns an invisible mini-document to synthesize the audio and then closes it. If on Firefox, it plays the audio natively.

## Installation from GitHub

If you want to manually install the extension from the source code:

### Chrome
1. Download the `pomodoro-focus-chrome.zip` from the Releases tab and extract it.
2. Go to `chrome://extensions/` in your browser.
3. Toggle on **Developer mode** in the top right.
4. Click **Load unpacked** and select the extracted folder.

### Firefox
1. Download the `pomodoro-focus-firefox.zip` from the Releases tab and extract it.
2. Go to `about:debugging#/runtime/this-firefox` in your browser.
3. Click **Load Temporary Add-on...**
4. Select the `manifest.json` file inside the extracted folder.
