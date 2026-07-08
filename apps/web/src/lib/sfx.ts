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
    // Master bus with a subtle stereo "hall": dry + two short feedback delays.
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);

    hallIn = ctx.createGain();
    hallIn.gain.value = 0.28; // send level into the hall
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
  g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
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
        // tiny, dry tick when you pick up a piece
        note(ac, { freq: 660, type: "sine", dur: 0.05, gain: 0.05, hall: false });
        break;
      case "move":
        // warm wooden tap — two quick layered blips a fifth apart
        note(ac, { freq: 300, type: "triangle", dur: 0.10, gain: 0.11 });
        note(ac, { freq: 450, type: "sine", start: 0.005, dur: 0.08, gain: 0.06 });
        break;
      case "capture":
        // satisfying thump: noise body + a low pitched-down tone + a bright click
        thunk(ac, { dur: 0.2, cutoff: 1200, gain: 0.3 });
        note(ac, { freq: 180, type: "square", dur: 0.16, gain: 0.11, glideTo: 70 });
        note(ac, { freq: 900, type: "triangle", start: 0.01, dur: 0.06, gain: 0.07, hall: false });
        break;
      case "king":
        // sparkling ascending arpeggio (C-E-G-C) with a shimmer on top
        note(ac, { freq: 523, type: "triangle", start: 0.0, dur: 0.16, gain: 0.13 });
        note(ac, { freq: 659, type: "triangle", start: 0.08, dur: 0.16, gain: 0.13 });
        note(ac, { freq: 784, type: "triangle", start: 0.16, dur: 0.18, gain: 0.13 });
        note(ac, { freq: 1047, type: "sine", start: 0.24, dur: 0.34, gain: 0.14 });
        note(ac, { freq: 1568, type: "sine", start: 0.26, dur: 0.30, gain: 0.05 }); // shimmer
        break;
      case "win":
        // full major fanfare (C-E-G-C-E) with a held root underneath
        note(ac, { freq: 262, type: "sine", start: 0.0, dur: 0.7, gain: 0.06 }); // pad root
        note(ac, { freq: 523, type: "triangle", start: 0.0, dur: 0.16, gain: 0.14 });
        note(ac, { freq: 659, type: "triangle", start: 0.12, dur: 0.16, gain: 0.14 });
        note(ac, { freq: 784, type: "triangle", start: 0.24, dur: 0.16, gain: 0.14 });
        note(ac, { freq: 1047, type: "triangle", start: 0.36, dur: 0.20, gain: 0.15 });
        note(ac, { freq: 1319, type: "sine", start: 0.5, dur: 0.4, gain: 0.12 });
        break;
      case "lose":
        // gentle descending minor sigh (not harsh)
        note(ac, { freq: 415, type: "sine", start: 0.0, dur: 0.3, gain: 0.11, glideTo: 311 });
        note(ac, { freq: 311, type: "sine", start: 0.26, dur: 0.42, gain: 0.11, glideTo: 233 });
        note(ac, { freq: 155, type: "triangle", start: 0.1, dur: 0.6, gain: 0.05 });
        break;
      case "draw":
        // neutral two-note resolve
        note(ac, { freq: 440, type: "sine", start: 0.0, dur: 0.2, gain: 0.12 });
        note(ac, { freq: 587, type: "sine", start: 0.2, dur: 0.34, gain: 0.12 });
        break;
    }
  } catch {
    /* audio is best-effort — never let a sound failure affect the game */
  }
}

// ── Loading-screen ambience ──────────────────────────────────────────────────
// A soft, slowly-evolving pad + a faint shimmer, looped while a LoadingScreen is
// mounted. startLoadingAmbience() returns a stop() you call on unmount.

let ambience: { stop: () => void } | null = null;

/** Begin the loading-screen ambience (idempotent). Returns a stop() function. */
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
      const now = ac.currentTime;
      // Fixed base level; a SEPARATE lfo gain does the breathing so we never fight
      // an automation ramp on the same param.
      const out = ac.createGain();
      out.gain.setValueAtTime(0.0001, now);
      out.gain.exponentialRampToValueAtTime(0.09, now + 0.6); // quick, audible fade-in
      out.connect(ac.destination);

      const oscs: OscillatorNode[] = [];
      const mk = (freq: number, type: OscillatorType, g: number) => {
        const o = ac.createOscillator();
        const gain = ac.createGain();
        o.type = type;
        o.frequency.value = freq;
        gain.gain.value = g;
        o.connect(gain).connect(out);
        o.start(now);
        oscs.push(o);
      };
      mk(110, "sine", 0.6); // A2 root
      mk(110.4, "sine", 0.5); // slight detune → shimmer/beat
      mk(164.8, "triangle", 0.3); // E3 fifth
      mk(330, "sine", 0.1); // faint high sparkle

      // Breathing LFO on its OWN gain node between `out` and destination so it
      // modulates volume without colliding with the fade-in automation above.
      const breathe = ac.createGain();
      breathe.gain.setValueAtTime(1, now);
      out.disconnect();
      out.connect(breathe).connect(ac.destination);
      const lfo = ac.createOscillator();
      const lfoGain = ac.createGain();
      lfo.frequency.value = 0.14; // ~7s cycle
      lfoGain.gain.value = 0.25; // ±25% volume swell
      lfo.connect(lfoGain).connect(breathe.gain);
      lfo.start(now);
      oscs.push(lfo);

      realStop = () => {
        try {
          const t = ac.currentTime;
          out.gain.cancelScheduledValues(t);
          out.gain.setValueAtTime(Math.max(0.0001, out.gain.value), t);
          out.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
          for (const o of oscs) o.stop(t + 0.45);
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
