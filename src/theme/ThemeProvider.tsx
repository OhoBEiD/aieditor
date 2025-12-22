import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { themes, ThemeName, Theme } from './themeConfig';

interface ThemeContextType {
  currentTheme: Theme;
  themeName: ThemeName;
  setTheme: (themeName: ThemeName) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
};

interface ThemeProviderProps {
  children: ReactNode;
  defaultTheme?: ThemeName;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ 
  children, 
  defaultTheme = 'light' 
}) => {
  const [themeName, setThemeName] = useState<ThemeName>(defaultTheme);
  const [currentTheme, setCurrentTheme] = useState<Theme>(themes[defaultTheme]);

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as ThemeName;
    if (savedTheme && themes[savedTheme]) {
      setThemeName(savedTheme);
      setCurrentTheme(themes[savedTheme]);
    }
  }, []);

  useEffect(() => {
    const theme = themes[themeName];
    setCurrentTheme(theme);
    localStorage.setItem('theme', themeName);

    // Apply CSS custom properties
    const root = document.documentElement;
    Object.entries(theme.colors).forEach(([key, value]) => {
      root.style.setProperty(`--color-${key}`, value);
    });
  }, [themeName]);

  const setTheme = (newTheme: ThemeName) => {
    if (themes[newTheme]) {
      setThemeName(newTheme);
    }
  };

  return (
    <ThemeContext.Provider value={{ currentTheme, themeName, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};
