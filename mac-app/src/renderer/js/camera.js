/**
 * TestMeMan macOS Assessment App - Camera & Audio Proctoring Feed
 * Provides candidate video preview and ambient microphone level indicator.
 * Operates strictly with explicit user consent and releases all hardware resources on exam finish.
 */

class CameraProctor {
  constructor() {
    this.stream = null;
    this.audioContext = null;
    this.analyser = null;
    this.animFrameId = null;
    this.isActive = false;
  }

  /**
   * Initializes real-time camera stream and binds to video element.
   * @param {HTMLVideoElement} videoElement
   * @param {HTMLElement} audioLevelBar
   * @returns {Promise<boolean>}
   */
  async startCamera(videoElement, audioLevelBar) {
    this.stopCamera();

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user',
        },
        audio: true,
      });

      if (videoElement) {
        videoElement.srcObject = this.stream;
        videoElement.play().catch(() => {});
      }

      this.initAudioAnalyser(audioLevelBar);
      this.isActive = true;
      return true;
    } catch (err) {
      console.warn('[CameraProctor] Hardware media stream unavailable:', err.message);
      this.createFallbackCanvas(videoElement);
      this.isActive = false;
      return false;
    }
  }

  initAudioAnalyser(audioLevelBar) {
    try {
      if (!this.stream || this.stream.getAudioTracks().length === 0) return;

      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;

      this.audioContext = new AudioCtx();
      const source = this.audioContext.createMediaStreamSource(this.stream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 64;
      source.connect(this.analyser);

      const dataArray = new Uint8Array(this.analyser.frequencyBinCount);

      const updateVolume = () => {
        if (!this.analyser) return;
        this.analyser.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        const percent = Math.min(100, Math.round((avg / 128) * 100));

        if (audioLevelBar) {
          audioLevelBar.style.width = `${Math.max(8, percent)}%`;
        }

        this.animFrameId = requestAnimationFrame(updateVolume);
      };

      updateVolume();
    } catch (e) {
      console.warn('[AudioAnalyser] Error:', e.message);
    }
  }

  createFallbackCanvas(videoElement) {
    if (!videoElement) return;
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 240;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#94a3b8';
    ctx.beginPath();
    ctx.arc(160, 100, 40, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(160, 200, 70, 40, 0, 0, Math.PI);
    ctx.fill();
    ctx.fillStyle = '#64748b';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('CAMERA FEED INACTIVE', 160, 225);

    const stream = canvas.captureStream(5);
    videoElement.srcObject = stream;
    videoElement.play().catch(() => {});
  }

  /**
   * Shuts down camera and audio tracks cleanly, releasing system hardware indicators.
   */
  stopCamera() {
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((track) => {
        track.stop();
      });
      this.stream = null;
    }
    this.isActive = false;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CameraProctor };
} else {
  window.CameraProctor = CameraProctor;
}
