import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import React from 'react';
import { I18nManager, ScrollView, StyleSheet, Text, View } from 'react-native';

// Enable RTL for Arabic
I18nManager.allowRTL(true);
I18nManager.forceRTL(true);

const AboutPage: React.FC = () => {
  return (
    <ScrollView style={styles.container}>
      <Stack.Screen options={{ title: 'حول التطبيق' }} />
      <View style={styles.header}>
        <Ionicons name="information-circle-outline" size={60} color="#4A90E2" />
        <Text style={styles.appName}>تطبيق QMC</Text>
        <Text style={styles.version}>الإصدار 1.0.0</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>ما هو تطبيق QMC؟</Text>
        <Text style={styles.sectionContent}>
          QMC هو تطبيق محمول شامل مصمم لتبسيط طلبات الخدمة وإدارة المهام ومراقبة المخزون للفرق. يمكّن المستخدمين من إنشاء وتتبع طلبات الخدمة بكفاءة وإدارة المهام الجارية والحفاظ على مخزون منظم.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>الميزات الرئيسية</Text>
        <View style={styles.featureItem}>
          <Text style={styles.featureText}>إدارة طلبات الخدمة: يمكنك إنشاء وعرض وإدارة طلبات الخدمة بسهولة.</Text>
          <Ionicons name="build-outline" size={24} color="#34C759" />
        </View>
        <View style={styles.featureItem}>
          <Text style={styles.featureText}>تتبع المهام: قم بتعيين ومراقبة المهام داخل فريقك لضمان الإنتاجية.</Text>
          <Ionicons name="list-outline" size={24} color="#FF9500" />
        </View>
        <View style={styles.featureItem}>
          <Text style={styles.featureText}>إدارة المخزون: تتبع مخزونك وقم بإدارة مستويات المخزون بفعالية.</Text>
          <Ionicons name="cube-outline" size={24} color="#5856D6" />
        </View>
        <View style={styles.featureItem}>
          <Text style={styles.featureText}>إدارة ملف تعريف المستخدم: قم بتحديث صورة ملفك الشخصي ورقم هاتفك ومعلوماتك الشخصية الأخرى.</Text>
          <Ionicons name="person-circle-outline" size={24} color="#007AFF" />
        </View>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>تم التطوير بـ ❤️</Text>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    alignItems: 'center',
    paddingVertical: 30,
    paddingHorizontal: 20,
    backgroundColor: '#F8F8F8',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  appName: {
    fontSize: 28,
    fontWeight: 'bold',
    marginTop: 10,
    color: '#000',
    textAlign: 'center',
  },
  version: {
    fontSize: 16,
    color: '#8E8E93',
    marginTop: 4,
    textAlign: 'center',
  },
  section: {
    marginVertical: 20,
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 15,
    color: '#000',
    textAlign: 'right',
  },
  sectionContent: {
    fontSize: 16,
    lineHeight: 24,
    color: '#3C3C43',
    textAlign: 'right',
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
    justifyContent: 'space-between',
  },
  featureText: {
    fontSize: 16,
    marginRight: 15,
    flex: 1,
    color: '#3C3C43',
    textAlign: 'right',
  },
  footer: {
    padding: 20,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 14,
    color: '#8E8E93',
  },
});

export default AboutPage;