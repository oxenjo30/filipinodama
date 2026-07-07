import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AiDifficulty } from "@dama/shared";
import type { BoardTextureKey, PieceSkin } from "../lib/assets";

export type BoardTheme = "marble" | BoardTextureKey;

/** Board surface option shown on the settings segmented control. */
export type BoardPref = "Marble" | "Aubergine" | "Walnut";
/** Piece-style option shown on the settings segmented control. */
export type PiecePref = "Gem" | "Classic" | "Flat";
/** Animation-speed option shown on the settings segmented control. */
export type AnimPref = "Off" | "Normal" | "Fast";

export type SettingsStore = {
  /** last-chosen AI strength — flows from the setup screen into the game */
  difficulty: AiDifficulty;
  /** equipped board surface */
  boardTheme: BoardTheme;
  /** equipped piece skin */
  skin: PieceSkin;
  /** sound effects on/off (settings screen toggle) */
  sound: boolean;
  /** background music on/off (settings screen toggle) */
  music: boolean;
  /** show move hints on/off (settings screen toggle) */
  hints: boolean;
  /** board theme label for the settings segmented control */
  boardPref: BoardPref;
  /** piece style label for the settings segmented control */
  piecePref: PiecePref;
  /** animation speed for the settings segmented control */
  animPref: AnimPref;

  setDifficulty: (d: AiDifficulty) => void;
  setBoardTheme: (t: BoardTheme) => void;
  setSkin: (s: PieceSkin) => void;
  setSound: (on: boolean) => void;
  setMusic: (on: boolean) => void;
  setHints: (on: boolean) => void;
  setBoardPref: (b: BoardPref) => void;
  setPiecePref: (p: PiecePref) => void;
  setAnimPref: (a: AnimPref) => void;
};

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      difficulty: "normal",
      boardTheme: "marble",
      skin: "default",
      sound: true,
      music: true,
      hints: true,
      boardPref: "Marble",
      piecePref: "Gem",
      animPref: "Normal",
      setDifficulty: (difficulty) => set({ difficulty }),
      setBoardTheme: (boardTheme) => set({ boardTheme }),
      setSkin: (skin) => set({ skin }),
      setSound: (sound) => set({ sound }),
      setMusic: (music) => set({ music }),
      setHints: (hints) => set({ hints }),
      setBoardPref: (boardPref) => set({ boardPref }),
      setPiecePref: (piecePref) => set({ piecePref }),
      setAnimPref: (animPref) => set({ animPref }),
    }),
    { name: "fdr.settings" },
  ),
);
