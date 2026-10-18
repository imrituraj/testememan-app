/**
 * TestMeMan Secure Exam: on-device AI proctoring.
 *
 * Everything runs locally with @vladmandic/human (models bundled with the app, nothing is sent to a third party):
 *   face detection + mesh + iris  → face present / how many / head pose (looking away)
 *   faceres embedding             → identity: live face vs registration photo
 *   antispoof + liveness          → photo / screen spoof detection
 *   centernet objects             → mobile phone in view
 * plus a microphone level meter for sustained voices / noise.
 */

/* global Human */
window.Proctor = (() => {
  const HUMAN_CONFIG = {
    modelBasePath: 'app://exam/vendor/human/models/',
    backend: 'webgl',
    async: true,
    warmup: 'face',
    cacheSensitivity: 0,
    debug: false,
    filter: { enabled: true, equalization: false, flip: false },
    face: {
      enabled: true,
      detector: { rotation: true, maxDetected: 4, minConfidence: 0.45, return: false },
      mesh: { enabled: true },
      iris: { enabled: true },
      description: { enabled: true },
      emotion: { enabled: false },
      antispoof: { enabled: true },
      liveness: { enabled: true },
    },
    body: { enabled: false },
    hand: { enabled: false },
    gesture: { enabled: false },
    segmentation: { enabled: false },
    object: { enabled: false, modelPath: 'centernet.json', minConfidence: 0.4, maxDetected: 5 },
  };

  const FACE_MIN_SCORE = 0.6;
  const YAW_AWAY = 0.6; // ≈ 35°
  const PITCH_AWAY = 0.55;
  const COOLDOWN_MS = 20000;

  let human = null;
  let stream = null;
  let video = null;
  let audioCtx = null;
  let analyser = null;
  let audioBuf = null;
  let monitor = null;

  async function init(onProgress = () => {}) {
    if (human) return human;
    onProgress('Loading AI models');
    human = new Human.Human(HUMAN_CONFIG);
    await human.load();
    onProgress('Warming up');
    await human.warmup();
    onProgress('Ready');
    return human;
  }

  async function startCamera(videoEl) {
    if (!stream || !stream.active) {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 960 }, height: { ideal: 720 }, facingMode: 'user', frameRate: { ideal: 24 } },
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      setupAudio();
    }
    attach(videoEl);
    return stream;
  }

  /** Show the same camera stream in another <video> (the exam's camera tile) */
  function attach(videoEl) {
    if (!stream) return;
    videoEl.srcObject = stream;
    videoEl.muted = true;
    videoEl.playsInline = true;
    videoEl.play().catch(() => {});
    video = videoEl;
  }

  function setupAudio() {
    try {
      audioCtx = new AudioContext();
      const src = audioCtx.createMediaStreamSource(stream);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 1024;
      audioBuf = new Float32Array(analyser.fftSize);
      src.connect(analyser);
    } catch {
      analyser = null;
    }
  }

  /** 0..1 microphone loudness (RMS, scaled) */
  function micLevel() {
    if (!analyser) return 0;
    analyser.getFloatTimeDomainData(audioBuf);
    let sum = 0;
    for (let i = 0; i < audioBuf.length; i++) sum += audioBuf[i] * audioBuf[i];
    return Math.min(1, Math.sqrt(sum / audioBuf.length) * 6);
  }

  function cameraOk() {
    return !!stream && stream.getVideoTracks().some((t) => t.readyState === 'live' && t.enabled);
  }

  function stopCamera() {
    stopMonitor();
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
    if (audioCtx) audioCtx.close().catch(() => {});
    audioCtx = null;
    analyser = null;
  }

  function shapeFace(f) {
    const angle = f.rotation?.angle || {};
    return {
      score: f.score || 0,
      box: f.boxRaw || [0, 0, 0, 0],
      embedding: f.embedding || null,
      real: typeof f.real === 'number' ? f.real : null,
      live: typeof f.live === 'number' ? f.live : null,
      yaw: angle.yaw || 0,
      pitch: angle.pitch || 0,
      roll: angle.roll || 0,
    };
  }

  /** One analysis of the current camera frame (or an image/canvas) */
  async function analyze(input = video, { objects = false } = {}) {
    if (!human || !input) return { faces: [], objects: [] };
    const res = await human.detect(input, { object: { enabled: objects } });
    return {
      faces: (res.face || []).filter((f) => (f.score || 0) >= FACE_MIN_SCORE).map(shapeFace),
      objects: (res.object || []).map((o) => ({ label: o.label, score: o.score })),
    };
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Could not load the photo'));
      img.src = src;
    });
  }

  /** Embedding of the one face in a photo (the registration selfie). */
  async function embeddingFromPhoto(dataUrl) {
    const img = await loadImage(dataUrl);
    const { faces } = await analyze(img);
    if (faces.length === 0) return { error: 'NO_FACE' };
    const main = faces.sort((a, b) => b.box[2] * b.box[3] - a.box[2] * a.box[3])[0];
    return main.embedding ? { embedding: main.embedding } : { error: 'NO_EMBEDDING' };
  }

  function similarity(a, b) {
    if (!a || !b || !human) return 0;
    return human.match.similarity(a, b);
  }

  /** JPEG of the current camera frame, sized to keep uploads small */
  function capture({ width = 480, quality = 0.72 } = {}) {
    if (!video || !video.videoWidth) return null;
    const h = Math.round((video.videoHeight / video.videoWidth) * width);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = h;
    canvas.getContext('2d').drawImage(video, 0, 0, width, h);
    return canvas.toDataURL('image/jpeg', quality);
  }

  /**
   * Continuous proctoring during the exam.
   *  opts: { references: [embedding…], threshold, continuousMatch, multipleFaces, lookAway, noiseDetection, snapshotEverySec }
   *  onViolation({ type, detail, snapshotKind, match, faces, warn })   (each type at most once per COOLDOWN_MS)
   *  onStatus({ faces, identity, gaze, mic, camera, phone })          (for the live status chips)
   *  onSnapshot({ kind, faces, match })                               (periodic snapshots)
   */
  function startMonitor(opts, { onViolation, onStatus, onSnapshot }) {
    stopMonitor();
    const st = {
      running: true,
      tick: 0,
      noFaceSince: null,
      multiSince: null,
      awaySince: null,
      noiseSince: null,
      phoneStreak: 0,
      mismatchStreak: 0,
      lastMatchAt: 0,
      lastMatch: null,
      lastSnapshotAt: Date.now(),
      lastFired: {},
      timer: null,
      audioTimer: null,
    };
    monitor = st;

    const fire = (type, detail, extra = {}) => {
      const now = Date.now();
      if (st.lastFired[type] && now - st.lastFired[type] < COOLDOWN_MS) return;
      st.lastFired[type] = now;
      onViolation?.({ type, detail, ...extra });
    };

    const bestMatch = (embedding) => Math.max(0, ...(opts.references || []).map((r) => similarity(r, embedding)));

    const loop = async () => {
      if (!st.running) return;
      const t0 = Date.now();
      try {
        if (!cameraOk()) {
          fire('CAMERA_LOST', 'The camera stopped', { snapshotKind: null });
          onStatus?.({ camera: false, faces: 0, identity: 'unknown', gaze: 'unknown', mic: micLevel(), phone: false });
        } else {
          st.tick++;
          const checkObjects = st.tick % 4 === 0;
          const { faces, objects } = await analyze(video, { objects: checkObjects });
          const now = Date.now();

          // Face present?
          if (faces.length === 0) {
            st.noFaceSince ??= now;
            if (now - st.noFaceSince > 5000) fire('NO_FACE', 'No face in view for 5 seconds', { snapshotKind: 'NO_FACE', faces: 0 });
          } else st.noFaceSince = null;

          // Someone else in view?
          if (opts.multipleFaces && faces.length > 1) {
            st.multiSince ??= now;
            if (now - st.multiSince > 2500) fire('MULTIPLE_FACES', `${faces.length} faces in view`, { snapshotKind: 'MULTI_FACE', faces: faces.length });
          } else st.multiSince = null;

          const main = faces.length ? faces.slice().sort((a, b) => b.box[2] * b.box[3] - a.box[2] * a.box[3])[0] : null;

          // Looking away (sustained head turn)
          let gaze = 'ok';
          if (main && opts.lookAway && (Math.abs(main.yaw) > YAW_AWAY || Math.abs(main.pitch) > PITCH_AWAY)) {
            gaze = 'away';
            st.awaySince ??= now;
            if (now - st.awaySince > 5000) fire('LOOK_AWAY', 'Looked away from the screen for 5 seconds', { snapshotKind: 'LOOK_AWAY', faces: faces.length });
          } else st.awaySince = null;

          // Same person? (every ~10 s; two misses in a row before it counts)
          if (main && opts.continuousMatch && main.embedding && (opts.references || []).length && now - st.lastMatchAt > 10000) {
            st.lastMatchAt = now;
            st.lastMatch = bestMatch(main.embedding);
            if (st.lastMatch < opts.threshold) {
              st.mismatchStreak++;
              if (st.mismatchStreak >= 2) {
                fire('FACE_MISMATCH', `Face match ${Math.round(st.lastMatch * 100)}%`, { snapshotKind: 'MISMATCH', match: st.lastMatch, faces: faces.length });
              }
            } else st.mismatchStreak = 0;
          }

          // Phone in view
          if (checkObjects) {
            const phone = objects.some((o) => o.label === 'cell phone' && o.score >= 0.45);
            st.phoneStreak = phone ? st.phoneStreak + 1 : 0;
            if (st.phoneStreak >= 2) fire('PHONE_DETECTED', 'A mobile phone is visible', { snapshotKind: 'PHONE', faces: faces.length });
          }

          const identity = st.lastMatch === null ? 'checking' : st.lastMatch >= opts.threshold ? 'ok' : 'mismatch';
          onStatus?.({ camera: true, faces: faces.length, identity, match: st.lastMatch, gaze, mic: micLevel(), phone: st.phoneStreak > 0 });

          if (opts.snapshotEverySec && now - st.lastSnapshotAt > opts.snapshotEverySec * 1000) {
            st.lastSnapshotAt = now;
            onSnapshot?.({ kind: 'PERIODIC', faces: faces.length, match: st.lastMatch });
          }
        }
      } catch (err) {
        console.warn('[proctor] tick failed', err);
      }
      // ~1 analysis per second, never overlapping
      const wait = Math.max(150, 1000 - (Date.now() - t0));
      if (st.running) st.timer = setTimeout(loop, wait);
    };

    // Voices / noise: sustained loudness over 2 s
    if (opts.noiseDetection) {
      st.audioTimer = setInterval(() => {
        const lvl = micLevel();
        const now = Date.now();
        if (lvl > 0.22) {
          st.noiseSince ??= now;
          if (now - st.noiseSince > 2000) fire('NOISE', 'Sustained talking or noise', { snapshotKind: null, warn: false });
        } else st.noiseSince = null;
      }, 250);
    }

    loop();
  }

  function stopMonitor() {
    if (!monitor) return;
    monitor.running = false;
    clearTimeout(monitor.timer);
    clearInterval(monitor.audioTimer);
    monitor = null;
  }

  return { init, startCamera, attach, stopCamera, analyze, embeddingFromPhoto, similarity, capture, micLevel, cameraOk, startMonitor, stopMonitor };
})();
