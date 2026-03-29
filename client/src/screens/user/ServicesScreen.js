import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../theme/colors';

const { width } = Dimensions.get('window');

const SERVICES = [
  {
    icon: 'analytics',
    title: 'Risk Analysis',
    description: 'AI-powered analysis of road accident risk factors in real-time across Algeria.',
    color: Colors.primary,
    bg: Colors.violetLight,
    borderColor: Colors.violetBorder,
  },
  {
    icon: 'map',
    title: 'Prediction Map',
    description: 'Interactive heatmap showing predicted danger zones based on historical and live data.',
    color: Colors.secondary,
    bg: Colors.blueLight,
    borderColor: Colors.blueBorder,
  },
  {
    icon: 'notifications',
    title: 'Real-Time Alerts',
    description: 'Instant notifications when risk levels change in your monitored areas and routes.',
    color: Colors.severityHigh,
    bg: 'rgba(249,115,22,0.08)',
    borderColor: 'rgba(249,115,22,0.18)',
  },
  {
    icon: 'people',
    title: 'Community Reporting',
    description: 'Crowdsourced incident reporting system with AI verification and trust scoring.',
    color: Colors.accent,
    bg: 'rgba(15,169,88,0.08)',
    borderColor: 'rgba(15,169,88,0.18)',
  },
  {
    icon: 'bar-chart',
    title: 'Analytics Dashboard',
    description: 'Comprehensive charts and insights into road safety trends and patterns.',
    color: '#8B5CF6',
    bg: 'rgba(139,92,246,0.08)',
    borderColor: 'rgba(139,92,246,0.18)',
  },
  {
    icon: 'phone-portrait',
    title: 'Mobile Notifications',
    description: 'Push notifications, SMS, and email alerts customizable to your preferences.',
    color: Colors.secondary,
    bg: Colors.blueLight,
    borderColor: Colors.blueBorder,
  },
];

export default function ServicesScreen({ navigation }) {
  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={Colors.heading} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Services</Text>
        <View style={{ width: 38 }} />
      </View>

      {/* Hero section */}
      <View style={styles.hero}>
        <View style={styles.heroIconRow}>
          <View style={[styles.heroIcon, { backgroundColor: Colors.btnPrimary }]}>
            <Ionicons name="shield-checkmark" size={28} color={Colors.white} />
          </View>
        </View>
        <Text style={styles.heroTitle}>SIARA Services</Text>
        <Text style={styles.heroSubtitle}>
          Empowering road safety through AI, community, and real-time data.
        </Text>
      </View>

      {/* Services grid */}
      <View style={styles.servicesSection}>
        {SERVICES.map((service, index) => (
          <TouchableOpacity
            key={service.title}
            style={styles.serviceCard}
            activeOpacity={0.7}
          >
            <View style={[styles.serviceIconWrap, { backgroundColor: service.bg, borderColor: service.borderColor }]}>
              <Ionicons name={service.icon} size={28} color={service.color} />
            </View>
            <View style={styles.serviceInfo}>
              <Text style={styles.serviceTitle}>{service.title}</Text>
              <Text style={styles.serviceDesc}>{service.description}</Text>
              <View style={styles.learnMoreRow}>
                <Text style={[styles.learnMore, { color: service.color }]}>Learn More</Text>
                <Ionicons name="arrow-forward" size={14} color={service.color} />
              </View>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      {/* CTA */}
      <View style={styles.ctaCard}>
        <View style={styles.ctaIconWrap}>
          <Ionicons name="rocket" size={24} color={Colors.primary} />
        </View>
        <Text style={styles.ctaTitle}>Ready to get started?</Text>
        <Text style={styles.ctaDesc}>
          Explore the map and set up your first safety alert today.
        </Text>
        <TouchableOpacity
          style={styles.ctaBtn}
          onPress={() => navigation.navigate('Map')}
          activeOpacity={0.8}
        >
          <Text style={styles.ctaBtnText}>Open Map</Text>
          <Ionicons name="arrow-forward" size={16} color={Colors.white} />
        </TouchableOpacity>
      </View>

      <View style={styles.bottomSpacer} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  container: {
    paddingBottom: 40,
  },

  /* Header */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 48,
    paddingBottom: 14,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: Colors.bg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    color: Colors.heading,
    fontSize: 18,
    fontWeight: '700',
  },

  /* Hero */
  hero: {
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingVertical: 28,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  heroIconRow: {
    marginBottom: 16,
  },
  heroIcon: {
    width: 64,
    height: 64,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: Colors.btnPrimary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  heroTitle: {
    color: Colors.heading,
    fontSize: 26,
    fontWeight: '800',
    marginBottom: 8,
  },
  heroSubtitle: {
    color: Colors.subtext,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },

  /* Services */
  servicesSection: {
    paddingHorizontal: 20,
    marginTop: 20,
    gap: 12,
  },
  serviceCard: {
    flexDirection: 'row',
    backgroundColor: Colors.white,
    borderRadius: 18,
    padding: 18,
    gap: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: Colors.cardShadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 3,
  },
  serviceIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  serviceInfo: {
    flex: 1,
  },
  serviceTitle: {
    color: Colors.heading,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  serviceDesc: {
    color: Colors.subtext,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 10,
  },
  learnMoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  learnMore: {
    fontSize: 13,
    fontWeight: '600',
  },

  /* CTA */
  ctaCard: {
    marginHorizontal: 20,
    marginTop: 24,
    backgroundColor: Colors.white,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.violetBorder,
    shadowColor: Colors.cardShadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 12,
    elevation: 4,
  },
  ctaIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: Colors.violetLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  ctaTitle: {
    color: Colors.heading,
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 6,
  },
  ctaDesc: {
    color: Colors.subtext,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
  },
  ctaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.btnPrimary,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 14,
    shadowColor: Colors.btnPrimary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  ctaBtnText: {
    color: Colors.white,
    fontSize: 15,
    fontWeight: '700',
  },

  bottomSpacer: {
    height: 20,
  },
});
