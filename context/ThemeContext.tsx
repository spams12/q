import React, { createContext, ReactNode, useContext, useState } from 'react';

// Define the shape of the theme object
export interface Theme {
  background: string;
  text: string;
  header: string;
  icon: string;
  tabInactive: string;
  tabActive: string;
}

// Define the shape of the themes object
export interface Themes {
  light: Theme;
  dark: Theme;
}

// Define your color palettes
export const themes: Themes = {
  light: {
    background: '#FFFFFF',
    text: '#121212',
    header: '#F5F5F5',
    icon: '#121212',
    tabInactive: 'gray',
    tabActive: '#007AFF',
  },
  dark: {
    background: '#121212',
    text: '#FFFFFF',
    header: '#1E1E1E',
    icon: '#FFFFFF',
    tabInactive: 'gray',
    tabActive: '#007AFF',
  },
};

// Define the shape of the context value
interface ThemeContextType {
  theme: Theme;
  themeName: 'light' | 'dark';
  toggleTheme: () => void;
}

// Create the context with a default value
const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

// Create the provider component
// Create the provider component
interface ThemeProviderProps {
  children: ReactNode;
}

export const ThemeProvider = ({ children }: ThemeProviderProps) => {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  const toggleTheme = () => {
    setTheme((prevTheme) => (prevTheme === 'light' ? 'dark' : 'light'));
  };

  // The value provided to the consumer components
  const value = {
    theme: themes[theme], // Provide the full theme object
    themeName: theme, // Provide the name 'light' or 'dark'
    toggleTheme,
  };

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
};

// Create a custom hook to use the theme context easily
export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};