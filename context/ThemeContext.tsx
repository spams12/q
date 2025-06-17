import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useState,
} from 'react';
import { useColorScheme } from 'react-native';

// Define the shape of the theme object
export interface Theme {
  background: string;
  text: string;
  textSecondary: string;
  header: string;
  icon: string;
  iconBackground: string;
  tabInactive: string;
  tabActive: string;
  card: string;
  border: string;
  separator: string;
  primary: string;
  success: string;
  destructive: string;
  placeholder: string;
  inputBackground: string;
  subtleText: string;
  lightGray: string;
  redTint: string;
  blueTint: string;
  white: string;
  black: string;
}

// Define the shape of the themes object
export interface Themes {
  light: Theme;
  dark: Theme;
}

// Define your color palettes
export const themes: Themes = {
  light: {
    background: '#F2F2F7',
    text: '#1C1C1E',
    textSecondary: '#8A8A8E',
    header: '#F5F5F5',
    icon: '#121212',
    iconBackground: '#EFEFF4',
    tabInactive: 'gray',
    tabActive: '#007AFF',
    card: '#FFFFFF',
    border: '#DDDDDD',
    separator: '#E5E5EA',
    primary: '#007AFF',
    success: '#34C759',
    destructive: '#FF3B30',
    subtleText: '#6D6D72',
    placeholder: '#C7C7CD',
    inputBackground: '#FDFDFD',
    lightGray: '#E5E5EA',
    redTint: '#FFF1F1',
    blueTint: '#F0F5FF',
    white: '#FFFFFF',
    black: '#000000',
  },
  dark: {
    background: '#000000',
    text: '#FFFFFF',
    textSecondary: '#8A8A8E',
    header: '#1E1E1E',
    icon: '#FFFFFF',
    iconBackground: '#3A3A3C',
    tabInactive: 'gray',
    tabActive: '#007AFF',
    card: '#1C1C1E',
    border: '#333333',
    separator: '#38383A',
    primary: '#0A84FF',
    success: '#30D158',
    destructive: '#FF453A',
    subtleText: '#999999',
    placeholder: '#8E8E93',
    inputBackground: '#2C2C2E',
    lightGray: '#3A3A3C',
    redTint: '#5c1f1f',
    blueTint: '#1f2a5c',
    white: '#FFFFFF',
    black: '#000000',
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
interface ThemeProviderProps {
  children: ReactNode;
}

export const ThemeProvider = ({ children }: ThemeProviderProps) => {
  const colorScheme = useColorScheme();
  const [themeName, setThemeName] = useState<'light' | 'dark'>(
    colorScheme || 'light'
  );

  useEffect(() => {
    const loadTheme = async () => {
      try {
        const savedTheme = await AsyncStorage.getItem('theme');
        if (savedTheme !== null) {
          setThemeName(savedTheme as 'light' | 'dark');
        }
      } catch (error) {
        console.error('Failed to load theme from storage', error);
      }
    };

    loadTheme();
  }, []);

  const toggleTheme = async () => {
    const newThemeName = themeName === 'light' ? 'dark' : 'light';
    setThemeName(newThemeName);
    try {
      await AsyncStorage.setItem('theme', newThemeName);
    } catch (error) {
      console.error('Failed to save theme to storage', error);
    }
  };

  // The value provided to the consumer components
  const value = {
    theme: themes[themeName], // Provide the full theme object
    themeName, // Provide the name 'light' or 'dark'
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