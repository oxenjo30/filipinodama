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

// ── War-drum voices (for the loading-screen loop) ────────────────────────────
// Deep, resonant tribal toms — a booming battle drum. Each schedules itself at
// absolute time `t` on the destination node.

/**
 * warTom — a big membrane hit: a low pitch-dropping sine "boom" + a burst of
 * band-passed noise for the skin/attack, with a long resonant tail. `freq` sets
 * the drum size (lower = bigger/deeper).
 */
function warTom(ac: AudioContext, dest: AudioNode, t: number, freq: number, gain = 1) {
  // Tonal boom
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(freq * 1.6, t);
  o.frequency.exponentialRampToValueAtTime(freq, t + 0.06);
  o.frequency.exponentialRampToValueAtTime(freq * 0.7, t + 0.35);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42); // long resonant tail
  o.connect(g).connect(dest);
  o.start(t);
  o.stop(t + 0.45);

  // Skin attack — short band-passed noise thwack
  const dur = 0.12;
  const buf = ac.createBuffer(1, Math.floor(ac.sampleRate * dur), ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2.5);
  const src = ac.createBufferSource();
  src.buffer = buf;
  const bp = ac.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = freq * 3;
  bp.Q.value = 0.7;
  const ng = ac.createGain();
  ng.gain.setValueAtTime(gain * 0.5, t);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(bp).connect(ng).connect(dest);
  src.start(t);
}

// ── Loading-screen drum loop ─────────────────────────────────────────────────
// A driving drum groove looped while a LoadingScreen is mounted, scheduled with
// a look-ahead so it stays tight. startLoadingAmbience() returns a stop().

let ambience: { stop: () => void } | null = null;

/** Begin the loading-screen drum loop (idempotent). Returns a stop() function. */
export function startLoadingAmbience(): () => void {
  if (!useSettingsStore.getState().sound) return () => {};
  const ac = audio();
  if (!ac) return () => {};
  // If one is already playing, stop it first (avoid stacking).
  ambience?.stop();

  // A caller-visible stop that also cancels a not-yet-started ambience (in case
  // the loader unmounts before the context finishes resuming).
  let stopped = false;
  let realStop: (() => void) | null = null;
  const publicStop = () => {
    stopped = true;
    realStop?.();
    ambience = null;
  };
  ambience = { stop: publicStop };

  // The context may be SUSPENDED (autoplay policy) — scheduling against a frozen
  // clock produces silence. Resume first, THEN build the graph, so `currentTime`
  // is actually advancing.
  const build = () => {
    if (stopped) return;
    try {
      // Bus: drums → gain → limiter → out. Fade in quickly so it kicks in.
      const bus = ac.createGain();
      bus.gain.setValueAtTime(0.0001, ac.currentTime);
      bus.gain.exponentialRampToValueAtTime(0.9, ac.currentTime + 0.25);
      const lim = ac.createDynamicsCompressor();
      lim.threshold.value = -8;
      lim.ratio.value = 12;
      lim.attack.value = 0.002;
      lim.release.value = 0.12;
      bus.connect(lim).connect(ac.destination);

      // WAR-DRUM battle rhythm. A driving 8-step (eighth-note) marching pattern,
      // BPM ~92 — heavy and relentless, like drums before a battle. Only deep toms:
      // BIG = the large low war drum, MID = a smaller accent tom. The classic
      // "BOOM ... boom-boom BOOM" call, repeated, builds tension.
      const bpm = 92;
      const step = 60 / bpm / 2; // seconds per eighth note
      //             1  &  2  &  3  &  4  &
      const BIG = [1, 0, 0, 0, 1, 0, 1, 0]; // deep war drum on 1, 3, and the "4"
      const MID = [0, 0, 1, 1, 0, 0, 0, 1]; // mid-tom fills between the big hits
      const BIG_FREQ = 58; // deep boom
      const MID_FREQ = 98; // smaller tom

      let nextStep = 0;
      let nextTime = ac.currentTime + 0.08;

      // Look-ahead scheduler: every 25ms, schedule any steps due within 140ms.
      const timer = window.setInterval(() => {
        if (stopped) return;
        const horizon = ac.currentTime + 0.14;
        while (nextTime < horizon) {
          const i = nextStep % 8;
          const t = nextTime;
          // A touch of human swing on the off-beats keeps it from sounding robotic.
          const swing = i % 2 === 1 ? step * 0.06 : 0;
          if (BIG[i]) warTom(ac, bus, t + swing, BIG_FREQ, i === 0 ? 1.3 : 1.05); // downbeat loudest
          if (MID[i]) warTom(ac, bus, t + swing, MID_FREQ, 0.75);
          nextStep++;
          nextTime += step;
        }
      }, 25);

      realStop = () => {
        try {
          window.clearInterval(timer);
          const t = ac.currentTime;
          bus.gain.cancelScheduledValues(t);
          bus.gain.setValueAtTime(Math.max(0.0001, bus.gain.value), t);
          bus.gain.exponentialRampToValueAtTime(0.0001, t + 0.25); // quick fade tail
        } catch {
          /* ignore */
        }
      };
    } catch {
      /* ignore */
    }
  };

  try {
    if (ac.state === "suspended") {
      void ac.resume().then(build).catch(() => {});
    } else {
      build();
    }
  } catch {
    build();
  }
  return publicStop;
}

/** Stop any playing loading ambience immediately-ish (fade out). */
export function stopLoadingAmbience() {
  ambience?.stop();
}
