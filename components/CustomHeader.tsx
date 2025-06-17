// src/components/CustomHeader.js
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { usePermissions } from '../context/PermissionsContext';
import { useTheme } from '../context/ThemeContext'; // Adjust path if needed

interface CustomHeaderProps {
  title?: string;
  options?: {
    title?: string;
  };
  route?: {
    name: string;
  };
}

const CustomHeader = (props: CustomHeaderProps) => {
  const { theme } = useTheme();
  const { userdoc } = usePermissions();

  // The new title prop takes precedence. Fallback to navigation props.
  const displayTitle = props.title || props.options?.title || props.route?.name || 'Screen';

  return (
    <View style={[styles.container, { backgroundColor: theme.header, borderBottomColor: theme.border }]}>
      {/* Left side: Avatar */}
      <View style={styles.leftContainer}>
        <Image
          source={{ uri: userdoc?.photoURL || 'https://i.pravatar.cc/40' }}
          style={styles.avatar}
        />
      </View>

      {/* Center: Title */}
      <View style={styles.centerContainer}>
        <Text style={[styles.title, { color: theme.text }]}>{displayTitle}</Text>
      </View>

      {/* Right side: Icons */}
      <View style={styles.rightContainer}>


        <TouchableOpacity onPress={() => router.push('/notifications')} style={styles.iconButton}>
          <Ionicons name="notifications-outline" size={24} color={theme.icon} />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
    container: {
        height: 100,
        paddingTop: 40,
        paddingHorizontal: 15,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottomWidth: 1,
      },
      leftContainer: {
        flex: 1,
        justifyContent: 'flex-start',
        flexDirection: 'row',
      },
      centerContainer: {
        flex: 2,
        alignItems: 'center',
      },
      rightContainer: {
        flex: 1,
        flexDirection: 'row',
        justifyContent: 'flex-end',
      },
      avatar: {
        width: 40,
        height: 40,
        borderRadius: 20,
      },
      title: {
        fontSize: 20,
        fontWeight: 'bold',
      },
      iconButton: {
        marginLeft: 15,
      },
});

export default CustomHeader;