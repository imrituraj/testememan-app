/**
 * TestMeMan Secure Exam: renderer flow.
 *   code → profile → system check → identity (face match + liveness) → rules → exam (locked, proctored) → receipt
 * The exam clock starts only at "Start exam" (POST /api/app/session/start), so checks don't eat exam time.
 */

/* global Proctor */
(() => {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const CODE_CHARS = /^[A-HJ-NP-Z2-9]$/;
  const SUBMIT_RETRY_MS = 3 * 60 * 1000;
  const NON_WARNING =new Set(['NOISE', 'SHORTCUT_BLOCKED', 'RESUMED', 'NETWORK_LOST', 'NETWORK_RESTORED']);
  const EVENT_LABELS = {
    NO_FACE: ['Face not visible', 'Keep your face in view of the camera at all times.'],
    MULTIPLE_FACES: ['Another person detected', 'Only you may be in view during the exam.'],
    FACE_MISMATCH: ['Face does not match', "The person in view doesn't match the registered candidate."],
    LOOK_AWAY: ['Looking away', 'Keep your eyes on the exam screen.'],
    PHONE_DETECTED: ['Phone detected', 'Mobile phones are not allowed. Put it away, out of view.'],
    FOCUS_LOST: ['Left the exam window', 'Switching away from the exam is not allowed.'],
    FULLSCREEN_EXIT: ['Left full screen', 'The exam must stay full screen.'],
    DISPLAY_CHANGE: ['Display change detected', 'Disconnect additional monitors, projectors or mirroring.'],
    PROHIBITED_APP: ['Prohibited app opened', 'It was closed. Other apps are not allowed during the exam.'],
    CAMERA_LOST: ['Camera stopped', 'Your camera must stay on for the whole exam.'],
    NOISE: ['Voices or noise detected', 'Stay in a quiet room.'],
    SHORTCUT_BLOCKED: ['Shortcut blocked', 'Keyboard shortcuts are disabled during the exam.'],
  };

  const S = {
    info: null,
    code: '',
    verify: null,
    session: null,
    refEmbedding: null,
    liveEmbedding: null,
    identity: null,
    identityImage: null,
    flat: [],
    sections: [],
    cur: 0,
    answers: {},
    review: new Set(),
    visited: new Set(),
    pending: {},
    events: [],
    warnings: 0,
    maxWarnings: 6,
    deadline: 0,
    online: true,
    submitting: false,
    submitStuck: false,
    submitted: false,
    timers: [],
  };

  /* ───────────── Helpers ───────────── */

  function show(id) {
    $$('.screen').forEach((s) => s.removeAttribute('data-active'));
    $(`#screen-${id}`).setAttribute('data-active', '');
  }
  function loading(text) {
    $('#loading').hidden = !text;
    if (text) $('#loading-text').textContent = text;
  }
  function openModal(id) {
    $(`#${id}`).hidden = false;
  }
  function closeModal(id) {
    $(`#${id}`).hidden = true;
  }
  $$('.modal [data-close]').forEach((b) => b.addEventListener('click', () => (b.closest('.modal').hidden = true)));

  function toast(text, kind = '') {
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.textContent = text;
    $('#toasts').appendChild(el);
    setTimeout(() => el.remove(), 4200);
  }

  const fmtDate = (iso) =>
    iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : null;
  const pad = (n) => String(n).padStart(2, '0');
  function fmtClock(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(s / 3600);
    return h ? `${h}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}` : `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
  }
  const backupKey = () => `tmm_exam_${S.code}`;
  function saveBackup() {
    try {
      localStorage.setItem(backupKey(), JSON.stringify({ answers: S.answers, review: [...S.review], visited: [...S.visited], cur: S.cur, at: Date.now() }));
    } catch {}
  }
  function readBackup() {
    try {
      return JSON.parse(localStorage.getItem(backupKey()) || 'null');
    } catch {
      return null;
    }
  }

  // No copying, context menus, drag-and-drop or reloads anywhere in the app
  ['copy', 'cut', 'paste', 'contextmenu', 'dragstart', 'drop'].forEach((ev) =>
    document.addEventListener(ev, (e) => {
      if (ev === 'paste' && e.target.closest('#code-boxes')) return;
      e.preventDefault();
    })
  );
  document.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if ((e.metaKey || e.ctrlKey) && ['r', 'p', 's', 'f', 'u', 'c', 'v', 'x', 'a'].includes(k) && !e.target.closest('#code-boxes')) e.preventDefault();
    if (k === 'f5' || k === 'f12') e.preventDefault();
  });

  /* ───────────── 1. Code ───────────── */

  const boxes = $$('#code-boxes input');
  const readCode = () => boxes.map((b) => b.value).join('');
  function updateCodeButton() {
    $('#code-submit').disabled = readCode().length !== 6;
    $('#code-boxes').classList.remove('error');
    $('#code-error').textContent = '';
  }
  boxes.forEach((box, i) => {
    box.addEventListener('input', () => {
      const v = box.value.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/[O0]/g, '').replace(/[I1]/g, '');
      box.value = v.slice(-1);
      if (box.value && !CODE_CHARS.test(box.value)) box.value = '';
      if (box.value && i < boxes.length - 1) boxes[i + 1].focus();
      updateCodeButton();
      if (readCode().length === 6) $('#code-form').requestSubmit();
    });
    box.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !box.value && i > 0) boxes[i - 1].focus();
      if (e.key === 'ArrowLeft' && i > 0) boxes[i - 1].focus();
      if (e.key === 'ArrowRight' && i < boxes.length - 1) boxes[i + 1].focus();
    });
    box.addEventListener('paste', (e) => {
      e.preventDefault();
      const text = (e.clipboardData.getData('text') || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      const chars = text.split('').filter((c) => CODE_CHARS.test(c)).slice(0, 6);
      chars.forEach((c, j) => (boxes[j].value = c));
      boxes[Math.min(chars.length, 5)].focus();
      updateCodeButton();
      if (readCode().length === 6) $('#code-form').requestSubmit();
    });
  });

  $('#code-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = readCode();
    if (code.length !== 6) return;
    loading('Finding your exam…');
    const res = await window.tmm.api.verify(code);
    loading(null);
    if (!res.ok) {
      $('#code-boxes').classList.add('error');
      $('#code-error').textContent = res.status === 0 ? 'No internet connection. Check your network and try again.' : res.error;
      return;
    }
    S.code = code;
    S.verify = res.data;
    renderProfile();
    show('profile');
  });
  $('#help-link').addEventListener('click', () => openModal('modal-help'));

  /* ───────────── 2. Profile ───────────── */

  let countdownTimer = null;
  function renderProfile() {
    const { candidate, exam, canStart, blocked } = S.verify;
    $('#profile-name').textContent = candidate.name;
    $('#profile-email').textContent = candidate.email;
    $('#profile-college').textContent = candidate.college || '—';
    $('#profile-roll-row').hidden = !candidate.rollNumber;
    $('#profile-roll').textContent = candidate.rollNumber || '';
    const photo = $('#profile-photo');
    photo.style.backgroundImage = candidate.photo ? `url("${candidate.photo}")` : '';
    photo.classList.toggle('has', !!candidate.photo);

    $('#exam-organizer').textContent = exam.organizer;
    $('#exam-title').textContent = exam.title;
    $('#exam-duration').textContent = exam.durationMinutes;
    $('#exam-questions').textContent = exam.totalQuestions;
    $('#exam-sections').textContent = Math.max(1, exam.sections?.length || 0);
    $('#exam-negative').textContent = exam.negativeMarks ? `−${exam.negativeMarks}` : 'None';
    const start = fmtDate(exam.startsAt);
    const end = fmtDate(exam.endsAt);
    $('#exam-window').textContent = start || end ? `Window: ${start || 'now'} → ${end || 'until closed'}` : '';
    const p = exam.proctoring || {};
    const tags = [
      p.faceMatch && 'Face match',
      p.liveness && 'Liveness check',
      p.continuousMatch && 'Continuous identity',
      p.multipleFaces && 'Single person',
      p.lookAway && 'Gaze tracking',
      p.noiseDetection && 'Audio monitoring',
      'Phone detection',
      'Locked screen',
    ].filter(Boolean);
    $('#proctor-tags').innerHTML = tags.map((t) => `<span class="pill">${t}</span>`).join('');

    const pill = $('#exam-status-pill');
    pill.className = `pill ${canStart ? 'pill-ok' : 'pill-warn'}`;
    pill.textContent = canStart ? 'Open now' : candidate.status === 'SUBMITTED' ? 'Submitted' : 'Not open';

    clearInterval(countdownTimer);
    $('#profile-blocked').hidden = canStart;
    $('#profile-continue').disabled = !canStart;
    if (!canStart) {
      $('#blocked-title').textContent = candidate.status === 'SUBMITTED' ? 'Already submitted' : 'You can’t start yet';
      $('#blocked-text').textContent = blocked || '';
      const startsAt = exam.startsAt ? new Date(exam.startsAt).getTime() : 0;
      const offset = new Date(S.verify.serverTime).getTime() - Date.now();
      const cd = $('#countdown');
      cd.hidden = !(startsAt && startsAt > Date.now() + offset);
      if (!cd.hidden) {
        const tick = async () => {
          const left = startsAt - (Date.now() + offset);
          cd.textContent = `Starts in ${fmtClock(left)}`;
          if (left <= 0) {
            clearInterval(countdownTimer);
            const res = await window.tmm.api.verify(S.code);
            if (res.ok) {
              S.verify = res.data;
              renderProfile();
            }
          }
        };
        tick();
        countdownTimer = setInterval(tick, 1000);
      }
    }
  }
  $('#profile-back').addEventListener('click', () => {
    clearInterval(countdownTimer);
    boxes.forEach((b) => (b.value = ''));
    updateCodeButton();
    show('code');
    boxes[0].focus();
  });
  $('#profile-continue').addEventListener('click', () => {
    clearInterval(countdownTimer);
    show('check');
    runChecks();
  });

  /* ───────────── 3. System check ───────────── */

  const setCheck = (name, status, text) => {
    const li = $(`#check-list li[data-check="${name}"]`);
    li.dataset.status = status;
    if (text !== undefined) li.querySelector('p').textContent = text;
  };
  const checkPassed = () => ['network', 'camera', 'mic', 'display', 'vm', 'apps', 'ai'].every((n) => ['pass', 'warn'].includes($(`#check-list li[data-check="${n}"]`).dataset.status));
  const refreshContinue = () => ($('#check-continue').disabled = !checkPassed());

  let micTimer = null;
  let micPeak = 0;
  let aiReady = null;

  async function runChecks() {
    ['network', 'camera', 'mic', 'display', 'vm', 'apps'].forEach((n) => setCheck(n, 'pending', 'Checking…'));
    $('#close-apps').hidden = true;
    refreshContinue();

    // Camera + mic
    try {
      await Proctor.startCamera($('#check-video'));
      setCheck('camera', 'pass', 'Camera is working');
      clearInterval(micTimer);
      micPeak = 0;
      micTimer = setInterval(() => {
        const lvl = Proctor.micLevel();
        micPeak = Math.max(micPeak, lvl);
        $('#mic-bar').style.width = `${Math.round(lvl * 100)}%`;
        if (micPeak > 0.015) setCheck('mic', 'pass', 'Microphone is picking up sound');
        else setCheck('mic', 'warn', 'Say something to test your microphone');
        refreshContinue();
      }, 120);
    } catch (err) {
      const denied = /denied|permission|notallowed/i.test(`${err.name} ${err.message}`);
      setCheck('camera', 'fail', denied ? 'Camera access is blocked. Allow it in system settings, then press Re-check.' : 'No camera found. Connect a webcam.');
      setCheck('mic', 'fail', 'Needs camera and microphone access');
      if (denied) window.tmm.sys.openPrivacySettings();
    }

    // Device checks
    const pf = await window.tmm.sys.preflight();
    setCheck('network', pf.network.ok ? 'pass' : 'fail', pf.network.ok ? `Connected (${pf.network.latencyMs} ms)` : 'Cannot reach TestMeMan. Check your internet.');
    setCheck('display', pf.displays.count === 1 ? 'pass' : 'fail', pf.displays.count === 1 ? 'One screen connected' : `${pf.displays.count} screens connected. Disconnect extra monitors, projectors and mirroring.`);
    if (pf.vm.detected) setCheck('vm', pf.isDev ? 'warn' : 'fail', `${pf.vm.detail}. Exams must run directly on your computer.`);
    else setCheck('vm', 'pass', 'Running directly on this computer');
    if (pf.apps.length) {
      setCheck('apps', pf.isDev ? 'warn' : 'fail', `Close: ${pf.apps.map((a) => a.name).join(', ')}${pf.isDev ? ' (dev build: not enforced)' : ''}`);
      $('#close-apps').hidden = pf.isDev;
    } else setCheck('apps', 'pass', 'No prohibited apps running');

    // AI engine + reference embedding (loaded once)
    if (!aiReady) {
      setCheck('ai', 'pending', 'Loading AI models…');
      aiReady = (async () => {
        await Proctor.init((t) => setCheck('ai', 'pending', `${t}…`));
        const photo = S.verify.candidate.photo;
        if (photo) {
          const ref = await Proctor.embeddingFromPhoto(photo);
          S.refEmbedding = ref.embedding || null;
        }
      })()
        .then(() => setCheck('ai', 'pass', S.verify.candidate.photo && !S.refEmbedding ? 'Ready (registration photo unclear: a new reference will be taken)' : 'Ready, running on this device'))
        .catch((err) => {
          aiReady = null;
          setCheck('ai', 'fail', `Could not start the AI engine: ${err.message}`);
        });
    }
    await aiReady;
    refreshContinue();
  }

  $('#check-retry').addEventListener('click', runChecks);
  $('#close-apps').addEventListener('click', async () => {
    $('#close-apps').disabled = true;
    await window.tmm.sys.closeApps();
    $('#close-apps').disabled = false;
    setTimeout(runChecks, 1200);
  });
  $('#check-continue').addEventListener('click', () => {
    clearInterval(micTimer);
    const p = S.verify.exam.proctoring || {};
    show('identity');
    startIdentity(p);
  });

  /* ───────────── 4. Identity ───────────── */

  const ID_STEPS = ['center', 'turn1', 'turn2', 'capture', 'match'];
  let idAttempts = 0;
  let idRun = null;

  function setIdStep(step) {
    const idx = ID_STEPS.indexOf(step);
    $$('#id-steps li').forEach((li, i) => {
      li.classList.toggle('active', i === idx);
      li.classList.toggle('done', i < idx);
    });
    $('#id-progress-bar').style.width = `${(idx / ID_STEPS.length) * 100}%`;
  }
  const prompt = (t) => ($('#id-prompt').textContent = t);
  const stageState = (s) => {
    const st = $('.identity-stage');
    st.classList.toggle('good', s === 'good');
    st.classList.toggle('bad', s === 'bad');
  };

  function startIdentity(p) {
    Proctor.attach($('#id-video'));
    const ref = $('#ref-img');
    ref.style.backgroundImage = S.verify.candidate.photo ? `url("${S.verify.candidate.photo}")` : '';
    ref.parentElement.querySelector('p').textContent = S.refEmbedding ? 'Registration photo' : 'No usable registration photo: this check becomes your reference';
    $('#id-result').hidden = true;
    $('#id-retry').hidden = true;
    $('#id-continue').hidden = true;
    if (p.faceMatch === false) {
      // Organizer turned face match off: still record who sat the exam
      setTimeout(async () => {
        S.identityImage = Proctor.capture({ width: 480 });
        S.identity = { verdict: 'SKIPPED', match: null, liveness: null, attempts: 1 };
        goRules();
      }, 600);
      return;
    }
    idAttempts++;
    runIdentity(p).catch((err) => {
      prompt('Something went wrong. Try again.');
      console.error(err);
      $('#id-retry').hidden = false;
    });
  }

  async function runIdentity(p) {
    const myRun = (idRun = Symbol('id'));
    const alive = () => idRun === myRun;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const phaseTimeout = 30000;
    let phaseStart = Date.now();
    let step = 'center';
    let heldSince = null;
    let turnSign = 0;
    const samples = [];
    setIdStep(step);
    prompt('Position your face inside the oval');

    while (alive()) {
      const { faces } = await Proctor.analyze();
      const f = faces[0];
      const now = Date.now();
      if (now - phaseStart > phaseTimeout) {
        stageState('bad');
        prompt('Taking too long. Check your lighting and try again.');
        $('#id-retry').hidden = false;
        return;
      }
      if (faces.length > 1) {
        stageState('bad');
        prompt('Only you should be in view');
        heldSince = null;
        await sleep(200);
        continue;
      }
      if (!f) {
        stageState('bad');
        prompt(step === 'turn1' || step === 'turn2' ? 'Keep your face in view while turning' : 'No face found: move closer and face the light');
        heldSince = null;
        await sleep(200);
        continue;
      }
      const [x, y, w, h] = f.box;
      const cx = x + w / 2;
      const cy = y + h / 2;
      const centered = Math.abs(cx - 0.5) < 0.14 && Math.abs(cy - 0.47) < 0.18;
      const bigEnough = w > 0.2;

      if (step === 'center') {
        if (!bigEnough) prompt('Move a little closer');
        else if (!centered) prompt('Center your face in the oval');
        else if (Math.abs(f.yaw) > 0.2) prompt('Look straight at the camera');
        else {
          stageState('good');
          prompt('Hold still…');
          heldSince ??= now;
          if (now - heldSince > 900) {
            step = 'turn1';
            phaseStart = now;
            setIdStep(step);
          }
          await sleep(120);
          continue;
        }
        stageState('');
        heldSince = null;
      } else if (step === 'turn1') {
        prompt('Slowly turn your head to one side');
        if (Math.abs(f.yaw) > 0.3) {
          turnSign = Math.sign(f.yaw);
          step = 'turn2';
          phaseStart = now;
          setIdStep(step);
        }
      } else if (step === 'turn2') {
        prompt('Now turn to the other side');
        if (Math.sign(f.yaw) === -turnSign && Math.abs(f.yaw) > 0.3) {
          step = 'capture';
          phaseStart = now;
          setIdStep(step);
        }
      } else if (step === 'capture') {
        if (Math.abs(f.yaw) < 0.15 && centered && f.embedding) {
          stageState('good');
          prompt('Look straight at the camera… capturing');
          samples.push({ embedding: f.embedding, real: f.real, live: f.live });
          if (samples.length === 1) S.identityImage = Proctor.capture({ width: 480, quality: 0.8 });
          if (samples.length >= 4) break;
        } else prompt('Face the camera again');
      }
      await sleep(150);
    }
    if (!alive()) return;

    // Match
    setIdStep('match');
    prompt('Matching…');
    const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
    const realScore = avg(samples.map((s) => s.real).filter((v) => typeof v === 'number'));
    const liveScore = avg(samples.map((s) => s.live).filter((v) => typeof v === 'number'));
    const liveness = avg([realScore, liveScore].filter((v) => v !== null));
    S.liveEmbedding = samples[Math.floor(samples.length / 2)].embedding;
    const threshold = p.matchThreshold || 0.55;
    let verdict;
    let match = null;
    if (p.liveness && liveness !== null && liveness < 0.35) verdict = 'SPOOF';
    else if (!S.refEmbedding) verdict = 'ENROLLED';
    else {
      match = Math.max(...samples.map((s) => Proctor.similarity(S.refEmbedding, s.embedding)));
      verdict = match >= threshold ? 'MATCH' : 'MISMATCH';
    }
    S.identity = { verdict, match, liveness, attempts: idAttempts };
    $('#id-progress-bar').style.width = '100%';
    showIdentityResult(verdict, match);
  }

  function showIdentityResult(verdict, match) {
    const ok = verdict === 'MATCH' || verdict === 'ENROLLED';
    const pct = match === null ? 100 : Math.round(match * 100);
    const ring = $('#id-ring');
    ring.style.setProperty('--v', pct);
    ring.style.setProperty('--c', ok ? 'var(--ok)' : 'var(--bad-strong)');
    $('#id-ring-val').textContent = match === null ? '✓' : `${pct}%`;
    const copy = {
      MATCH: ['Identity verified', 'Your face matches your registration photo.'],
      ENROLLED: ['Reference captured', 'Your organizer will compare this photo with your records.'],
      MISMATCH: ["Face doesn't match", 'Make sure your face is well lit and not covered, then try again.'],
      SPOOF: ['Liveness check failed', 'Use your real face in front of the camera, not a photo or screen.'],
    }[verdict];
    $('#id-result-title').textContent = copy[0];
    $('#id-result-text').textContent = copy[1];
    $('#id-result').hidden = false;
    stageState(ok ? 'good' : 'bad');
    prompt(ok ? 'Done' : copy[0]);
    if (ok) {
      $('#id-continue').hidden = false;
      $('#id-continue').textContent = 'Continue →';
    } else if (idAttempts < 3) {
      $('#id-retry').hidden = false;
    } else {
      // Don't lock a genuine candidate out on a bad camera: let them continue, flagged for the organizer
      $('#id-result-text').textContent = `${copy[1]} You can continue, but this exam will be flagged for your organizer to review.`;
      $('#id-continue').hidden = false;
      $('#id-continue').textContent = 'Continue (flagged) →';
    }
  }

  $('#id-retry').addEventListener('click', () => startIdentity(S.verify.exam.proctoring || {}));
  $('#id-continue').addEventListener('click', () => {
    idRun = null;
    goRules();
  });

  /* ───────────── 5. Rules ───────────── */

  function goRules() {
    const p = S.verify.exam.proctoring || {};
    const exam = S.verify.exam;
    const rules = [
      ['⏱', `${exam.durationMinutes} minutes, ${exam.totalQuestions} questions`, `The timer starts when you press Start and keeps running if you leave. ${exam.negativeMarks ? `Wrong answers cost ${exam.negativeMarks} of the question's marks.` : 'There is no negative marking.'}`],
      ['🔒', 'Your screen will be locked', 'The exam runs full screen. Switching apps, shortcuts, copy-paste and screenshots are blocked.'],
      ['📷', 'Camera and microphone stay on', `The AI checks that you are present${p.multipleFaces ? ', alone' : ''}${p.continuousMatch ? ', and the same person' : ''}${p.lookAway ? ', looking at the screen' : ''}. Snapshots are sent to your organizer.`],
      ['📵', 'No phones, notes or other people', 'Phones in view and other people are detected and reported.'],
      ['⚠️', `${p.maxWarnings || 6} warnings and the exam submits itself`, 'Each rule break shows a warning. Reaching the limit submits your exam automatically.'],
      ['💾', 'Answers save automatically', 'If the internet drops, keep going. Answers are stored on this device and sync when you reconnect.'],
    ];
    $('#rules-list').innerHTML = rules.map(([ic, t, d]) => `<li><span class="ic">${ic}</span><div><strong>${t}</strong><span>${d}</span></div></li>`).join('');
    $('#organizer-notes').hidden = !exam.instructions;
    $('#organizer-notes-text').textContent = exam.instructions || '';
    $('#agree').checked = false;
    $('#start-exam').disabled = true;
    show('rules');
  }
  $('#agree').addEventListener('change', () => ($('#start-exam').disabled = !$('#agree').checked));

  $('#start-exam').addEventListener('click', async () => {
    loading('Starting your exam…');
    const res = await window.tmm.api.start(S.code);
    if (!res.ok) {
      loading(null);
      alertModal('Could not start', res.status === 0 ? 'No internet connection. Check your network and try again.' : res.error);
      return;
    }
    S.session = res.data;
    if (S.identity) {
      await window.tmm.api.identity({ ...S.identity, image: S.identityImage });
    }
    await window.tmm.exam.lock();
    document.body.classList.add('kiosk');
    loading(null);
    beginExam();
  });

  function alertModal(title, text) {
    $('#warn-title').textContent = title;
    $('#warn-text').textContent = text;
    $('#warn-count').textContent = '';
    openModal('modal-warning');
  }

  /* ───────────── 6. Exam ───────────── */

  function beginExam() {
    const sess = S.session;
    S.sections = sess.paper;
    S.flat = [];
    sess.paper.forEach((sec, si) => sec.questions.forEach((q, qi) => S.flat.push({ si, qi, q })));
    S.answers = { ...(sess.answers || {}) };
    // Answers made offline before a crash/restart that never reached the server
    const backup = readBackup();
    if (backup?.answers) {
      for (const [k, v] of Object.entries(backup.answers)) if (S.answers[k] !== v) S.pending[k] = S.answers[k] = v;
      (backup.review || []).forEach((id) => S.review.add(id));
      (backup.visited || []).forEach((id) => S.visited.add(id));
      if (Number.isInteger(backup.cur)) S.cur = Math.min(backup.cur, S.flat.length - 1);
    }
    S.warnings = sess.warnings || 0;
    S.maxWarnings = sess.exam.proctoring?.maxWarnings || 6;
    const offset = new Date(sess.serverTime).getTime() - Date.now();
    S.deadline = new Date(sess.deadlineAt).getTime() - offset;

    $('#x-title').textContent = sess.exam.title;
    $('#x-candidate').textContent = `${sess.candidate.name}${sess.candidate.rollNumber ? ` · ${sess.candidate.rollNumber}` : ''}`;
    updateWarnings();
    renderSections();
    renderQuestion();
    show('exam');

    // Proctoring
    Proctor.attach($('#x-video'));
    const p = sess.exam.proctoring || {};
    const references = [S.refEmbedding, S.liveEmbedding].filter(Boolean);
    Proctor.startMonitor(
      { ...p, references, threshold: p.matchThreshold || 0.55 },
      {
        onViolation: (v) => violation(v.type, v.detail, { snapshotKind: v.snapshotKind, match: v.match, faces: v.faces, warn: v.warn !== false }),
        onStatus: renderChips,
        onSnapshot: (s) => sendSnapshot(s.kind, s.faces, s.match),
      }
    );
    if (sess.resumed) toast('Welcome back. Your saved answers were restored.');

    S.timers.push(setInterval(tickTimer, 500));
    S.timers.push(setInterval(flushAnswers, 4000));
    S.timers.push(setInterval(flushEvents, 6000));
    tickTimer();
    flushAnswers();
  }

  function renderSections() {
    const cur = S.flat[S.cur];
    $('#x-sections').innerHTML = S.sections
      .map((sec, si) => {
        const answered = sec.questions.filter((q) => S.answers[q.id] !== undefined && S.answers[q.id] !== null).length;
        return `<button class="${cur.si === si ? 'active' : ''}" data-si="${si}">${escapeHtml(sec.name)}<small>${answered}/${sec.questions.length}</small></button>`;
      })
      .join('');
    $('#x-sections').hidden = S.sections.length < 2;
  }
  $('#x-sections').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-si]');
    if (!b) return;
    const si = Number(b.dataset.si);
    goTo(S.flat.findIndex((f) => f.si === si));
  });

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  }

  function renderQuestion() {
    const { si, qi, q } = S.flat[S.cur];
    S.visited.add(q.id);
    const sec = S.sections[si];
    $('#x-qnum').textContent = `Question ${qi + 1} of ${sec.questions.length}${S.sections.length > 1 ? ` · ${sec.name}` : ''}`;
    $('#x-marks').textContent = `${q.marks} mark${q.marks === 1 ? '' : 's'}`;
    $('#x-qtext').textContent = q.text;
    const chosen = S.answers[q.id];
    $('#x-options').innerHTML = q.options
      .map((o, i) => `<button class="opt ${chosen === o.id ? 'selected' : ''}" data-oid="${o.id}"><span class="key">${String.fromCharCode(65 + i)}</span><span>${escapeHtml(o.text)}</span></button>`)
      .join('');
    $('#x-review').classList.toggle('on', S.review.has(q.id));
    $('#x-review').textContent = S.review.has(q.id) ? '★ Marked for review' : '☆ Mark for review';
    $('#x-prev').disabled = S.cur === 0;
    $('#x-next').textContent = S.cur === S.flat.length - 1 ? 'Save' : 'Save & next →';
    renderPalette();
    renderSections();
    saveBackup();
  }

  function renderPalette() {
    const { si } = S.flat[S.cur];
    const items = S.flat.map((f, idx) => ({ ...f, idx })).filter((f) => f.si === si);
    $('#x-palette').innerHTML = items
      .map((f) => {
        const id = f.q.id;
        const cls = [
          S.answers[id] !== undefined && S.answers[id] !== null ? 'answered' : S.visited.has(id) ? 'visited' : '',
          S.review.has(id) ? 'review' : '',
          f.idx === S.cur ? 'current' : '',
        ].join(' ');
        return `<button class="${cls}" data-idx="${f.idx}">${f.qi + 1}</button>`;
      })
      .join('');
    const answered = Object.values(S.answers).filter((v) => v !== null && v !== undefined).length;
    $('#x-progress').textContent = `${answered} / ${S.flat.length} answered`;
  }
  $('#x-palette').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-idx]');
    if (b) goTo(Number(b.dataset.idx));
  });

  function goTo(idx) {
    if (idx < 0 || idx >= S.flat.length) return;
    S.cur = idx;
    renderQuestion();
  }

  function choose(optionId) {
    const { q } = S.flat[S.cur];
    S.answers[q.id] = optionId;
    S.pending[q.id] = optionId;
    setSync('busy', 'Saving…');
    renderQuestion();
  }
  $('#x-options').addEventListener('click', (e) => {
    const b = e.target.closest('.opt');
    if (b) choose(Number(b.dataset.oid));
  });
  $('#x-clear').addEventListener('click', () => {
    const { q } = S.flat[S.cur];
    S.answers[q.id] = null;
    S.pending[q.id] = null;
    renderQuestion();
  });
  $('#x-review').addEventListener('click', () => {
    const { q } = S.flat[S.cur];
    if (S.review.has(q.id)) S.review.delete(q.id);
    else S.review.add(q.id);
    renderQuestion();
  });
  $('#x-prev').addEventListener('click', () => goTo(S.cur - 1));
  $('#x-next').addEventListener('click', () => {
    flushAnswers();
    if (S.cur < S.flat.length - 1) goTo(S.cur + 1);
  });
  document.addEventListener('keydown', (e) => {
    if (!$('#screen-exam').hasAttribute('data-active') || !$('#modal-submit').hidden || !$('#modal-warning').hidden) return;
    const q = S.flat[S.cur]?.q;
    if (!q) return;
    const n = Number(e.key);
    if (n >= 1 && n <= q.options.length) choose(q.options[n - 1].id);
    const letter = e.key.toUpperCase().charCodeAt(0) - 65;
    if (e.key.length === 1 && letter >= 0 && letter < q.options.length) choose(q.options[letter].id);
    if (e.key === 'ArrowRight') goTo(S.cur + 1);
    if (e.key === 'ArrowLeft') goTo(S.cur - 1);
  });

  function setSync(state, text) {
    const el = $('#x-sync');
    el.className = `sync ${state}`;
    el.querySelector('span:last-child').textContent = text;
  }

  let flushing = false;
  async function flushAnswers() {
    if (flushing || S.submitted || !Object.keys(S.pending).length) {
      if (!Object.keys(S.pending).length && S.online) setSync('ok', 'All answers saved');
      return;
    }
    flushing = true;
    const batch = { ...S.pending };
    const res = await window.tmm.api.saveAnswers(batch);
    flushing = false;
    if (res.ok) {
      for (const [k, v] of Object.entries(batch)) if (S.pending[k] === v) delete S.pending[k];
      setOnline(true);
      setSync('ok', 'All answers saved');
    } else if (res.status === 0) {
      setOnline(false);
    } else if (res.code === 'SESSION_REPLACED') {
      sessionReplaced();
    } else if (res.code === 'TIME_UP' || res.code === 'SUBMITTED') {
      submit('TIME_UP');
    } else {
      setSync('bad', 'Not saved, retrying');
    }
  }

  function setOnline(online) {
    if (online === S.online) return;
    S.online = online;
    if (!online) {
      setSync('bad', 'Offline: answers kept on this device');
      queueEvent('NETWORK_LOST');
      openModal('modal-offline');
    } else {
      closeModal('modal-offline');
      queueEvent('NETWORK_RESTORED');
      toast('Back online. Answers synced.');
    }
  }
  window.addEventListener('offline', () => setOnline(false));
  window.addEventListener('online', () => {
    flushAnswers();
    flushEvents();
  });

  function sessionReplaced() {
    stopExam();
    alertModal('Exam opened elsewhere', 'Your exam was opened on another device or window, so this one has stopped. Re-open the app with your code to continue.');
  }

  function tickTimer() {
    const left = S.deadline - Date.now();
    const el = $('#x-timer');
    el.textContent = fmtClock(left);
    el.classList.toggle('low', left < 5 * 60 * 1000);
    if (left <= 0 && !S.submitting) submit('TIME_UP');
    else if (Math.abs(left - 5 * 60 * 1000) < 500) toast('5 minutes left', 'warn');
  }

  /* ── proctoring events ── */

  function queueEvent(type, detail) {
    S.events.push({ type, detail, at: new Date().toISOString() });
  }
  async function flushEvents() {
    if (!S.events.length || S.submitted) return;
    const batch = S.events.splice(0, 50);
    const res = await window.tmm.api.events(batch, S.warnings);
    if (!res.ok) {
      S.events.unshift(...batch);
      if (res.status === 0) setOnline(false);
      if (res.code === 'SESSION_REPLACED') sessionReplaced();
    }
  }

  async function sendSnapshot(kind, faces, match) {
    const image = Proctor.capture({ width: 400, quality: 0.65 });
    if (!image || S.submitted) return;
    await window.tmm.api.snapshot({ kind, image, faces, match });
  }

  let lastModalAt = 0;
  function violation(type, detail, { snapshotKind, match, faces, warn = true } = {}) {
    if (S.submitting || S.submitted) return;
    queueEvent(type, detail);
    if (snapshotKind) sendSnapshot(snapshotKind, faces, match);
    const [title, text] = EVENT_LABELS[type] || ['Rule break', detail || ''];
    if (!warn || NON_WARNING.has(type)) {
      toast(title, 'warn');
      return;
    }
    S.warnings++;
    queueEvent('WARNING', `${S.warnings}/${S.maxWarnings}: ${type}`);
    updateWarnings();
    flushEvents();
    if (S.warnings >= S.maxWarnings) {
      alertModal('Exam submitted', `You reached ${S.maxWarnings} warnings, so your exam was submitted automatically.`);
      submit('WARNING_LIMIT');
      return;
    }
    // A full warning for the first ones and when the last is near; a toast in between so the exam stays usable
    if (Date.now() - lastModalAt > 15000 || S.warnings >= S.maxWarnings - 1) {
      lastModalAt = Date.now();
      $('#warn-title').textContent = title;
      $('#warn-text').textContent = text;
      $('#warn-count').textContent = `Warning ${S.warnings} of ${S.maxWarnings}. At ${S.maxWarnings} your exam submits automatically.`;
      openModal('modal-warning');
    } else toast(`⚠ ${title} (${S.warnings}/${S.maxWarnings})`, 'bad');
  }

  function updateWarnings() {
    const el = $('#x-warnings');
    el.textContent = `⚠ ${S.warnings} / ${S.maxWarnings}`;
    el.classList.toggle('hot', S.warnings > 0);
  }

  window.tmm.onProctorEvent((e) => {
    if (!$('#screen-exam').hasAttribute('data-active')) return;
    violation(e.type, e.detail, { snapshotKind: ['FOCUS_LOST', 'PROHIBITED_APP', 'DISPLAY_CHANGE'].includes(e.type) ? e.type : null });
  });
  window.tmm.onCloseRequested(() => {
    if ($('#screen-exam').hasAttribute('data-active')) openSubmitModal();
  });

  function renderChips(st) {
    const set = (id, cls, text) => {
      const el = $(id);
      el.className = `chip ${cls}`;
      if (text) el.textContent = text;
    };
    set('#chip-face', st.camera === false ? 'bad' : st.faces >= 1 ? 'ok' : 'bad', st.camera === false ? 'No camera' : st.faces >= 1 ? 'Face' : 'No face');
    set('#chip-alone', st.faces > 1 ? 'bad' : st.faces === 1 ? 'ok' : '', st.faces > 1 ? `${st.faces} people` : 'Alone');
    set('#chip-id', st.identity === 'ok' ? 'ok' : st.identity === 'mismatch' ? 'bad' : '', st.identity === 'mismatch' ? 'Mismatch' : 'Identity');
    set('#chip-gaze', st.phone ? 'bad' : st.gaze === 'away' ? 'warn' : st.faces ? 'ok' : '', st.phone ? 'Phone!' : st.gaze === 'away' ? 'Look here' : 'Focus');
    $('#x-mic').style.width = `${Math.round((st.mic || 0) * 100)}%`;
  }

  /* ── submit ── */

  function openSubmitModal() {
    const rows = S.sections.map((sec) => {
      const answered = sec.questions.filter((q) => S.answers[q.id] !== undefined && S.answers[q.id] !== null).length;
      const marked = sec.questions.filter((q) => S.review.has(q.id)).length;
      return `<tr><td>${escapeHtml(sec.name)}</td><td>${answered}</td><td>${sec.questions.length - answered}</td><td>${marked}</td></tr>`;
    });
    $('#submit-summary').innerHTML = `<tr><th>Section</th><th>Answered</th><th>Unanswered</th><th>Marked</th></tr>${rows.join('')}`;
    openModal('modal-submit');
  }
  $('#x-submit').addEventListener('click', openSubmitModal);
  $('#confirm-submit').addEventListener('click', () => {
    closeModal('modal-submit');
    submit('NORMAL');
  });

  function stopExam() {
    S.timers.forEach(clearInterval);
    S.timers = [];
    Proctor.stopMonitor();
  }

  async function submit(reason) {
    if (S.submitting || S.submitted) return;
    S.submitting = true;
    closeModal('modal-submit');
    loading('Submitting your answers…');
    saveBackup();
    await flushEvents();
    let res;
    // Ride out a flaky network for a few minutes, but never keep the candidate locked in indefinitely
    const giveUpAt = Date.now() + (S.submitStuck ? 20000 : SUBMIT_RETRY_MS);
    for (let attempt = 0; ; attempt++) {
      res = await window.tmm.api.submit(S.answers, reason);
      if (res.ok || res.status !== 0) break;
      if (Date.now() >= giveUpAt) {
        submitStuckOffline(reason);
        return;
      }
      loading(`No internet. Waiting to submit… (attempt ${attempt + 2})`);
      await new Promise((r) => setTimeout(r, Math.min(15000, 2000 * (attempt + 1))));
    }
    stopExam();
    S.submitted = true;
    await window.tmm.exam.unlock();
    document.body.classList.remove('kiosk');
    Proctor.stopCamera();
    loading(null);
    if (!res.ok && res.code !== 'SUBMITTED') {
      alertModal('Submission problem', `${res.error} Your answers are saved on the server. Contact your organizer with your code ${S.code}.`);
    }
    try {
      localStorage.removeItem(backupKey());
    } catch {}
    renderReceipt(res.ok ? res.data : null, reason);
  }

  /** Submit couldn't reach the server for SUBMIT_RETRY_MS: release the lockdown, keep answers on this device */
  async function submitStuckOffline(reason) {
    stopExam();
    saveBackup();
    await window.tmm.exam.unlock();
    document.body.classList.remove('kiosk');
    Proctor.stopCamera();
    loading(null);
    S.submitting = false;
    S.submitStuck = true;
    $('#submit-offline-code').textContent = S.code;
    $('#submit-offline').dataset.reason = reason;
    openModal('submit-offline');
  }
  $('#submit-offline-retry').addEventListener('click', () => {
    closeModal('submit-offline');
    submit($('#submit-offline').dataset.reason || 'NORMAL');
  });
  $('#submit-offline-quit').addEventListener('click', () => window.tmm.app.quit());

  function renderReceipt(data, reason) {
    const sess = S.session;
    $('#r-id').textContent = data?.receiptId || '—';
    $('#r-exam').textContent = sess.exam.title;
    $('#r-name').textContent = sess.candidate.name;
    $('#r-time').textContent = fmtDate(data?.submittedAt || new Date().toISOString());
    $('#r-answered').textContent = data ? `${data.answered} of ${data.total}` : '—';
    $('#r-score-row').hidden = !(data && data.score !== undefined);
    if (data && data.score !== undefined) $('#r-score').textContent = `${data.score} / ${data.maxScore} (${data.percentScore}%)${data.passed ? ' · Passed' : ''}`;
    $('#done-lede').textContent =
      reason === 'TIME_UP' ? 'Time ran out, so your exam was submitted with your saved answers.' : reason === 'WARNING_LIMIT' ? 'Your exam was submitted after the warning limit. Your organizer will review the session.' : 'Your answers were saved and graded. Your organizer will share results.';
    show('done');
  }
  $('#done-quit').addEventListener('click', () => window.tmm.app.quit());

  /* ───────────── Boot ───────────── */

  (async () => {
    S.info = await window.tmm.sys.info();
    document.body.classList.toggle('win', S.info.platform === 'win32');
    $('#app-version').textContent = `v${S.info.appVersion}${S.info.isDev ? ' · dev' : ''}`;
    const net = $('#net-status');
    const pf = await window.tmm.sys.preflight().catch(() => null);
    net.className = `net ${pf?.network?.ok ? 'ok' : 'bad'}`;
    net.querySelector('span:last-child').textContent = pf?.network?.ok ? 'Connected to TestMeMan' : 'No connection to TestMeMan';
    boxes[0].focus();
    if (new URLSearchParams(location.search).has('recovered')) {
      alertModal('The exam app restarted', 'Something went wrong and the app had to restart. Your answers are saved: enter your code again to continue where you left off. The timer kept running.');
    }
  })();
})();
