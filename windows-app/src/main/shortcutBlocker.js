/**
 * TestMeMan Windows Assessment App - Shortcut & System Event Blocker
 * Best-effort interception of Windows window-switching, reload, and DevTools shortcuts.
 * Acknowledges OS-level boundaries and avoids indiscriminate clipboard clearing.
 */

const { globalShortcut } = require('electron');

class ShortcutBlocker {
  constructor(mainWindow) {
    this.mainWindow = mainWindow;
    this.isLocked = false;
    this.beforeInputHandler = null;
  }

  enableLockdown(onShortcutAttempted) {
    if (this.isLocked) return;
    this.isLocked = true;

    // Supported application-level shortcuts to intercept on Windows
    const dangerousShortcuts = [
      'Alt+F4',
      'CommandOrControl+W',
      'CommandOrControl+Q',
      'CommandOrControl+R',
      'F5',
      'CommandOrControl+Shift+R',
      'F11',
      'F12',
      'CommandOrControl+Shift+I',
      'CommandOrControl+Shift+C',
      'CommandOrControl+Shift+J',
    ];

    dangerousShortcuts.forEach((sc) => {
      try {
        globalShortcut.register(sc, () => {
          if (typeof onShortcutAttempted === 'function') {
            onShortcutAttempted(sc);
          }
          if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send('integrity:shortcut-blocked', {
              shortcut: sc,
              timestamp: new Date().toISOString(),
            });
          }
        });
      } catch (err) {
        // OS reserved shortcuts fallback
      }
    });

    if (this.mainWindow && this.mainWindow.webContents) {
      this.beforeInputHandler = (event, input) => {
        const key = input.key ? input.key.toLowerCase() : '';

        const isAltF4 = input.alt && key === 'f4';
        const isCtrlW = (input.control || input.meta) && key === 'w';
        const isCtrlR = (input.control || input.meta) && key === 'r';
        const isDevTools = (input.control || input.meta) && input.shift && (key === 'i' || key === 'j' || key === 'c');
        const isF12 = key === 'f12';
        const isF5 = key === 'f5';
        const isF11 = key === 'f11';

        if (isAltF4 || isCtrlW || isCtrlR || isDevTools || isF12 || isF5 || isF11) {
          event.preventDefault();
          if (typeof onShortcutAttempted === 'function') {
            onShortcutAttempted(`${input.control ? 'Ctrl+' : input.alt ? 'Alt+' : ''}${key.toUpperCase()}`);
          }
        }
      };

      this.mainWindow.webContents.on('before-input-event', this.beforeInputHandler);
    }
  }

  disableLockdown() {
    if (!this.isLocked) return;
    try {
      globalShortcut.unregisterAll();
    } catch (e) {}

    if (this.mainWindow && this.mainWindow.webContents && this.beforeInputHandler) {
      this.mainWindow.webContents.removeListener('before-input-event', this.beforeInputHandler);
      this.beforeInputHandler = null;
    }

    this.isLocked = false;
  }
}

module.exports = { ShortcutBlocker };
