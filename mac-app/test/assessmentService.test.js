/**
 * Automated Tests: AssessmentService & Backend Abstraction
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { AssessmentService } = require('../src/main/assessmentService');

describe('AssessmentService Client Integration', () => {
  it('validates required inputs before contacting backend', async () => {
    const service = new AssessmentService({ forceMock: true });

    // Missing code
    await assert.rejects(
      async () => service.validateAssessment({ code: '', candidateId: '123', candidateName: 'Rahul' }),
      /Assessment Access Code is required/
    );

    // Missing candidate ID
    await assert.rejects(
      async () => service.validateAssessment({ code: 'TCS-NQT-2026', candidateId: '', candidateName: 'Rahul' }),
      /Candidate ID \/ Roll Number is required/
    );

    // Missing candidate Name
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

  it('saves answers and heartbeats reliably', async () => {
    const service = new AssessmentService({ forceMock: true });
    const res = await service.saveAnswers({
      attemptId: 'TMM-TEST-01',
      answers: { q1: { selectedOptions: [2] } },
      answersSummary: { answered: 1 },
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.isMock, true);
    assert.ok(res.savedAt);
  });

  it('submits attempt and returns verified receipt data', async () => {
    const service = new AssessmentService({ forceMock: true });
    const submitRes = await service.submitAttempt({
      attemptId: 'TMM-TEST-01',
      code: 'TCS-NQT-2026',
      candidateId: '22CS089',
      candidateName: 'Rahul Sharma',
      answers: { num_q1: { selectedOptions: [0] } },
      timeTakenSeconds: 600,
      submitReason: 'CANDIDATE_MANUAL_SUBMIT',
      integritySummary: { violations: 0, warnings: 1, totalEvents: 1 },
      localScoreData: { totalScore: 10, maxScore: 14, percentScore: 71 },
    });

    assert.strictEqual(submitRes.success, true);
    assert.strictEqual(submitRes.isMock, true);
    assert.ok(submitRes.receiptId.startsWith('MOCK-RCPT-'));
    assert.strictEqual(submitRes.attemptId, 'TMM-TEST-01');
    assert.strictEqual(submitRes.verifiedScore.totalScore, 10);
  });

  it('disallows forcing mock mode in production environment', () => {
    const prevEnv = process.env.TESTMEMAN_ENV;
    process.env.TESTMEMAN_ENV = 'production';

    const service = new AssessmentService();
    assert.throws(
      () => service.setForceMock(true),
      /Cannot enable mock mode in production environment/
    );

    process.env.TESTMEMAN_ENV = prevEnv || 'development';
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
