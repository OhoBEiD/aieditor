export interface ThemeColors {
  primary: string;
  secondary: string;
  background: string;
  text: string;
  accent: string;
}

export interface Theme {
  name: string;
  colors: ThemeColors;
}

export const themes: Record<string, Theme> = {
  light: {
    name: 'light',
    colors: {
      primary: '#3b82f6',
      secondary: '#8b5cf6',
      background: '#ffffff',
      text: '#1f2937',
      accent: '#10b981'
    }
  },
  dark: {
    name: 'dark',
    colors: {
      primary: '#60a5fa',
      secondary: '#a78bfa',
      background: '#111827',
      text: '#f9fafb',
      accent: '#34d399'
    }
  },
  ocean: {
    name: 'ocean',
    colors: {
      primary: '#0ea5e9',
      secondary: '#06b6d4',
      background: '#0c4a6e',
      text: '#e0f2fe',
      accent: '#22d3ee'
    }
  }
};

export type ThemeName = keyof typeof themes;
