import CustomHeader from '@/components/CustomHeader';
import { FontAwesome, FontAwesome5, Ionicons, MaterialIcons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React from 'react';
import { LayoutAnimation, Platform, UIManager } from 'react-native';

import { HapticTab } from '@/components/HapticTab';
import { useTheme } from '@/context/ThemeContext';
if (Platform.OS === 'android') {
  if (UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
  }
}

export default function TabLayout() {
  const { theme } = useTheme();

  return (
    <Tabs

      initialRouteName="index"

      screenOptions={{

        freezeOnBlur: true,
        tabBarButton: (props) => {
          return (
            <HapticTab
              {...props}
              onPress={(e) => {
                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                props.onPress?.(e);
              }}
            />
          );
        },
        header: (props) => <CustomHeader {...props} />,
        tabBarActiveTintColor: theme.tabActive,
        tabBarInactiveTintColor: theme.tabInactive,
        tabBarStyle: {
          backgroundColor: theme.background,
        },
      }}>
      <Tabs.Screen

        name="index"
        options={{

          title: 'المهام',
          tabBarIcon: ({ color, size }) => (
            <FontAwesome name="home" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="my-requests"
        options={{
          title: 'التكتات',
          tabBarIcon: ({ color, size }) => (
            <FontAwesome name="list-alt" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen


        name="stock-management"
        options={{
          title: 'الحقيبة',
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="backpack" size={size} color={color} />
          ),
        }}

      />
      <Tabs.Screen
        name="TechnicianDashboardScreen"
        options={{
          title: 'الاحصائيات',
          tabBarIcon: ({ color, size }) => <FontAwesome5 name="clipboard-list" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'المزيد',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="list-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}