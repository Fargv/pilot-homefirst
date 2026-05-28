/**
 * notificationService.js — Timer completion notifications.
 *
 * Architecture abstraction for future extension to push notifications.
 * Currently provides: Web Audio API sound, device vibration, toast.
 *
 * Extension points (commented out):
 *   showBrowserNotification() — add when push permission flow is implemented
 */

let _audioCtx = null;

function getAudioCtx() {
  if (_audioCtx) return _audioCtx;
  try {
    _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  } catch {}
  return _audioCtx;
}

/**
 * Prime AudioContext after a user gesture (required by browser policy).
 * Call this on the first button tap in the cooking UI.
 */
export function primeAudio() {
  const ctx = getAudioCtx();
  if (ctx && ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }
}

/**
 * Play a soft 3-note "ding" notification using Web Audio API.
 */
export function playTimerSound() {
  const ctx = getAudioCtx();
  if (!ctx) return;

  const notes = [
    { freq: 880,  delay: 0,    duration: 0.35 },
    { freq: 1100, delay: 0.28, duration: 0.35 },
    { freq: 880,  delay: 0.56, duration: 0.5  },
  ];

  const now = ctx.currentTime;
  for (const { freq, delay, duration } of notes) {
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = freq;
    osc.type = "sine";
    gain.gain.setValueAtTime(0, now + delay);
    gain.gain.linearRampToValueAtTime(0.3, now + delay + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + delay + duration);
    osc.start(now + delay);
    osc.stop(now + delay + duration + 0.05);
  }
}

/**
 * Vibrate device if the API is available (Android browsers, some iOS).
 */
export function vibrateIfSupported(pattern = [200, 100, 200]) {
  try {
    if ("vibrate" in navigator) navigator.vibrate(pattern);
  } catch {}
}

/**
 * Fire all timer-completion notifications.
 * Lazy-imports triggerMilestone to avoid circular dependency.
 */
export function notifyTimerComplete(stepText = "") {
  playTimerSound();
  vibrateIfSupported();

  import("../hooks/useRewardAnimation.js")
    .then(({ triggerMilestone }) => {
      triggerMilestone({
        title:    "⏰ ¡Tiempo!",
        subtitle: stepText ? stepText.slice(0, 45) : "Temporizador completado",
        icon:     "⏰",
        variant:  "spark",
      });
    })
    .catch(() => {});

  // Future:
  // showBrowserNotification("⏰ Temporizador", stepText || "Tiempo completado");
}

/**
 * Soft toast when a running timer is automatically paused
 * because the user started a new timer on a different step.
 * No sound or vibration — this is informational only.
 */
export function notifyTimerAutoPaused() {
  import("../hooks/useRewardAnimation.js")
    .then(({ triggerMilestone }) => {
      triggerMilestone({
        title:    "⏸ Temporizador pausado",
        subtitle: "Se ha pausado el temporizador anterior",
        icon:     "⏸",
        variant:  "spark",
      });
    })
    .catch(() => {});
}
