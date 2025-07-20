import { useTheme } from '@/context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack } from 'expo-router';
import React from 'react';
import { ScrollView, StyleSheet, Text, View, useColorScheme } from 'react-native';

const AboutPage: React.FC = () => {
  const colorScheme = useColorScheme();
  const { themeName } = useTheme()
  const isDark = themeName == "dark"

  const styles = createStyles(isDark);

  return (
    <ScrollView style={styles.container}>
      <Stack.Screen
        options={{
          title: 'حول التطبيق',
          headerStyle: {
            backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF',
          },
          headerTitleStyle: {
            color: isDark ? '#FFFFFF' : '#000000',
          }
        }}
      />

      <LinearGradient
        colors={isDark ? ['#1C1C1E', '#2C2C2E'] : ['#F8F9FA', '#FFFFFF']}
        style={styles.header}
      >
        <View style={styles.logoContainer}>
          <LinearGradient
            colors={['#4A90E2', '#357ABD']}
            style={styles.logoBackground}
          >
            {/* Changed icon to represent tasks/work */}
            <Ionicons name="build" size={40} color="#FFFFFF" />
          </LinearGradient>
        </View>
        <Text style={styles.appName}>مهام القبس</Text>
        <Text style={styles.tagline}>استلم مهامك، سجل ساعاتك، وتواصل بسهولة</Text>
        <Text style={styles.version}>الإصدار 1.0.0</Text>
      </LinearGradient>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>ما هو تطبيق مهام القبس؟</Text>
        <View style={styles.contentCard}>
          <Text style={styles.sectionContent}>
            تطبيق "مهام القبس" هو مساعدك الرقمي لإدارة عملك اليومي بكفاءة. يتيح لك التطبيق استلام المهام الجديدة، تسجيل ساعات العمل وتتبع موقعك، إصدار الفواتير، والتواصل المباشر مع المشرفين والمقاولين، كل ذلك من خلال واجهة سهلة وبسيطة.
          </Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>ميزات التطبيق</Text>

        <View style={styles.featureCard}>
          <View style={styles.featureIconContainer}>
            <LinearGradient colors={['#FF3B30', '#E53E3E']} style={styles.featureIconBg}>
              <Ionicons name="notifications" size={24} color="#FFFFFF" />
            </LinearGradient>
          </View>
          <View style={styles.featureContent}>
            <Text style={styles.featureTitle}>استقبال المهام والإشعارات</Text>
            <Text style={styles.featureText}>احصل على إشعارات فورية بالمهام الجديدة وتحديثات العمل الهامة.</Text>
          </View>
        </View>

        <View style={styles.featureCard}>
          <View style={styles.featureIconContainer}>
            <LinearGradient colors={['#34C759', '#28A745']} style={styles.featureIconBg}>
              <Ionicons name="time" size={24} color="#FFFFFF" />
            </LinearGradient>
          </View>
          <View style={styles.featureContent}>
            <Text style={styles.featureTitle}>تسجيل ساعات العمل</Text>
            <Text style={styles.featureText}>سجل ساعات عملك بدقة لحساب مستحقاتك وتتبع إنتاجيتك.</Text>
          </View>
        </View>

        <View style={styles.featureCard}>
          <View style={styles.featureIconContainer}>
            <LinearGradient colors={['#5856D6', '#4834D4']} style={styles.featureIconBg}>
              <Ionicons name="location" size={24} color="#FFFFFF" />
            </LinearGradient>
          </View>
          <View style={styles.featureContent}>
            <Text style={styles.featureTitle}>تتبع الموقع الجغرافي</Text>
            <Text style={styles.featureText}>شارك موقعك أثناء العمل لتسهيل إدارة المشاريع والوصول لمواقع العمل.</Text>
          </View>
        </View>

        <View style={styles.featureCard}>
          <View style={styles.featureIconContainer}>
            <LinearGradient colors={['#007AFF', '#0056CC']} style={styles.featureIconBg}>
              <Ionicons name="document-text" size={24} color="#FFFFFF" />
            </LinearGradient>
          </View>
          <View style={styles.featureContent}>
            <Text style={styles.featureTitle}>إنشاء الفواتير</Text>
            <Text style={styles.featureText}>أنشئ فواتير احترافية لأعمالك المنجزة وأرسلها بسهولة.</Text>
          </View>
        </View>

        <View style={styles.featureCard}>
          <View style={styles.featureIconContainer}>
            <LinearGradient colors={['#FF9500', '#FF8C00']} style={styles.featureIconBg}>
              <Ionicons name="chatbubbles" size={24} color="#FFFFFF" />
            </LinearGradient>
          </View>
          <View style={styles.featureContent}>
            <Text style={styles.featureTitle}>محادثات فورية</Text>
            <Text style={styles.featureText}>تواصل بشكل مباشر مع المشرفين والمقاولين لمناقشة تفاصيل العمل.</Text>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>لماذا تختار مهام القبس؟</Text>
        <View style={styles.contentCard}>
          <View style={styles.benefitItem}>
            <Ionicons name="flash" size={20} color="#4A90E2" />
            <Text style={styles.benefitText}>واجهة سهلة الاستخدام ومصممة بعناية</Text>
          </View>
          <View style={styles.benefitItem}>
            <Ionicons name="shield-checkmark" size={20} color="#34C759" />
            <Text style={styles.benefitText}>أمان عالي وحماية لبيانات عملك</Text>
          </View>
          <View style={styles.benefitItem}>
            <Ionicons name="cloud" size={20} color="#5856D6" />
            <Text style={styles.benefitText}>تزامن فوري للمهام والبيانات</Text>
          </View>
          <View style={styles.benefitItem}>
            <Ionicons name="headset" size={20} color="#FF9500" />
            <Text style={styles.benefitText}>دعم فني متخصص لمساعدتك</Text>
          </View>
        </View>
      </View>

      <LinearGradient
        colors={isDark ? ['#2C2C2E', '#1C1C1E'] : ['#F8F9FA', '#E9ECEF']}
        style={styles.footer}
      >
        <View style={styles.footerContent}>
          <Text style={styles.footerTitle}>تم التطوير بواسطة فريق القبس</Text>
          <Text style={styles.footerText}>© 2025 جميع الحقوق محفوظة لشركة القبس للتكنولوجيا</Text>
        </View>
      </LinearGradient>
    </ScrollView>
  );
};

// --- Styles (No changes needed here) ---
const createStyles = (isDark: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: isDark ? '#000000' : '#FFFFFF',
  },
  header: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  logoContainer: {
    marginBottom: 20,
  },
  logoBackground: {
    width: 80,
    height: 80,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#4A90E2',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  appName: {
    fontSize: 32,
    fontWeight: '800',
    marginTop: 15,
    color: isDark ? '#FFFFFF' : '#000000',
    textAlign: 'center',
    letterSpacing: 1,
  },
  tagline: {
    fontSize: 16,
    color: isDark ? '#8E8E93' : '#6C757D',
    marginTop: 5,
    textAlign: 'center',
    fontWeight: '500',
  },
  version: {
    fontSize: 14,
    color: isDark ? '#636366' : '#8E8E93',
    marginTop: 8,
    textAlign: 'center',
    backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  section: {
    marginVertical: 15,
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 20,
    color: isDark ? '#FFFFFF' : '#000000',
    textAlign: 'right',
  },
  contentCard: {
    backgroundColor: isDark ? '#1C1C1E' : '#F8F9FA',
    borderRadius: 16,
    padding: 20,
    shadowColor: isDark ? '#000000' : '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: isDark ? 0.3 : 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  sectionContent: {
    fontSize: 16,
    lineHeight: 26,
    color: isDark ? '#E5E5E7' : '#3C3C43',
    textAlign: 'right',
    fontWeight: '400',
  },
  featureCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: isDark ? '#000000' : '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: isDark ? 0.3 : 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  featureIconContainer: {
    marginLeft: 15,
  },
  featureIconBg: {
    width: 50,
    height: 50,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  featureContent: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: isDark ? '#FFFFFF' : '#000000',
    textAlign: 'right',
    marginBottom: 4,
  },
  featureText: {
    fontSize: 14,
    color: isDark ? '#8E8E93' : '#6C757D',
    textAlign: 'right',
    lineHeight: 20,
  },
  benefitItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    justifyContent: 'flex-end',
  },
  benefitText: {
    fontSize: 16,
    marginRight: 10,
    color: isDark ? '#E5E5E7' : '#3C3C43',
    textAlign: 'right',
    fontWeight: '500',
  },
  footer: {
    padding: 30,
    alignItems: 'center',
    marginTop: 20,
  },
  footerContent: {
    alignItems: 'center',
  },
  footerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: isDark ? '#FFFFFF' : '#000000',
    textAlign: 'center',
    marginBottom: 8,
  },
  footerText: {
    fontSize: 14,
    color: isDark ? '#8E8E93' : '#6C757D',
    textAlign: 'center',
  },
});

export default AboutPage;