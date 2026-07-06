import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AiDifficulty } from "@dama/shared";
import type { BoardTextureKey, PieceSkin } from "../lib/assets";

export type BoardTheme = "marble" | BoardTextureKey;

export type SettingsStore = {
  /** last-chosen AI strength — flows from the setup screen into the game */
  difficulty: AiDifficulty;
  /** equipped board surface */
  boardTheme: BoardTheme;
  /** equipped piece skin */
  skin: PieceSkin;
  /** sound on/off (placeholder toggle for the settings screen) */
  sound: boolean;

  setDifficulty: (d: AiDifficulty) => void;
  setBoardTheme: (t: BoardTheme) => void;
  setSkin: (s: PieceSkin) => void;
  setSound: (on: boolean) => void;
};

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      difficulty: "normal",
      boardTheme: "marble",
      skin: "default",
      sound: true,
      setDifficulty: (difficulty) => set({ difficulty }),
      setBoardTheme: (boardTheme) => set({ boardTheme }),
      setSkin: (skin) => set({ skin }),
      setSound: (sound) => set({ sound }),
    }),
    { name: "fdr.settings" },
  ),
);
