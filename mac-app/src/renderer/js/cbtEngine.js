/**
 * TestMeMan macOS Assessment App - CBT Exam Runner Engine
 * Comprehensive state machine, sectional navigation, question status tracking,
 * local storage persistence, and failure recovery.
 */

// Lifecycle states
const ASSESSMENT_STATE = {
  INITIALIZED: 'INITIALIZED',
  READY: 'READY',
  IN_PROGRESS: 'IN_PROGRESS',
  SUBMITTING: 'SUBMITTING',
  SUBMITTED: 'SUBMITTED',
  RECOVERY_REQUIRED: 'RECOVERY_REQUIRED',
};

class CBTEngine {
  constructor(examConfig, callbacks = {}, storageAdapter = null) {
    if (!examConfig || !Array.isArray(examConfig.sections) || examConfig.sections.length === 0) {
      throw new Error('Valid exam configuration with at least one section is required');
    }

    this.config = examConfig;
    this.attemptId = examConfig.attemptId || `ATTEMPT-${Date.now()}`;
    this.storageKey = `tmm_assessment_session_${this.attemptId}`;
    this.storage = storageAdapter || (typeof localStorage !== 'undefined' ? localStorage : null);

    // Callbacks
    this.onTimerTick = callbacks.onTimerTick || null;
    this.onTimeExpired = callbacks.onTimeExpired || null;
    this.onStateChange = callbacks.onStateChange || null;
    this.onAnswerSaved = callbacks.onAnswerSaved || null;

    // State machine
    this.state = ASSESSMENT_STATE.INITIALIZED;

    // Navigation
    this.currentSectionIdx = 0;
    this.currentQuestionIdx = 0;

    // Candidate Responses
    // questionId -> { selectedOptions: number[], numericValue?: number, answeredAt: string }
    this.answers = {};
    this.markedForReview = new Set();

    // Timing
    this.durationSeconds = (examConfig.durationMinutes || 45) * 60;
    this.secondsRemaining = this.durationSeconds;
    this.timerInterval = null;
    this.startTime = Date.now();
    this.submissionIdempotencyKey = null;

    // Attempt to recover previous session if available
    this.recoverIfAvailable();
  }

  setState(newState) {
    this.state = newState;
    if (typeof this.onStateChange === 'function') {
      this.onStateChange(newState);
    }
    this.persistLocalState();
  }

  startTimer() {
    if (this.state === ASSESSMENT_STATE.SUBMITTED || this.state === ASSESSMENT_STATE.SUBMITTING) {
      return;
    }

    this.setState(ASSESSMENT_STATE.IN_PROGRESS);

    if (this.timerInterval) clearInterval(this.timerInterval);

    this.timerInterval = setInterval(() => {
      this.secondsRemaining--;

      if (typeof this.onTimerTick === 'function') {
        this.onTimerTick(this.secondsRemaining);
      }

      // Persist elapsed time periodically (every 10s)
      if (this.secondsRemaining % 10 === 0) {
        this.persistLocalState();
      }

      if (this.secondsRemaining <= 0) {
        this.stopTimer();
        this.secondsRemaining = 0;
        if (typeof this.onTimeExpired === 'function') {
          this.onTimeExpired();
        }
      }
    }, 1000);
  }

  stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  getCurrentSection() {
    return this.config.sections[this.currentSectionIdx] || this.config.sections[0];
  }

  getCurrentQuestion() {
    const sec = this.getCurrentSection();
    return sec.questions[this.currentQuestionIdx] || sec.questions[0];
  }

  /**
   * Selects an option for single-choice or multi-choice questions.
   * @param {number} optionIdx
   */
  selectOption(optionIdx) {
    if (this.state !== ASSESSMENT_STATE.IN_PROGRESS) return;

    const q = this.getCurrentQuestion();
    if (!q) return;

    const isMulti = q.type === 'multi';

    if (isMulti) {
      const existing = this.answers[q.id]?.selectedOptions || [];
      let updated;
      if (existing.includes(optionIdx)) {
        updated = existing.filter((idx) => idx !== optionIdx);
      } else {
        updated = [...existing, optionIdx].sort();
      }

      if (updated.length > 0) {
        this.answers[q.id] = { selectedOptions: updated, answeredAt: new Date().toISOString() };
      } else {
        delete this.answers[q.id];
      }
    } else {
      // Single choice
      this.answers[q.id] = { selectedOptions: [optionIdx], answeredAt: new Date().toISOString() };
    }

    this.persistLocalState();
    if (typeof this.onAnswerSaved === 'function') {
      this.onAnswerSaved(q.id, this.answers[q.id]);
    }
  }

  clearResponse() {
    if (this.state !== ASSESSMENT_STATE.IN_PROGRESS) return;

    const q = this.getCurrentQuestion();
    if (q && this.answers[q.id]) {
      delete this.answers[q.id];
      this.persistLocalState();
      if (typeof this.onAnswerSaved === 'function') {
        this.onAnswerSaved(q.id, null);
      }
    }
  }

  toggleMarkForReview() {
    const q = this.getCurrentQuestion();
    if (!q) return;

    if (this.markedForReview.has(q.id)) {
      this.markedForReview.delete(q.id);
    } else {
      this.markedForReview.add(q.id);
    }
    this.persistLocalState();
  }

  nextQuestion() {
    const sec = this.getCurrentSection();
    if (this.currentQuestionIdx < sec.questions.length - 1) {
      this.currentQuestionIdx++;
      return true;
    } else if (this.currentSectionIdx < this.config.sections.length - 1) {
      this.currentSectionIdx++;
      this.currentQuestionIdx = 0;
      return true;
    }
    return false;
  }

  prevQuestion() {
    if (this.currentQuestionIdx > 0) {
      this.currentQuestionIdx--;
      return true;
    } else if (this.currentSectionIdx > 0) {
      this.currentSectionIdx--;
      const prevSec = this.getCurrentSection();
      this.currentQuestionIdx = prevSec.questions.length - 1;
      return true;
    }
    return false;
  }

  jumpTo(sectionIdx, questionIdx) {
    if (sectionIdx >= 0 && sectionIdx < this.config.sections.length) {
      this.currentSectionIdx = sectionIdx;
      const sec = this.getCurrentSection();
      if (questionIdx >= 0 && questionIdx < sec.questions.length) {
        this.currentQuestionIdx = questionIdx;
      }
    }
  }

  /**
   * Question status helper for UI palettes:
   * 'answered' | 'marked' | 'marked-answered' | 'unattempted' | 'current'
   */
  getQuestionStatus(sectionIdx, questionIdx) {
    const sec = this.config.sections[sectionIdx];
    if (!sec) return 'unattempted';
    const q = sec.questions[questionIdx];
    if (!q) return 'unattempted';

    const isCurrent = this.currentSectionIdx === sectionIdx && this.currentQuestionIdx === questionIdx;
    const isAnswered = this.answers[q.id] && this.answers[q.id].selectedOptions.length > 0;
    const isMarked = this.markedForReview.has(q.id);

    return {
      isCurrent,
      isAnswered,
      isMarked,
      statusClass: isMarked && isAnswered
        ? 'marked-answered'
        : isMarked
        ? 'marked'
        : isAnswered
        ? 'answered'
        : 'unattempted',
    };
  }

  /**
   * Summary breakdown for confirmation modals before submission.
   */
  getAttemptSummary() {
    let totalQuestions = 0;
    let answered = 0;
    let marked = 0;
    let markedAndAnswered = 0;

    const sectionsSummary = this.config.sections.map((sec) => {
      let secAnswered = 0;
      let secMarked = 0;

      sec.questions.forEach((q) => {
        totalQuestions++;
        const hasAnswer = this.answers[q.id] && this.answers[q.id].selectedOptions.length > 0;
        const isMarked = this.markedForReview.has(q.id);

        if (hasAnswer) {
          answered++;
          secAnswered++;
        }
        if (isMarked) {
          marked++;
          secMarked++;
        }
        if (hasAnswer && isMarked) {
          markedAndAnswered++;
        }
      });

      return {
        sectionName: sec.name,
        total: sec.questions.length,
        answered: secAnswered,
        unanswered: sec.questions.length - secAnswered,
        marked: secMarked,
      };
    });

    return {
      totalQuestions,
      answered,
      unanswered: totalQuestions - answered,
      marked,
      markedAndAnswered,
      sections: sectionsSummary,
    };
  }

  /**
   * Calculates score breakdown and marks.
   */
  calculateResult() {
    let totalQuestions = 0;
    let attempted = 0;
    let correct = 0;
    let totalScore = 0;
    let maxScore = 0;

    const sectionBreakdown = this.config.sections.map((sec) => {
      let secAttempted = 0;
      let secCorrect = 0;
      let secScore = 0;
      let secMax = 0;

      sec.questions.forEach((q) => {
        totalQuestions++;
        const marks = q.marks || 1;
        maxScore += marks;
        secMax += marks;

        const ans = this.answers[q.id];
        if (ans && ans.selectedOptions.length > 0) {
          attempted++;
          secAttempted++;

          // Check single choice or multi
          let isCorrect = false;
          if (q.type === 'multi') {
            const correctSet = Array.isArray(q.correct) ? q.correct : [q.correct];
            isCorrect =
              ans.selectedOptions.length === correctSet.length &&
              ans.selectedOptions.every((val) => correctSet.includes(val));
          } else {
            isCorrect = ans.selectedOptions[0] === q.correct;
          }

          if (isCorrect) {
            correct++;
            secCorrect++;
            secScore += marks;
            totalScore += marks;
          }
        }
      });

      return {
        sectionName: sec.name,
        total: sec.questions.length,
        attempted: secAttempted,
        correct: secCorrect,
        score: secScore,
        maxScore: secMax,
      };
    });

    const percent = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;
    const timeTaken = Math.max(0, Math.round((Date.now() - this.startTime) / 1000));

    return {
      totalQuestions,
      attempted,
      unattempted: totalQuestions - attempted,
      correct,
      incorrect: attempted - correct,
      totalScore,
      maxScore,
      percentScore: percent,
      timeTakenSeconds: timeTaken,
      passed: percent >= 45,
      sectionBreakdown,
    };
  }

  /**
   * Safe local persistence to survive renderer crashes or accidental window reload.
   */
  persistLocalState() {
    if (!this.storage) return;

    try {
      const payload = {
        attemptId: this.attemptId,
        state: this.state,
        secondsRemaining: this.secondsRemaining,
        currentSectionIdx: this.currentSectionIdx,
        currentQuestionIdx: this.currentQuestionIdx,
        answers: this.answers,
        markedForReview: Array.from(this.markedForReview),
        startTime: this.startTime,
        savedAt: new Date().toISOString(),
      };
      this.storage.setItem(this.storageKey, JSON.stringify(payload));
    } catch (e) {
      // Storage quota or error fallback
    }
  }

  /**
   * Restores state from local storage if available.
   */
  recoverIfAvailable() {
    if (!this.storage) return false;

    try {
      const raw = this.storage.getItem(this.storageKey);
      if (!raw) return false;

      const data = JSON.parse(raw);
      if (data && data.answers && typeof data.answers === 'object') {
        this.answers = data.answers;
        this.markedForReview = new Set(data.markedForReview || []);
        if (typeof data.secondsRemaining === 'number' && data.secondsRemaining > 0) {
          this.secondsRemaining = data.secondsRemaining;
        }
        if (typeof data.currentSectionIdx === 'number') {
          this.currentSectionIdx = data.currentSectionIdx;
        }
        if (typeof data.currentQuestionIdx === 'number') {
          this.currentQuestionIdx = data.currentQuestionIdx;
        }
        if (data.startTime) {
          this.startTime = data.startTime;
        }
        return true;
      }
    } catch (e) {
      // Clean fallback
    }
    return false;
  }

  /**
   * Cleans up local persistence on validated completion.
   */
  clearLocalStorage() {
    if (this.storage) {
      try {
        this.storage.removeItem(this.storageKey);
      } catch (e) {}
    }
  }
}

// Support both Node.js unit tests and browser global
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CBTEngine, ASSESSMENT_STATE };
} else {
  window.CBTEngine = CBTEngine;
  window.ASSESSMENT_STATE = ASSESSMENT_STATE;
}
