import { create } from 'zustand';

const initialMode = localStorage.getItem('voting_theme') === 'dark' ? 'dark' : 'light';

export const useThemeStore = create((set) => ({
  mode: initialMode,
  toggleTheme: () => set((prev) => {
    const mode = prev.mode === 'light' ? 'dark' : 'light';
    localStorage.setItem('voting_theme', mode);
    return { mode };
  }),
}));
