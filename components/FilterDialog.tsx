import { useTheme } from '@/context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect } from 'react';
import { Dimensions, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

interface FilterDialogProps {
  isVisible: boolean;
  onClose: () => void;
  selectedPriority: string | null;
  setSelectedPriority: (priority: string | null) => void;
  selectedType: string | null;
  setSelectedType: (type: string | null) => void;
  clearFilters: () => void;
  availableTypes: string[];
}

const FilterDialog: React.FC<FilterDialogProps> = ({
  isVisible,
  onClose,
  selectedPriority,
  setSelectedPriority,
  selectedType,
  setSelectedType,
  clearFilters,
  availableTypes,
}) => {
  const { theme } = useTheme();
  const translateY = useSharedValue(Dimensions.get('window').height);

  const translations: { [key: string]: string } = {
    High: 'عالية',
    Medium: 'متوسطة',
    Low: 'منخفضة',
    Problem: 'مشكلة',
    'New Request': 'طلب جديد',
    All: 'الكل',
    Open: 'مفتوح',
    'In Progress': 'قيد المعالجة',
    Closed: 'مغلق',
  };

  useEffect(() => {
    if (isVisible) {
      translateY.value = withTiming(0, { duration: 300 });
    } else {
      translateY.value = withTiming(Dimensions.get('window').height, { duration: 300 });
    }
  }, [isVisible, translateY]);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: translateY.value }],
    };
  });

  if (!isVisible) {
    return null;
  }

  return (
    <>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <Animated.View style={[styles.filterPopup, { backgroundColor: theme.header }, animatedStyle]}>
        <View style={styles.filterContent}>
          <View style={styles.filterHeader}>
            <Text style={[styles.filterTitle, { color: theme.text }]}>خيارات التصفية</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={theme.text} />
            </TouchableOpacity>
          </View>

          <Text style={[styles.filterSectionTitle, { color: theme.text }]}>الأولوية</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.horizontalScrollView}
            contentContainerStyle={styles.filterOptionsContainer}
          >
            {['High', 'Medium', 'Low'].map(priority => (
              <TouchableOpacity
                key={priority}
                style={[
                  styles.filterButton,
                  selectedPriority === priority && {
                    backgroundColor: theme.tabActive,
                    borderColor: theme.tabActive,
                  },
                  { borderColor: theme.text },
                ]}
                onPress={() => setSelectedPriority(selectedPriority === priority ? null : priority)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.filterButtonText,
                    selectedPriority === priority && { color: '#fff' },
                    { color: theme.text },
                  ]}
                >
                  {translations[priority] || priority}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={[styles.filterSectionTitle, { color: theme.text }]}>النوع</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.horizontalScrollView}
            contentContainerStyle={styles.filterOptionsContainer}
          >
            {availableTypes.map(type => (
              <TouchableOpacity
                key={type}
                style={[
                  styles.filterButton,
                  selectedType === type && {
                    backgroundColor: theme.tabActive,
                    borderColor: theme.tabActive,
                  },
                  { borderColor: theme.text },
                ]}
                onPress={() => setSelectedType(selectedType === type ? null : type)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.filterButtonText,
                    selectedType === type && { color: '#fff' },
                    { color: theme.text },
                  ]}
                >
                  {translations[type] || type}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <View style={styles.filterActions}>
            <TouchableOpacity style={styles.clearButton} onPress={clearFilters}>
              <Text style={styles.clearButtonText}>مسح الفلاتر</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.applyButton, { backgroundColor: theme.tabActive }]}
              onPress={onClose}
            >
              <Text style={styles.applyButtonText}>تطبيق</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>
    </>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: 5,
  },
  filterPopup: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 400,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -5 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 20,
    zIndex: 10,
  },
  filterContent: {
    flex: 1,
  },
  filterHeader: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  filterTitle: {
    fontSize: 22,
    fontFamily: 'Cairo',
    fontWeight: 'bold',
  },
  filterSectionTitle: {
    fontSize: 16,
    fontFamily: 'Cairo',
    fontWeight: '600',
    marginBottom: 12,
    textAlign: 'right',
  },
  horizontalScrollView: {
    marginBottom: 20,
  },
  filterOptionsContainer: {
    flexDirection: 'row-reverse',
    gap: 10,
  },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
  },
  filterButtonText: {
    fontSize: 14,
    fontFamily: 'Cairo',
  },
  filterActions: {
    flexDirection: 'row-reverse',
    marginTop: 'auto',
    gap: 12,
  },
  clearButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#f0f0f0',
  },
  clearButtonText: {
    fontSize: 16,
    fontFamily: 'Cairo',
    fontWeight: 'bold',
    color: '#333',
  },
  applyButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
  },
  applyButtonText: {
    fontSize: 16,
    fontFamily: 'Cairo',
    fontWeight: 'bold',
    color: '#fff',
  },
});

export default FilterDialog;