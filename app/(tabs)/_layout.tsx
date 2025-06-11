import { Tabs } from 'expo-router';
import React from 'react';
import { Platform } from 'react-native';

import CustomHeader from '@/components/CustomHeader';
import { HapticTab } from '@/components/HapticTab';
import TabBarBackground from '@/components/ui/TabBarBackground';
import { useTheme } from '../../context/ThemeContext';

export default function TabLayout() {
  const { theme } = useTheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: theme.tabActive,
        tabBarInactiveTintColor: theme.tabInactive,
        tabBarButton: HapticTab,
        tabBarBackground: TabBarBackground,
        tabBarStyle: {
          backgroundColor: theme.header,
          ...(Platform.select({
            ios: {
              position: 'absolute',
            },
            default: {},
          })),
        },
      }}>

      <Tabs.Screen
        name="tasks"
        options={{
          title: 'New Tasks',
          headerShown: true,
          header: (props) => <CustomHeader {...props} />,
        }}
        
      />

    </Tabs>
  );
}
