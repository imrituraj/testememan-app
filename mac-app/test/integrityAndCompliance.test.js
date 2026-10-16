/**
 * Automated Tests: IntegrityLogger, Process Compliance & Display Integrity
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { IntegrityLogger } = require('../src/main/integrityLogger');
const { FORBIDDEN_MAC_APPS } = require('../src/main/processManager');
const { DisplayManager } = require('../src/main/displayManager');

describe('IntegrityLogger', () => {
  it('records structured, fact-based integrity events', () => {
    const logger = new IntegrityLogger('ATTEMPT-999');

    const evt1 = logger.logEvent('WINDOW_BLUR', 'WARNING', { detail: 'Window lost focus' });
    assert.strictEqual(evt1.eventType, 'WINDOW_BLUR');
    assert.strictEqual(evt1.severity, 'WARNING');
    assert.strictEqual(evt1.attemptId, 'ATTEMPT-999');
    assert.ok(evt1.id.startsWith('evt_'));
    assert.ok(evt1.timestamp);

    const evt2 = logger.logEvent('WINDOW_FOCUS', 'INFO', { detail: 'Window returned' });
    assert.strictEqual(evt2.eventType, 'WINDOW_FOCUS');
    assert.strictEqual(evt2.severity, 'INFO');

    const evt3 = logger.logEvent('PROCESS_DETECTED', 'VIOLATION', { appsDetected: ['Discord'] });
    assert.strictEqual(evt3.severity, 'VIOLATION');

    const summary = logger.getSummary();
    assert.strictEqual(summary.totalEvents, 3);
    assert.strictEqual(summary.violations, 1);
    assert.strictEqual(summary.warnings, 1);
    assert.strictEqual(summary.informational, 1);
    assert.strictEqual(summary.breakdown['WINDOW_BLUR'], 1);
    assert.strictEqual(summary.breakdown['WINDOW_FOCUS'], 1);
    assert.strictEqual(summary.breakdown['PROCESS_DETECTED'], 1);
  });

  it('handles invalid severity gracefully', () => {
    const logger = new IntegrityLogger('ATTEMPT-123');
    const evt = logger.logEvent('CUSTOM_EVENT', 'INVALID_SEVERITY', {});
    assert.strictEqual(evt.severity, 'INFO');
  });
});

describe('Process Compliance Catalog', () => {
  it('contains categorized applications with valid process names', () => {
    assert.ok(FORBIDDEN_MAC_APPS.length > 20);

    FORBIDDEN_MAC_APPS.forEach((app) => {
      assert.ok(app.name, 'App must have a display name');
      assert.ok(app.proc, 'App must have an executable / proc name');
      assert.ok(app.category, 'App must have a category');
      assert.ok(
        ['Browsers', 'Communication', 'Remote & Sharing', 'AI Tools', 'Notes & Editors', 'Screen Recorders'].includes(
          app.category
        ),
        `Unexpected category: ${app.category}`
      );
    });
  });
});
