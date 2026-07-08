/**
 * sfx — tiny Web Audio sound effects for the board game, synthesized in-code (no
 * asset files). Gated by the settings `sound` flag (read at call time). A single
 * lazily-created AudioContext is reused; the first sound after a user gesture
 * resumes it (browsers block audio until the user interacts).
 *
 * Sounds: move (soft click), capture (heavier thunk), king (rising chime),
 * win (bright arpeggio), lose (falling tone), draw (neutral two-note).
 */

import { useSettingsStore } from "../stores/settingsStore";

export type Sfx = "move" | "capture" | "king" | "win" | "lose" | "draw";

let ctx: AudioContext | null = null;

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
  }
  // Autoplay policy: the context starts suspended until a user gesture; resume it.
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/** One oscillator note with a short percussive envelope. */
function note(ac: AudioContext, opts: { freq: number; type?: OscillatorType; start: number; dur: number; gain?: number; glideTo?: number }) {
  const { freq, type = "sine", start, dur, gain = 0.14, glideTo } = opts;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ac.currentTime + start);
  if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, ac.currentTime + start + dur);
  // Fast attack, exponential decay — a clean, non-harsh blip.
  g.gain.setValueAtTime(0.0001, ac.currentTime + start);
  g.gain.exponentialRampToValueAtTime(gain, ac.currentTime + start + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + start + dur);
  osc.connect(g).connect(ac.destination);
  osc.start(ac.currentTime + start);
  osc.stop(ac.currentTime + start + dur + 0.02);
}

/** Short filtered-noise burst — gives the capture a woody "thunk". */
function thunk(ac: AudioContext) {
  const dur = 0.16;
  const buffer = ac.createBuffer(1, Math.floor(ac.sampleRate * dur), ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    // decaying noise
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 3);
  }
  const src = ac.createBufferSource();
  src.buffer = buffer;
  const filter = ac.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 900;
  const g = ac.createGain();
  g.gain.value = 0.22;
  src.connect(filter).connect(g).connect(ac.destination);
  src.start();
}

/** Play a named effect, respecting the user's Sound Effects toggle. */
export function playSfx(name: Sfx) {
  // Read the live setting each call — no stale closure, no play when muted.
  if (!useSettingsStore.getState().sound) return;
  const ac = audio();
  if (!ac) return;
  try {
    switch (name) {
      case "move":
        note(ac, { freq: 320, type: "triangle", start: 0, dur: 0.09, gain: 0.10 });
        break;
      case "capture":
        thunk(ac);
        note(ac, { freq: 160, type: "square", start: 0, dur: 0.12, gain: 0.10, glideTo: 90 });
        break;
      case "king":
        // rising three-note chime
        note(ac, { freq: 523, type: "sine", start: 0.0, dur: 0.14, gain: 0.13 });
        note(ac, { freq: 659, type: "sine", start: 0.09, dur: 0.14, gain: 0.13 });
        note(ac, { freq: 880, type: "sine", start: 0.18, dur: 0.22, gain: 0.14 });
        break;
      case "win":
        note(ac, { freq: 523, type: "triangle", start: 0.0, dur: 0.14, gain: 0.14 });
        note(ac, { freq: 659, type: "triangle", start: 0.11, dur: 0.14, gain: 0.14 });
        note(ac, { freq: 784, type: "triangle", start: 0.22, dur: 0.16, gain: 0.14 });
        note(ac, { freq: 1047, type: "triangle", start: 0.34, dur: 0.30, gain: 0.15 });
        break;
      case "lose":
        note(ac, { freq: 392, type: "sawtooth", start: 0.0, dur: 0.22, gain: 0.11, glideTo: 262 });
        note(ac, { freq: 262, type: "sawtooth", start: 0.20, dur: 0.34, gain: 0.11, glideTo: 175 });
        break;
      case "draw":
        note(ac, { freq: 440, type: "sine", start: 0.0, dur: 0.18, gain: 0.12 });
        note(ac, { freq: 440, type: "sine", start: 0.20, dur: 0.26, gain: 0.12 });
        break;
    }
  } catch {
    /* audio is best-effort — never let a sound failure affect the game */
  }
}
