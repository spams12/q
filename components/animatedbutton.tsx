import { ThemedText } from '@/components/ThemedText';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

// --- Component Props Definition ---
interface AnimatedIconButtonProps {
  /** The name of the icon to display from Ionicons */
  icon: React.ComponentProps<typeof Ionicons>['name'];
  /** The text to display below the icon button */
  name: string;
  /** The function to execute when the button is pressed */
  onPress: () => void;
  /** Optional size for the button */
  size?: number;
  /** Optional color for the icon and glow effect */
  color?: string;
}

const AnimatedIconButton: React.FC<AnimatedIconButtonProps> = ({
  icon,
  name,
  onPress,
  size = 80,
  color = '#39FF14',
}) => {
  const pulse = useSharedValue(1);
  const pressScale = useSharedValue(1);

  // Continuous "breathing" animation
  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1.08, {
        duration: 2000,
        easing: Easing.bezier(0.42, 0, 0.58, 1),
      }),
      -1, // Infinite repeat
      true // Yoyo (reverses back and forth)
    );
  }, [pulse]);

  // Handler for when the button is pressed down
  const handlePressIn = () => {
    pressScale.value = withSpring(0.9);
  };

  // Handler for when the button is released
  const handlePressOut = () => {
    pressScale.value = withSpring(1);
  };

  // Animated style for the pulsing glow
  const pulseAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: pulse.value }],
    };
  });

  // Animated style for the press interaction
  const pressAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: pressScale.value }],
    };
  });

  // Dynamic styles based on the size prop
  const dynamicStyles = {
    circle: {
      width: size,
      height: size,
      borderRadius: size / 2,
      backgroundColor: color + '20', // Same color as icon but with transparency
      borderColor: color + '60', // Same color as icon but semi-transparent
    },
    glowContainer: {
      shadowColor: color,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.8,
      shadowRadius: 20,
      // For Android glow effect
      elevation: 15,
    },
    icon: {
      size: size * 0.95, // Better proportioned icon size
    }
  };

  return (
    <TouchableOpacity
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      activeOpacity={0.9}
      style={styles.touchableWrapper}
    >
      <Animated.View style={[styles.container, pressAnimatedStyle]}>
        <Animated.View style={[styles.glowContainer, dynamicStyles.glowContainer, pulseAnimatedStyle]}>
          <View style={[styles.circle, dynamicStyles.circle]}>
            <Ionicons
              name={icon}
              size={dynamicStyles.icon.size}
              color={color}
            />
          </View>
        </Animated.View>

        <ThemedText style={styles.nameText}>{name}</ThemedText>
      </Animated.View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  touchableWrapper: {
    alignItems: 'center',
  },
  container: {
    alignItems: 'center',
  },
  glowContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  circle: {
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
  },
  nameText: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: '600',
    color: '#E0E0E0',
  },
});

export default AnimatedIconButton;