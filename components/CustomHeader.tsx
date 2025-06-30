// src/components/CustomHeader.js
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { Image, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  const  insets = useSafeAreaInsets()
  // The new title prop takes precedence. Fallback to navigation props.

  return (
    <View style={[styles.container, { backgroundColor: theme.header, borderBottomColor: theme.border } , {paddingTop:insets.top}]}>
      {/* Left side: Avatar */}
      <View style={styles.leftContainer}>
        
         <TouchableOpacity onPress={() => router.push('/notifications')} style={styles.iconButton}>
          <Ionicons name="notifications-outline" size={24} color={theme.icon} />
        </TouchableOpacity>
      </View>

      {/* Center: Title */}
      <View style={styles.centerContainer}>
         <Image
          source={require("../assets/images/LogoInvoice.png")}
          style={styles.avatar}
          
        />
      </View>

      {/* Right side: Spacer for balance */}
      <View style={styles.rightContainer} />
    </View>
  );
};

const styles = StyleSheet.create({
    container: {
        height: 70,
        paddingHorizontal: 15,
        flexDirection: 'row',
        justifyContent: 'space-between',
        borderBottomWidth: 1,
      },
      leftContainer: {
        flex: 1,
        justifyContent: 'flex-start',
        alignItems: 'center',
        flexDirection: 'row',
      },
      centerContainer: {
        flex: 2,
        alignItems: 'center',
        justifyContent: 'center',
      },
      rightContainer: {
        flex: 1,
        flexDirection: 'row',
        justifyContent: 'flex-end',
      },
      avatar: {
        width: 130,
        height: 85,
        resizeMode: 'contain',
      },
      title: {
        fontSize: 20,
        fontWeight: 'bold',
      },
      iconButton: {
        // marginLeft: 15, // Removed for layout balance
      },
});

export default CustomHeader;