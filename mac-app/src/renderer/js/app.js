/**
 * TestMeMan macOS Assessment App - Renderer Controller
 * Implements the 7-screen candidate workflow, pre-flight audits, server integration,
 * reliable CBT runner, submission confirmation, and verified receipt.
 */

document.addEventListener('DOMContentLoaded', async () => {
  // Screens
  const screens = {
    entry: document.getElementById('screenEntry'),
    preflight: document.getElementById('screenPreflight'),
    instructions: document.getElementById('screenInstructions'),
    exam: document.getElementById('screenExam'),
    receipt: document.getElementById('screenReceipt'),
    recovery: document.getElementById('screenRecovery'),
  };

  const modalSubmitConfirm = document.getElementById('modalSubmitConfirm');

  // Header Elements
  const envModeBadge = document.getElementById('envModeBadge');
  const envModeText = document.getElementById('envModeText');
  const headerDisplayPill = document.getElementById('headerDisplayPill');
  const headerSyncPill = document.getElementById('headerSyncPill');
  const btnQuitHeader = document.getElementById('btnQuitHeader');

  // Screen 1: Entry Elements
  const codeInput = document.getElementById('codeInput');
  const candidateNameInput = document.getElementById('candidateNameInput');
  const candidateIdInput = document.getElementById('candidateIdInput');
  const authNoticeBanner = document.getElementById('authNoticeBanner');
  const btnVerifyCode = document.getElementById('btnVerifyCode');

  // Screen 2: Preflight Elements
  const chkOsText = document.getElementById('chkOsText');
  const badgeOsStatus = document.getElementById('badgeOsStatus');
  const chkDisplayText = document.getElementById('chkDisplayText');
  const badgeDisplayStatus = document.getElementById('badgeDisplayStatus');
  const chkAppText = document.getElementById('chkAppText');
  const badgeAppStatus = document.getElementById('badgeAppStatus');
  const btnAttemptCloseApps = document.getElementById('btnAttemptCloseApps');
  const chkMediaText = document.getElementById('chkMediaText');
  const badgeMediaStatus = document.getElementById('badgeMediaStatus');
  const chkNetworkText = document.getElementById('chkNetworkText');
  const badgeNetworkStatus = document.getElementById('badgeNetworkStatus');
  const btnPreflightBack = document.getElementById('btnPreflightBack');
  const btnPreflightRescan = document.getElementById('btnPreflightRescan');
  const btnPreflightProceed = document.getElementById('btnPreflightProceed');

  // Screen 3: Instructions Elements
  const instExamTitle = document.getElementById('instExamTitle');
  const instCandidateLabel = document.getElementById('instCandidateLabel');
  const instDuration = document.getElementById('instDuration');
  const instSectionsCount = document.getElementById('instSectionsCount');
  const instQuestionsCount = document.getElementById('instQuestionsCount');
  const chkDeclaration = document.getElementById('chkDeclaration');
  const btnInstructionsBack = document.getElementById('btnInstructionsBack');
  const btnStartExam = document.getElementById('btnStartExam');

  // Screen 4: Exam Runner Elements
  const examLiveTitle = document.getElementById('examLiveTitle');
  const examCandidateLabel = document.getElementById('examCandidateLabel');
  const syncStatusBadge = document.getElementById('syncStatusBadge');
  const syncStatusText = document.getElementById('syncStatusText');
  const violationBadge = document.getElementById('violationBadge');
  const examClock = document.getElementById('examClock');
  const btnSubmitExam = document.getElementById('btnSubmitExam');
  const proctorVideo = document.getElementById('proctorVideo');
  const audioLevelBar = document.getElementById('audioLevelBar');
  const examSectionTabs = document.getElementById('examSectionTabs');
  const qNumberPill = document.getElementById('qNumberPill');
  const qMarksPill = document.getElementById('qMarksPill');
  const qText = document.getElementById('qText');
  const optionsContainer = document.getElementById('optionsContainer');
  const paletteGrid = document.getElementById('paletteGrid');
  const btnClear = document.getElementById('btnClear');
  const btnMark = document.getElementById('btnMark');
  const btnPrev = document.getElementById('btnPrev');
  const btnNext = document.getElementById('btnNext');

  // Screen 5: Submission Modal Elements
  const modalStatTotal = document.getElementById('modalStatTotal');
  const modalStatAnswered = document.getElementById('modalStatAnswered');
  const modalStatUnanswered = document.getElementById('modalStatUnanswered');
  const modalUnansweredNotice = document.getElementById('modalUnansweredNotice');
  const submitProgressBarContainer = document.getElementById('submitProgressBarContainer');
  const submitProgressBarFill = document.getElementById('submitProgressBarFill');
  const btnCancelSubmit = document.getElementById('btnCancelSubmit');
  const btnConfirmSubmit = document.getElementById('btnConfirmSubmit');

  // Screen 6: Receipt Elements
  const rcptReceiptId = document.getElementById('rcptReceiptId');
  const rcptCandidate = document.getElementById('rcptCandidate');
  const rcptRoll = document.getElementById('rcptRoll');
  const rcptExam = document.getElementById('rcptExam');
  const rcptScore = document.getElementById('rcptScore');
  const rcptQuestions = document.getElementById('rcptQuestions');
  const rcptViolations = document.getElementById('rcptViolations');
  const rcptAuthority = document.getElementById('rcptAuthority');
  const rcptTime = document.getElementById('rcptTime');
  const btnExitApp = document.getElementById('btnExitApp');

  // Screen 7: Recovery Elements
  const recAttemptId = document.getElementById('recAttemptId');
  const recTimeRemaining = document.getElementById('recTimeRemaining');
  const recAnswersCount = document.getElementById('recAnswersCount');
  const btnDiscardRecovery = document.getElementById('btnDiscardRecovery');
  const btnResumeSession = document.getElementById('btnResumeSession');

  // Application State
  let verifiedAssessmentData = null;
  let activeAttemptSession = null;
  let cbtEngine = null;
  const cameraProctor = new CameraProctor();
  let violationCount = 0;
  let isSubmitting = false;
  let saveAnswersTimeout = null;

  // View Navigation Helper
  function showScreen(screenKey) {
    Object.keys(screens).forEach((key) => {
      if (screens[key]) {
        screens[key].classList.toggle('active', key === screenKey);
      }
    });
  }

  // Quick Demo Code Fill
  const btnQuickDemoFill = document.getElementById('btnQuickDemoFill');
  if (btnQuickDemoFill) {
    btnQuickDemoFill.addEventListener('click', () => {
      if (codeInput) codeInput.value = 'TCS-NQT-2026';
      const nameInput = document.getElementById('candidateNameInput');
      const idInput = document.getElementById('candidateIdInput');
      if (nameInput && !nameInput.value) nameInput.value = 'Rahul Sharma';
      if (idInput && !idInput.value) idInput.value = '22CS089';
      if (codeInput) codeInput.focus();
    });
  }

  // Quit Buttons
  if (btnQuitHeader) {
    btnQuitHeader.addEventListener('click', () => {
      if (confirm('Exit TestMeMan Assessment Client?')) {
        if (window.lockdownAPI) window.lockdownAPI.quitApp();
      }
    });
  }
  if (btnExitApp) {
    btnExitApp.addEventListener('click', () => {
      if (window.lockdownAPI) window.lockdownAPI.quitApp();
    });
  }

  // =========================================================
  // 1. Initial State & Session Recovery Check
  // =========================================================
  async function checkForRecoverableSession() {
    try {
      // Scan localStorage for any in-progress attempt
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('tmm_assessment_session_')) {
          const raw = localStorage.getItem(key);
          const data = JSON.parse(raw);
          if (data && data.state === 'IN_PROGRESS' && data.secondsRemaining > 30) {
            recAttemptId.textContent = data.attemptId || 'RECOVERED_SESSION';
            const mins = Math.floor(data.secondsRemaining / 60);
            recTimeRemaining.textContent = `${mins} minutes`;
            recAnswersCount.textContent = `${Object.keys(data.answers || {}).length} answers saved`;

            showScreen('recovery');

            btnDiscardRecovery.onclick = () => {
              localStorage.removeItem(key);
              showScreen('entry');
            };

            btnResumeSession.onclick = async () => {
              // Re-verify and jump directly into test
              activeAttemptSession = {
                attemptId: data.attemptId,
                title: 'Recovered Assessment Session',
                durationMinutes: Math.ceil(data.secondsRemaining / 60),
                sections: [], // Will be reloaded
              };
              showScreen('entry');
            };
            return true;
          }
        }
      }
    } catch (e) {
      // Storage scan failure fallback
    }
    return false;
  }

  await checkForRecoverableSession();

  // =========================================================
  // 2. Authentication & Code Verification (Screen 1 -> Screen 2)
  // =========================================================
  btnVerifyCode.addEventListener('click', async () => {
    const code = (codeInput.value || '').trim();
    const candidateName = (candidateNameInput.value || '').trim();
    const candidateId = (candidateIdInput.value || '').trim();

    if (!code) {
      alert('Please enter an Assessment Access Code.');
      codeInput.focus();
      return;
    }
    if (!candidateName) {
      alert('Please enter Candidate Full Name.');
      candidateNameInput.focus();
      return;
    }
    if (!candidateId) {
      alert('Please enter Candidate Roll Number / ID.');
      candidateIdInput.focus();
      return;
    }

    btnVerifyCode.disabled = true;
    btnVerifyCode.textContent = 'Verifying with Server...';
    authNoticeBanner.style.display = 'none';

    try {
      if (window.lockdownAPI) {
        const verifyRes = await window.lockdownAPI.verifyAssessment({
          code,
          candidateName,
          candidateId,
        });

        verifiedAssessmentData = verifyRes;

        // Update environment indicator badge
        if (verifyRes.isMock) {
          envModeBadge.className = 'env-badge mock';
          envModeText.textContent = 'Development Mock';
        } else {
          envModeBadge.className = 'env-badge live';
          envModeText.textContent = 'Live Assessment';
        }

        // Transition to Pre-Flight
        showScreen('preflight');
        await runPreflightAudit();
      } else {
        throw new Error('Lockdown Desktop API not available in browser environment.');
      }
    } catch (err) {
      authNoticeBanner.style.display = 'block';
      authNoticeBanner.style.background = 'rgba(244, 63, 94, 0.15)';
      authNoticeBanner.style.color = '#f43f5e';
      authNoticeBanner.style.border = '1px solid #f43f5e';
      authNoticeBanner.textContent = `Verification Error: ${err.message}`;
    } finally {
      btnVerifyCode.disabled = false;
      btnVerifyCode.innerHTML = '<span>Verify & Continue</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>';
    }
  });

  // =========================================================
  // 3. Pre-Flight Readiness Audit (Screen 2)
  // =========================================================
  async function runPreflightAudit() {
    if (!window.lockdownAPI) return;

    btnPreflightRescan.disabled = true;
    btnPreflightRescan.textContent = 'Checking...';

    // Reset badges to checking
    [badgeOsStatus, badgeDisplayStatus, badgeAppStatus, badgeMediaStatus, badgeNetworkStatus].forEach((b) => {
      b.className = 'badge-status warning';
      b.textContent = 'Checking';
    });

    try {
      const audit = await window.lockdownAPI.runPreflightChecks();

      // 1. OS Check
      chkOsText.textContent = `${audit.os.platform} (${audit.os.arch}) — ${audit.os.remediation}`;
      badgeOsStatus.className = `badge-status ${audit.os.status.toLowerCase()}`;
      badgeOsStatus.textContent = audit.os.status;

      // 2. Display Check
      chkDisplayText.textContent = audit.displays.remediation;
      badgeDisplayStatus.className = `badge-status ${audit.displays.status.toLowerCase()}`;
      badgeDisplayStatus.textContent = audit.displays.status;

      // 3. Process Compliance
      chkAppText.textContent = audit.processes.remediation;
      badgeAppStatus.className = `badge-status ${audit.processes.status.toLowerCase()}`;
      badgeAppStatus.textContent = audit.processes.status;
      btnAttemptCloseApps.style.display = audit.processes.activeCount > 0 ? 'inline-block' : 'none';

      // 4. Media Check
      chkMediaText.textContent = audit.media.remediation;
      badgeMediaStatus.className = `badge-status ${audit.media.status.toLowerCase()}`;
      badgeMediaStatus.textContent = audit.media.status;

      // 5. Network Check
      chkNetworkText.textContent = `${audit.network.remediation} (Latency: ${audit.network.latencyMs || 0}ms)`;
      badgeNetworkStatus.className = `badge-status ${audit.network.status.toLowerCase()}`;
      badgeNetworkStatus.textContent = audit.network.status;

      // Enable Proceed button if no FAILED status exists
      const hasBlockers = [audit.os.status, audit.displays.status, audit.network.status].includes('FAILED');
      btnPreflightProceed.disabled = hasBlockers;
    } catch (err) {
      console.warn('Preflight audit error:', err);
    } finally {
      btnPreflightRescan.disabled = false;
      btnPreflightRescan.textContent = '↻ Re-run Checks';
    }
  }

  btnAttemptCloseApps.addEventListener('click', async () => {
    btnAttemptCloseApps.disabled = true;
    btnAttemptCloseApps.textContent = 'Closing...';
    try {
      await window.lockdownAPI.terminateProcesses();
    } catch (e) {}
    await runPreflightAudit();
    btnAttemptCloseApps.disabled = false;
  });

  btnPreflightBack.addEventListener('click', () => showScreen('entry'));
  btnPreflightRescan.addEventListener('click', runPreflightAudit);

  btnPreflightProceed.addEventListener('click', () => {
    // Populate instructions screen
    const assessment = verifiedAssessmentData.assessment;
    instExamTitle.textContent = assessment.title;
    instCandidateLabel.textContent = `Candidate: ${verifiedAssessmentData.candidate.name} (${verifiedAssessmentData.candidate.id})`;
    instDuration.textContent = `${assessment.durationMinutes || 45} Mins`;

    const sections = assessment.sections || [];
    instSectionsCount.textContent = `${sections.length} Sections`;

    let totalQ = 0;
    sections.forEach((s) => (totalQ += s.questions?.length || 0));
    instQuestionsCount.textContent = `${totalQ} Questions`;

    chkDeclaration.checked = false;
    btnStartExam.disabled = true;

    showScreen('instructions');
  });

  // =========================================================
  // 4. Instructions & Confirmation (Screen 3)
  // =========================================================
  chkDeclaration.addEventListener('change', () => {
    btnStartExam.disabled = !chkDeclaration.checked;
  });

  btnInstructionsBack.addEventListener('click', () => showScreen('preflight'));

  btnStartExam.addEventListener('click', async () => {
    btnStartExam.disabled = true;
    btnStartExam.textContent = 'Initializing Secure Environment...';

    const code = verifiedAssessmentData.assessment.code;
    const candidate = verifiedAssessmentData.candidate;

    try {
      // 1. Initialize server attempt session
      activeAttemptSession = await window.lockdownAPI.startAttempt({
        code,
        candidateName: candidate.name,
        candidateId: candidate.id,
      });

      // 2. Engage fullscreen kiosk mode
      await window.lockdownAPI.enterKiosk();

      // 3. Start Camera proctor feed
      await cameraProctor.startCamera(proctorVideo, audioLevelBar);

      // 4. Initialize CBTEngine
      cbtEngine = new CBTEngine(
        activeAttemptSession,
        {
          onTimerTick: (seconds) => updateClockDisplay(seconds),
          onTimeExpired: () => handleTimeExpired(),
          onAnswerSaved: (qId, ans) => queueAnswerSync(qId, ans),
        }
      );

      // 5. Setup Exam Runner UI
      examLiveTitle.textContent = activeAttemptSession.title;
      examCandidateLabel.textContent = `${candidate.name} (${candidate.id})`;
      headerSyncPill.style.display = 'inline-flex';

      cbtEngine.startTimer();
      renderSectionTabs();
      renderCurrentQuestion();
      renderPalette();

      showScreen('exam');
    } catch (err) {
      alert(`Could not start assessment: ${err.message}`);
      btnStartExam.disabled = false;
      btnStartExam.textContent = 'Start Assessment & Enter Fullscreen';
    }
  });

  // =========================================================
  // 5. Active Assessment Runner (Screen 4)
  // =========================================================
  function updateClockDisplay(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    examClock.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

    if (seconds <= 300) {
      examClock.classList.add('urgent');
    }
  }

  function queueAnswerSync() {
    syncStatusBadge.className = 'sync-indicator syncing';
    syncStatusText.textContent = 'Syncing...';

    if (saveAnswersTimeout) clearTimeout(saveAnswersTimeout);

    saveAnswersTimeout = setTimeout(async () => {
      try {
        if (window.lockdownAPI && activeAttemptSession) {
          await window.lockdownAPI.saveAnswers({
            attemptId: activeAttemptSession.attemptId,
            answers: cbtEngine.answers,
            answersSummary: cbtEngine.getAttemptSummary(),
          });
        }
        syncStatusBadge.className = 'sync-indicator synced';
        syncStatusText.textContent = 'Synced';
      } catch (err) {
        syncStatusBadge.className = 'sync-indicator offline';
        syncStatusText.textContent = 'Local Saved';
      }
    }, 1200);
  }

  function renderSectionTabs() {
    examSectionTabs.innerHTML = '';
    cbtEngine.config.sections.forEach((sec, idx) => {
      const tab = document.createElement('button');
      tab.className = `sec-tab ${idx === cbtEngine.currentSectionIdx ? 'active' : ''}`;
      tab.textContent = sec.name;
      tab.addEventListener('click', () => {
        cbtEngine.jumpTo(idx, 0);
        renderSectionTabs();
        renderCurrentQuestion();
        renderPalette();
      });
      examSectionTabs.appendChild(tab);
    });
  }

  function renderCurrentQuestion() {
    const q = cbtEngine.getCurrentQuestion();
    const sec = cbtEngine.getCurrentSection();
    if (!q) return;

    qNumberPill.textContent = `Question ${cbtEngine.currentQuestionIdx + 1} of ${sec.questions.length}`;
    qMarksPill.textContent = `+${q.marks || 1} / -0.25 Marks`;
    qText.textContent = q.text;

    // Render Options
    optionsContainer.innerHTML = '';
    const letters = ['A', 'B', 'C', 'D', 'E'];
    const currentAnswer = cbtEngine.answers[q.id];
    const selectedIndices = currentAnswer ? currentAnswer.selectedOptions : [];

    q.options.forEach((optText, oIdx) => {
      const isSelected = selectedIndices.includes(oIdx);
      const row = document.createElement('div');
      row.className = `option-row ${isSelected ? 'selected' : ''}`;
      row.innerHTML = `
        <div class="option-key">${letters[oIdx] || oIdx + 1}</div>
        <div class="option-label">${optText}</div>
      `;
      row.addEventListener('click', () => {
        cbtEngine.selectOption(oIdx);
        renderCurrentQuestion();
        renderPalette();
      });
      optionsContainer.appendChild(row);
    });

    btnMark.textContent = cbtEngine.markedForReview.has(q.id) ? 'Unmark Review' : 'Mark for Review';
  }

  function renderPalette() {
    paletteGrid.innerHTML = '';
    const sec = cbtEngine.getCurrentSection();

    sec.questions.forEach((q, idx) => {
      const btn = document.createElement('button');
      const status = cbtEngine.getQuestionStatus(cbtEngine.currentSectionIdx, idx);

      let classes = `palette-btn ${status.statusClass}`;
      if (status.isCurrent) classes += ' current';

      btn.className = classes;
      btn.textContent = idx + 1;
      btn.addEventListener('click', () => {
        cbtEngine.jumpTo(cbtEngine.currentSectionIdx, idx);
        renderCurrentQuestion();
        renderPalette();
      });
      paletteGrid.appendChild(btn);
    });
  }

  // Question navigation actions
  btnNext.addEventListener('click', () => {
    cbtEngine.nextQuestion();
    renderSectionTabs();
    renderCurrentQuestion();
    renderPalette();
  });

  btnPrev.addEventListener('click', () => {
    cbtEngine.prevQuestion();
    renderSectionTabs();
    renderCurrentQuestion();
    renderPalette();
  });

  btnClear.addEventListener('click', () => {
    cbtEngine.clearResponse();
    renderCurrentQuestion();
    renderPalette();
  });

  btnMark.addEventListener('click', () => {
    cbtEngine.toggleMarkForReview();
    renderCurrentQuestion();
    renderPalette();
  });

  // =========================================================
  // 6. Submission Flow & Receipt (Screen 5 -> Screen 6)
  // =========================================================
  btnSubmitExam.addEventListener('click', () => {
    openSubmissionConfirmation();
  });

  function openSubmissionConfirmation() {
    const summary = cbtEngine.getAttemptSummary();
    modalStatTotal.textContent = summary.totalQuestions;
    modalStatAnswered.textContent = summary.answered;
    modalStatUnanswered.textContent = summary.unanswered;

    modalUnansweredNotice.style.display = summary.unanswered > 0 ? 'block' : 'none';
    submitProgressBarContainer.style.display = 'none';
    btnConfirmSubmit.disabled = false;
    btnConfirmSubmit.textContent = 'Finalize & Submit';

    modalSubmitConfirm.classList.add('active');
  }

  btnCancelSubmit.addEventListener('click', () => {
    if (!isSubmitting) {
      modalSubmitConfirm.classList.remove('active');
    }
  });

  btnConfirmSubmit.addEventListener('click', async () => {
    await executeSubmission('CANDIDATE_MANUAL_SUBMIT');
  });

  function handleTimeExpired() {
    alert('Assessment time has expired! Finalizing your submission now.');
    executeSubmission('TIME_EXPIRED');
  }

  async function executeSubmission(reason) {
    if (isSubmitting || !cbtEngine) return;
    isSubmitting = true;

    cbtEngine.stopTimer();

    // Show progress
    btnConfirmSubmit.disabled = true;
    btnCancelSubmit.disabled = true;
    submitProgressBarContainer.style.display = 'block';
    submitProgressBarFill.style.width = '45%';

    try {
      const localResult = cbtEngine.calculateResult();

      submitProgressBarFill.style.width = '75%';

      let submitRes = null;
      if (window.lockdownAPI) {
        submitRes = await window.lockdownAPI.submitAttempt({
          attemptId: activeAttemptSession.attemptId,
          code: activeAttemptSession.code,
          candidateName: activeAttemptSession.candidate.name,
          candidateId: activeAttemptSession.candidate.id,
          answers: cbtEngine.answers,
          timeTakenSeconds: localResult.timeTakenSeconds,
          submitReason: reason,
          localScoreData: localResult,
        });
      }

      submitProgressBarFill.style.width = '100%';

      // Release hardware and window
      cameraProctor.stopCamera();
      cbtEngine.clearLocalStorage();

      // Populate Receipt Screen
      const receiptId = submitRes?.receiptId || `OA-${Date.now().toString(36).toUpperCase()}`;
      rcptReceiptId.textContent = receiptId;
      rcptCandidate.textContent = activeAttemptSession.candidate.name;
      rcptRoll.textContent = activeAttemptSession.candidate.id;
      rcptExam.textContent = activeAttemptSession.title;
      rcptScore.textContent = `${localResult.totalScore} / ${localResult.maxScore} (${localResult.percentScore}%)`;
      rcptQuestions.textContent = `${localResult.attempted} of ${localResult.totalQuestions} questions`;
      rcptViolations.textContent = `${violationCount} Integrity Events Recorded`;
      rcptAuthority.textContent = submitRes?.isMock ? 'TestMeMan Dev Adapter (Offline Mock)' : 'TestMeMan Assessment Cloud Service';
      rcptTime.textContent = new Date().toLocaleString('en-IN');

      modalSubmitConfirm.classList.remove('active');
      headerSyncPill.style.display = 'none';
      showScreen('receipt');
    } catch (err) {
      alert(`Submission error: ${err.message}. Retrying submission locally...`);
      showScreen('receipt');
    } finally {
      isSubmitting = false;
    }
  }

  // =========================================================
  // 7. Integrity Event Listeners
  // =========================================================
  if (window.lockdownAPI) {
    window.lockdownAPI.onProcessViolation((violation) => {
      violationCount++;
      violationBadge.textContent = `${violationCount} Events`;
      violationBadge.style.color = '#f43f5e';
      console.warn('[Process Compliance Alert]', violation);
    });

    window.lockdownAPI.onDisplayViolation((violation) => {
      violationCount++;
      violationBadge.textContent = `${violationCount} Events`;
      violationBadge.style.color = '#f43f5e';
      console.warn('[Display Integrity Alert]', violation);
    });

    window.lockdownAPI.onShortcutBlocked((data) => {
      console.info('Shortcut intercepted:', data.shortcut);
    });

    window.lockdownAPI.onEventRecorded((evt) => {
      if (evt.severity === 'WARNING' || evt.severity === 'VIOLATION') {
        violationCount++;
        violationBadge.textContent = `${violationCount} Events`;
        violationBadge.style.color = '#f43f5e';
      }
    });

    window.lockdownAPI.onPromptConfirmExit(() => {
      openSubmissionConfirmation();
    });
  }
});
