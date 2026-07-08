/**
 * sfx — Web Audio sound effects for the board game + a loading ambience loop,
 * synthesized in-code (no asset files). Everything is gated by the settings
 * `sound` flag (read at call time). A single AudioContext is reused; it resumes
 * on the first user gesture (browsers block audio until then).
 *
 * The one-shots route through a shared master gain + a light "hall" (a short
 * feedback delay) so notes feel warmer and less dry than raw oscillators.
 */

import { useSettingsStore } from "../stores/settingsStore";

export type Sfx = "move" | "capture" | "king" | "win" | "lose" | "draw" | "select";

let ctx: AudioContext | null = null;
let master: GainNode | null = null; // one-shot bus (post: → hall + dry → out)
let hallIn: GainNode | null = null; // send into the delay "hall"

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
    } catch {
      return null;
    }
    // Master bus: gain → limiter → out. A DynamicsCompressor acting as a limiter
    // lets us push levels HARD (punchy, arcade-loud) without clipping/distortion.
    master = ctx.createGain();
    master.gain.value = 2.4; // hot — the limiter tames peaks
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.knee.value = 6;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.12;
    master.connect(limiter);
    limiter.connect(ctx.destination);

    hallIn = ctx.createGain();
    hallIn.gain.value = 0.22; // send level into the hall (less wet = punchier)
    const d1 = ctx.createDelay();
    d1.delayTime.value = 0.09;
    const d2 = ctx.createDelay();
    d2.delayTime.value = 0.14;
    const fb = ctx.createGain();
    fb.gain.value = 0.32; // decays quickly — a room, not an echo
    const wet = ctx.createGain();
    wet.gain.value = 0.5;
    hallIn.connect(d1);
    hallIn.connect(d2);
    d1.connect(fb);
    d2.connect(fb);
    fb.connect(d1);
    fb.connect(d2);
    d1.connect(wet);
    d2.connect(wet);
    wet.connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/**
 * Unlock audio on the FIRST real user gesture anywhere in the app. Browsers only
 * honor AudioContext.resume() inside a user-activation window — a later
 * route-change resume() (e.g. when a LoadingScreen mounts) is ignored, which is
 * why the loading ambience was silent. Calling this once on app boot primes the
 * context so every subsequent sound just works. Idempotent.
 */
let unlockAttached = false;
export function initAudioUnlock() {
  if (unlockAttached || typeof window === "undefined") return;
  unlockAttached = true;
  const unlock = () => {
    const ac = audio(); // creates + resumes inside the gesture
    // A silent 1-sample blip forces iOS/Safari to fully "start" the context.
    if (ac) {
      try {
        const b = ac.createBufferSource();
        b.buffer = ac.createBuffer(1, 1, ac.sampleRate);
        b.connect(ac.destination);
        b.start(0);
      } catch {
        /* ignore */
      }
    }
    if (ac && ac.state === "running") {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      window.removeEventListener("touchstart", unlock);
    }
  };
  window.addEventListener("pointerdown", unlock, { passive: true });
  window.addEventListener("keydown", unlock);
  window.addEventListener("touchstart", unlock, { passive: true });
}

/** A single voiced note: osc → gain (perc envelope) → master (+hall send). */
function note(ac: AudioContext, o: { freq: number; type?: OscillatorType; start?: number; dur: number; gain?: number; glideTo?: number; hall?: boolean }) {
  const { freq, type = "sine", start = 0, dur, gain = 0.14, glideTo, hall = true } = o;
  const t = ac.currentTime + start;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (glideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, glideTo), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.004); // sharp attack = punch
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g);
  if (master) g.connect(master);
  if (hall && hallIn) g.connect(hallIn);
  osc.start(t);
  osc.stop(t + dur + 0.03);
}

/** A short, filtered noise burst — the woody body of a capture. */
function thunk(ac: AudioContext, o: { dur?: number; cutoff?: number; gain?: number } = {}) {
  const { dur = 0.18, cutoff = 1100, gain = 0.28 } = o;
  const buffer = ac.createBuffer(1, Math.floor(ac.sampleRate * dur), ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 3.2);
  const src = ac.createBufferSource();
  src.buffer = buffer;
  const filter = ac.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = cutoff;
  const g = ac.createGain();
  g.gain.value = gain;
  src.connect(filter).connect(g);
  if (master) g.connect(master);
  if (hallIn) g.connect(hallIn);
  src.start();
}

/** Play a named effect, respecting the Sound Effects toggle. */
export function playSfx(name: Sfx) {
  if (!useSettingsStore.getState().sound) return;
  const ac = audio();
  if (!ac) return;
  try {
    switch (name) {
      case "select":
        // crisp, snappy pick-up tick
        note(ac, { freq: 700, type: "square", dur: 0.05, gain: 0.28, hall: false });
        break;
      case "move":
        // punchy "tick-tock" snap — bright square blip over a woody body
        note(ac, { freq: 520, type: "square", dur: 0.07, gain: 0.42, hall: false });
        note(ac, { freq: 260, type: "triangle", dur: 0.12, gain: 0.4, glideTo: 200 });
        break;
      case "capture":
        // BIG impact: punchy noise smack + a deep sub boom + a bright metallic clank
        thunk(ac, { dur: 0.26, cutoff: 2200, gain: 0.85 });
        note(ac, { freq: 220, type: "sawtooth", dur: 0.22, gain: 0.55, glideTo: 55 }); // sub drop
        note(ac, { freq: 1400, type: "square", start: 0.0, dur: 0.07, gain: 0.3, hall: false }); // clank
        break;
      case "king":
        // triumphant power arpeggio — sawtooth stabs (C-E-G-C) + a shimmer
        note(ac, { freq: 523, type: "sawtooth", start: 0.0, dur: 0.14, gain: 0.4 });
        note(ac, { freq: 659, type: "sawtooth", start: 0.07, dur: 0.14, gain: 0.4 });
        note(ac, { freq: 784, type: "sawtooth", start: 0.14, dur: 0.16, gain: 0.42 });
        note(ac, { freq: 1047, type: "square", start: 0.22, dur: 0.34, gain: 0.44 });
        note(ac, { freq: 1568, type: "sine", start: 0.24, dur: 0.30, gain: 0.16 }); // shimmer
        break;
      case "win":
        // BIG victory fanfare (C-E-G-C-E) — sawtooth brass over a fat held root
        note(ac, { freq: 131, type: "sawtooth", start: 0.0, dur: 0.9, gain: 0.24 }); // fat bass root
        note(ac, { freq: 523, type: "sawtooth", start: 0.0, dur: 0.16, gain: 0.42 });
        note(ac, { freq: 659, type: "sawtooth", start: 0.12, dur: 0.16, gain: 0.42 });
        note(ac, { freq: 784, type: "sawtooth", start: 0.24, dur: 0.16, gain: 0.42 });
        note(ac, { freq: 1047, type: "square", start: 0.36, dur: 0.22, gain: 0.44 });
        note(ac, { freq: 1319, type: "square", start: 0.5, dur: 0.5, gain: 0.4 });
        break;
      case "lose":
        // dramatic descending "defeat" — heavy sawtooth downward slides
        note(ac, { freq: 392, type: "sawtooth", start: 0.0, dur: 0.32, gain: 0.4, glideTo: 262 });
        note(ac, { freq: 262, type: "sawtooth", start: 0.28, dur: 0.5, gain: 0.4, glideTo: 130 });
        note(ac, { freq: 98, type: "square", start: 0.1, dur: 0.7, gain: 0.28 }); // ominous low
        break;
      case "draw":
        // firm neutral two-note stab
        note(ac, { freq: 440, type: "square", start: 0.0, dur: 0.2, gain: 0.38 });
        note(ac, { freq: 587, type: "square", start: 0.2, dur: 0.36, gain: 0.4 });
        break;
    }
  } catch {
    /* audio is best-effort — never let a sound failure affect the game */
  }
}

// ── Loading-screen music ─────────────────────────────────────────────────────
// A looping battle-theme MP3 (public/assets/audio/loading-theme.mp3, a ~10s clip)
// played while a LoadingScreen is mounted, then faded out on unmount. Uses an
// HTMLAudioElement (simpler + more reliable for a real track than Web Audio).

const LOADING_TRACK = "/assets/audio/loading-theme.mp3";
let ambience: { stop: () => void } | null = null;

/** Begin the loading-screen music (idempotent). Returns a stop() function. */
export function startLoadingAmbience(): () => void {
  if (!useSettingsStore.getState().sound) return () => {};
  if (typeof window === "undefined") return () => {};
  ambience?.stop(); // never stack

  let stopped = false;
  const el = new Audio(LOADING_TRACK);
  el.loop = true;
  el.volume = 0; // fade in
  el.preload = "auto";

  // Fade the volume via a small interval (HTMLAudio has no envelope).
  let fade: number | null = null;
  const rampTo = (target: number, ms: number, onDone?: () => void) => {
    if (fade) window.clearInterval(fade);
    const from = el.volume;
    const t0 = performance.now();
    fade = window.setInterval(() => {
      const k = Math.min(1, (performance.now() - t0) / ms);
      el.volume = Math.max(0, Math.min(1, from + (target - from) * k));
      if (k >= 1) {
        if (fade) window.clearInterval(fade);
        fade = null;
        onDone?.();
      }
    }, 30);
  };

  // play() can reject if audio isn't unlocked yet; retry once shortly after (by
  // then the gesture-unlock has usually run). Best-effort — never throws.
  const tryPlay = () => {
    el.play()
      .then(() => rampTo(0.75, 400))
      .catch(() => {
        if (!stopped) window.setTimeout(() => el.play().then(() => rampTo(0.75, 400)).catch(() => {}), 350);
      });
  };
  tryPlay();

  const publicStop = () => {
    stopped = true;
    // Fade out, then pause + release.
    rampTo(0, 250, () => {
      try {
        el.pause();
        el.src = "";
      } catch {
        /* ignore */
      }
    });
    ambience = null;
  };
  ambience = { stop: publicStop };
  return publicStop;
}

/** Stop any playing loading music immediately-ish (fade out). */
export function stopLoadingAmbience() {
  ambience?.stop();
}
