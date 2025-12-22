import React, { useState } from 'react';
import { useTheme } from '../theme/ThemeProvider';
import { themes, ThemeName } from '../theme/themeConfig';

export const ThemeToggle: React.FC = () => {
  const { themeName, setTheme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);

  const handleThemeChange = (newTheme: ThemeName) => {
    setTheme(newTheme);
    setIsOpen(false);
  };

  return (
    <div className="theme-toggle-container">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="theme-toggle-button"
        aria-label="Toggle theme"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
        </svg>
        <span className="theme-name">{themeName}</span>
      </button>

      {isOpen && (
        <div className="theme-dropdown">
          {Object.keys(themes).map((theme) => (
            <button
              key={theme}
              onClick={() => handleThemeChange(theme as ThemeName)}
              className={`theme-option ${theme === themeName ? 'active' : ''}`}
            >
              <span className="theme-option-name">{theme}</span>
              <div className="theme-preview">
                {Object.entries(themes[theme as ThemeName].colors).slice(0, 3).map(([key, color]) => (
                  <div
                    key={key}
                    className="theme-preview-color"
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
