/**
 * TestMeMan Windows Assessment App - Integrity Logger
 * Records factual, structured, timestamped integrity events.
 * Avoids accusatory language or false anti-cheat claims.
 */

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

class IntegrityLogger {
  constructor(attemptId = 'UNINITIALIZED') {
    this.attemptId = attemptId;
    this.events = [];
    this.logFilePath = null;
    this.initLogFile();
  }

  setAttemptId(attemptId) {
    this.attemptId = attemptId;
    this.initLogFile();
  }

  initLogFile() {
    try {
      const userDataDir = app ? app.getPath('userData') : process.cwd();
      const logsDir = path.join(userDataDir, 'integrity-logs');
      if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
      }
      const safeId = String(this.attemptId).replace(/[^a-zA-Z0-9_-]/g, '_');
      this.logFilePath = path.join(logsDir, `integrity-${safeId}.jsonl`);
    } catch (e) {
      this.logFilePath = null;
    }
  }

  /**
   * Records a structured integrity event.
   * @param {string} eventType - e.g. WINDOW_BLUR, DISPLAY_CHANGE, PROCESS_DETECTED
   * @param {string} severity - 'INFO' | 'WARNING' | 'VIOLATION'
   * @param {object} metadata - Factual context details
   * @returns {object} The recorded event object
   */
  logEvent(eventType, severity = 'INFO', metadata = {}) {
    const event = {
      id: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      eventType,
      severity: ['INFO', 'WARNING', 'VIOLATION'].includes(severity) ? severity : 'INFO',
      timestamp: new Date().toISOString(),
      attemptId: this.attemptId,
      metadata: metadata && typeof metadata === 'object' ? metadata : {},
    };

    this.events.push(event);

    // Append to local audit file
    if (this.logFilePath) {
      try {
        fs.appendFileSync(this.logFilePath, JSON.stringify(event) + '\n', 'utf8');
      } catch (err) {
        // Safe fail-open for file logging
      }
    }

    return event;
  }

  getEvents() {
    return [...this.events];
  }

  getSummary() {
    const violationCount = this.events.filter((e) => e.severity === 'VIOLATION').length;
    const warningCount = this.events.filter((e) => e.severity === 'WARNING').length;
    const infoCount = this.events.filter((e) => e.severity === 'INFO').length;

    const eventBreakdown = {};
    for (const evt of this.events) {
      eventBreakdown[evt.eventType] = (eventBreakdown[evt.eventType] || 0) + 1;
    }

    return {
      attemptId: this.attemptId,
      totalEvents: this.events.length,
      violations: violationCount,
      warnings: warningCount,
      informational: infoCount,
      breakdown: eventBreakdown,
      lastEventAt: this.events.length > 0 ? this.events[this.events.length - 1].timestamp : null,
    };
  }

  clear() {
    this.events = [];
  }
}

module.exports = { IntegrityLogger };
