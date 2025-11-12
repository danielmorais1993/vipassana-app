// src/stores/timerStore.js
import { create } from "zustand";

let intervalId = null;

export const useTimerStore = create((set, get) => ({
  secondsLeft: 0,
  running: false,

  start: (seconds = 20 * 60) => {
    if (get().running) return;
    const secs = Math.max(1, Math.round(seconds));
    set({ secondsLeft: secs, running: true });

    if (intervalId) clearInterval(intervalId);
    intervalId = setInterval(() => {
      const s = get().secondsLeft;
      if (s <= 1) {
        clearInterval(intervalId);
        intervalId = null;
        set({ secondsLeft: 0, running: false });
      } else {
        set({ secondsLeft: s - 1 });
      }
    }, 1000);
  },

  stop: (finalize = false) => {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    if (finalize) {
      set({ secondsLeft: 0, running: false });
    } else {
      set({ running: false });
    }
  },

  setSeconds: (s) => {
    set({ secondsLeft: Math.max(0, Math.round(s)) });
  },

  snapshot: () => {
    const state = get();
    return { secondsLeft: state.secondsLeft, running: state.running };
  },
}));
