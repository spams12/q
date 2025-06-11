// src/components/CustomHeader.js
import { Feather, Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../context/ThemeContext'; // Adjust path if needed

// The header receives props from React Navigation
const CustomHeader = (props) => {
  const { theme, themeName, toggleTheme } = useTheme();
  
  // Get the title from navigation options
  const title = props.options.title || props.route.name;

  return (
    <View style={[styles.container, { backgroundColor: theme.header }]}>
      {/* Avatar */}
      <Image
        source={{ uri: 'https://i.pravatar.cc/40' }} // Placeholder avatar
        style={styles.avatar}
      />

      {/* Title */}
      <Text style={[styles.title, { color: theme.text }]}>{title}</Text>

      {/* Right side icons */}
      <View style={styles.rightContainer}>
        {/* Theme Toggle Button */}
        <TouchableOpacity onPress={toggleTheme} style={styles.iconButton}>
          {themeName === 'light' ? (
            <Feather name="moon" size={24} color={theme.icon} />
          ) : (
            <Feather name="sun" size={24} color={theme.icon} />
          )}
        </TouchableOpacity>

        {/* Bell Icon */}
        <TouchableOpacity onPress={() => console.log('Bell pressed!')} style={styles.iconButton}>
          <Ionicons name="notifications-outline" size={24} color={theme.icon} />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    height: 100, // Adjust as needed
    paddingTop: 40, // For status bar
    paddingHorizontal: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    left: 25,
    right: 0,
    textAlign: 'center',
  },
  rightContainer: {
    flexDirection: 'row',
  },
  iconButton: {
    marginLeft: 15,
  },
});

export default CustomHeader;