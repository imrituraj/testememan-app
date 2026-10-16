/**
 * Automated Tests: Windows AssessmentService
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { AssessmentService } = require('../src/main/assessmentService');

describe('Windows AssessmentService Client Integration', () => {
  it('validates required inputs before contacting backend', async () => {
    const service = new AssessmentService({ forceMock: true });

    await assert.rejects(
      async () => service.validateAssessment({ code: '', candidateId: '123', candidateName: 'Rahul' }),
      /Assessment Access Code is required/
    );

    await assert.rejects(
      async () => service.validateAssessment({ code: 'TCS-NQT-2026', candidateId: '', candidateName: 'Rahul' }),
      /Candidate ID \/ Roll Number is required/
    );

    await assert.rejects(
      async () => service.validateAssessment({ code: 'TCS-NQT-2026', candidateId: '123', candidateName: '' }),
      /Candidate Full Name is required/
    );
  });

  it('authenticates valid assessment code in development mock adapter', async () => {
    const service = new AssessmentService({ forceMock: true });
    const res = await service.validateAssessment({
      code: 'TCS-NQT-2026',
      candidateId: '22CS089',
      candidateName: 'Rahul Sharma',
    });

    assert.strictEqual(res.valid, true);
    assert.strictEqual(res.isMock, true);
    assert.strictEqual(res.assessment.code, 'TCS-NQT-2026');
    assert.strictEqual(res.candidate.name, 'Rahul Sharma');
    assert.ok(res.assessment.sections.length > 0);
  });

  it('starts attempt and computes duration and expiration', async () => {
    const service = new AssessmentService({ forceMock: true });
    const attempt = await service.startAttempt({
      code: 'TCS-NQT-2026',
      candidateId: '22CS089',
      candidateName: 'Rahul Sharma',
    });

    assert.ok(attempt.attemptId.startsWith('TMM-TCS-NQT-2026'));
    assert.strictEqual(attempt.durationMinutes, 45);
    assert.ok(new Date(attempt.expiresAt).getTime() > new Date(attempt.startedAt).getTime());
    assert.strictEqual(attempt.sections.length, 3);
  });

  it('submits attempt and returns verified receipt data', async () => {
    const service = new AssessmentService({ forceMock: true });
    const submitRes = await service.submitAttempt({
      attemptId: 'WIN-TMM-01',
      code: 'TCS-NQT-2026',
      candidateId: '22CS089',
      candidateName: 'Rahul Sharma',
      answers: { num_q1: { selectedOptions: [0] } },
      timeTakenSeconds: 600,
      submitReason: 'CANDIDATE_MANUAL_SUBMIT',
      integritySummary: { violations: 0, warnings: 0, totalEvents: 0 },
      localScoreData: { totalScore: 10, maxScore: 14, percentScore: 71 },
    });

    assert.strictEqual(submitRes.success, true);
    assert.strictEqual(submitRes.isMock, true);
    assert.ok(submitRes.receiptId.startsWith('MOCK-RCPT-'));
    assert.strictEqual(submitRes.attemptId, 'WIN-TMM-01');
  });

  it('pings backend and computes latency and time sync', async () => {
    const service = new AssessmentService({ forceMock: true });
    const ping = await service.pingBackend();

    assert.strictEqual(ping.reachable, true);
    assert.strictEqual(ping.isMock, true);
    assert.ok(typeof ping.latencyMs === 'number');
    assert.ok(typeof ping.timeDeltaMs === 'number');
  });
});
