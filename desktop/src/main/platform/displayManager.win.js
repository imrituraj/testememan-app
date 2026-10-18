/**
 * TestMeMan Windows Assessment App - Display Integrity Manager
 * Detects external monitors, secondary displays, HDMI connections, and screen extensions.
 * Provides clear compliance states and actionable remediation.
 */

const { screen } = require('electron');

class DisplayManager {
  constructor() {
    this.listenerBound = false;
    this.displayAddedHandler = null;
    this.displayRemovedHandler = null;
  }

  checkDisplayIntegrity() {
    const displays = screen.getAllDisplays();
    const isSingle = displays.length === 1;

    return {
      status: isSingle ? 'PASSED' : 'WARNING',
      isSingleDisplay: isSingle,
      displayCount: displays.length,
      details: displays.map((d, idx) => ({
        id: d.id,
        bounds: d.bounds,
        isPrimary: d.bounds.x === 0 && d.bounds.y === 0,
        label: `Display ${idx + 1} (${d.bounds.width}x${d.bounds.height})`,
      })),
      remediation: isSingle
        ? 'Single display configuration verified.'
        : `${displays.length} displays detected. Please disconnect secondary monitors, HDMI cables, or wireless displays before proceeding.`,
    };
  }

  watchDisplayChanges(onDisplayViolation) {
    if (this.listenerBound) return;

    this.displayAddedHandler = () => {
      const integrity = this.checkDisplayIntegrity();
      if (!integrity.isSingleDisplay && typeof onDisplayViolation === 'function') {
        onDisplayViolation({
          event: 'DISPLAY_ADDED',
          timestamp: new Date().toISOString(),
          displayCount: integrity.displayCount,
          details: integrity.details,
        });
      }
    };

    this.displayRemovedHandler = () => {
      const integrity = this.checkDisplayIntegrity();
      if (typeof onDisplayViolation === 'function') {
        onDisplayViolation({
          event: 'DISPLAY_REMOVED',
          timestamp: new Date().toISOString(),
          displayCount: integrity.displayCount,
          details: integrity.details,
        });
      }
    };

    screen.on('display-added', this.displayAddedHandler);
    screen.on('display-removed', this.displayRemovedHandler);
    this.listenerBound = true;
  }

  stopWatching() {
    if (this.listenerBound) {
      if (this.displayAddedHandler) screen.removeListener('display-added', this.displayAddedHandler);
      if (this.displayRemovedHandler) screen.removeListener('display-removed', this.displayRemovedHandler);
      this.listenerBound = false;
    }
  }
}

module.exports = { DisplayManager };
