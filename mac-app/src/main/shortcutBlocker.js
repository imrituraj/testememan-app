/**
 * TestMeMan macOS Assessment App - Shortcut & Navigation Guard
 * Best-effort interception of macOS window-management and reload shortcuts.
 * Acknowledges OS-level limitations and avoids indiscriminate clipboard clearing.
 */

const { globalShortcut } = require('electron');

class ShortcutBlocker {
  constructor(mainWindow) {
    this.mainWindow = mainWindow;
    this.isLocked = false;
    this.beforeInputHandler = null;
  }

  /**
   * Registers supported window and keyboard protections during the active assessment.
   */
  enableLockdown(onShortcutAttempted) {
    if (this.isLocked) return;
    this.isLocked = true;

    // Supported application-level shortcuts to intercept
    const interceptShortcuts = [
      'Command+R',
      'Command+Shift+R',
      'Command+W',
      'Command+Q',
      'Command+M',
      'Command+H',
      'F11',
      'F12',
      'Command+Option+I',
      'Command+Option+J',
      'Command+Option+C',
    ];

    interceptShortcuts.forEach((sc) => {
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
        // macOS reserves some global shortcuts; fail gracefully
      }
    });

    // In-window key event interception
    if (this.mainWindow && this.mainWindow.webContents) {
      this.beforeInputHandler = (event, input) => {
        const key = input.key ? input.key.toLowerCase() : '';

        const isCmdQ = input.meta && key === 'q';
        const isCmdW = input.meta && key === 'w';
        const isCmdH = input.meta && key === 'h';
        const isCmdM = input.meta && key === 'm';
        const isCmdR = input.meta && key === 'r';
        const isDevTools = input.meta && input.alt && (key === 'i' || key === 'j' || key === 'c');
        const isF12 = key === 'f12';
        const isF11 = key === 'f11';

        if (isCmdQ || isCmdW || isCmdH || isCmdM || isCmdR || isDevTools || isF12 || isF11) {
          event.preventDefault();
          if (typeof onShortcutAttempted === 'function') {
            onShortcutAttempted(`${input.meta ? 'Cmd+' : ''}${key.toUpperCase()}`);
          }
        }
      };

      this.mainWindow.webContents.on('before-input-event', this.beforeInputHandler);
    }
  }

  /**
   * Releases registered global shortcuts when the exam ends or on exit.
   */
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
