/**
 * Automated Tests: Windows IntegrityLogger & Process Compliance
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { IntegrityLogger } = require('../src/main/integrityLogger');
const { FORBIDDEN_WINDOWS_APPS } = require('../src/main/processManager');

describe('Windows IntegrityLogger', () => {
  it('records structured, fact-based integrity events', () => {
    const logger = new IntegrityLogger('WIN-ATTEMPT-01');

    const evt1 = logger.logEvent('WINDOW_BLUR', 'WARNING', { detail: 'Window lost focus' });
    assert.strictEqual(evt1.eventType, 'WINDOW_BLUR');
    assert.strictEqual(evt1.severity, 'WARNING');
    assert.strictEqual(evt1.attemptId, 'WIN-ATTEMPT-01');
    assert.ok(evt1.id.startsWith('evt_'));

    const evt2 = logger.logEvent('PROCESS_DETECTED', 'VIOLATION', { appsDetected: ['discord.exe'] });
    assert.strictEqual(evt2.severity, 'VIOLATION');

    const summary = logger.getSummary();
    assert.strictEqual(summary.totalEvents, 2);
    assert.strictEqual(summary.violations, 1);
    assert.strictEqual(summary.warnings, 1);
  });
});

describe('Windows Process Compliance Catalog', () => {
  it('contains categorized Windows applications with valid executables', () => {
    assert.ok(FORBIDDEN_WINDOWS_APPS.length > 20);

    FORBIDDEN_WINDOWS_APPS.forEach((app) => {
      assert.ok(app.name, 'App must have a display name');
      assert.ok(app.exe, 'App must have an exe name');
      assert.ok(app.exe.endsWith('.exe'), 'Exe must end with .exe');
      assert.ok(app.category, 'App must have a category');
    });
  });
});
