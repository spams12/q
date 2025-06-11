import { View, type ViewProps } from 'react-native';

import { useTheme } from '@/context/ThemeContext';

export type ThemedViewProps = ViewProps & {
  lightColor?: string;
  darkColor?: string;
};

export function ThemedView({ style, lightColor, darkColor, ...otherProps }: ThemedViewProps) {
  const { theme, themeName } = useTheme();
  const backgroundColor = themeName === 'light' ? lightColor || theme.background : darkColor || theme.background;

  return <View style={[{ backgroundColor }, style]} {...otherProps} />;
}
