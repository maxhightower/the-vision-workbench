import { create } from 'zustand';

type Theme = 'dark' | 'light';

interface UIState {
  theme: Theme;
  spaceId: string | null;
  toggleTheme: () => void;
  openSpace: (id: string | null) => void;
}

export const useUI = create<UIState>((set) => ({
  theme: (localStorage.getItem('wb-theme') as Theme) || 'dark',
  spaceId: null,
  toggleTheme: () =>
    set((s) => {
      const theme: Theme = s.theme === 'dark' ? 'light' : 'dark';
      localStorage.setItem('wb-theme', theme);
      return { theme };
    }),
  openSpace: (id) => set({ spaceId: id }),
}));
