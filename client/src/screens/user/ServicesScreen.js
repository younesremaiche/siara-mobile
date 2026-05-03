import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '../../theme/colors';

const SERVICES = [
  {
    icon: 'analytics-outline',
    title: 'Risk Analysis',
    description: 'AI-powered analysis of road accident risk factors in real-time across Algeria.',
    color: Colors.primary,
    bg: Colors.violetLight,
    borderColor: Colors.violetBorder,
  },
  {
    icon: 'map-outline',
    title: 'Prediction Map',
    description: 'Interactive heatmap showing predicted danger zones based on historical and live data.',
    color: Colors.secondary,
    bg: Colors.blueLight,
    borderColor: Colors.blueBorder,
  },
  {
    icon: 'notifications-outline',
    title: 'Real-Time Alerts',
    description: 'Instant notifications when risk levels change in your monitored areas and routes.',
    color: '#F97316',
    bg: 'rgba(249,115,22,0.08)',
    borderColor: 'rgba(249,115,22,0.18)',
  },
  {
    icon: 'people-outline',
    title: 'Community Reporting',
    description: 'Crowdsourced incident reporting system with AI verification and trust scoring.',
    color: Colors.accent,
    bg: 'rgba(15,169,88,0.08)',
    borderColor: 'rgba(15,169,88,0.18)',
  },
  {
    icon: 'bar-chart-outline',
    title: 'Analytics Dashboard',
    description: 'Comprehensive charts and insights into road safety trends and patterns.',
    color: '#8B5CF6',
    bg: 'rgba(139,92,246,0.08)',
    borderColor: 'rgba(139,92,246,0.18)',
  },
  {
    icon: 'phone-portrait-outline',
    title: 'Mobile Notifications',
    description: 'Push notifications, SMS, and email alerts customizable to your preferences.',
    color: Colors.secondary,
    bg: Colors.blueLight,
    borderColor: Colors.blueBorder,
  },
];

export default function ServicesScreen({ navigation }) {
  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Gradient Hero Header ── */}
        <LinearGradient
          colors={[Colors.gradientFrom, Colors.gradientTo]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <View style={styles.heroDecor1} />
          <View style={styles.heroDecor2} />

          {/* Back button */}
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={20} color={Colors.white} />
          </TouchableOpacity>

          {/* Icon */}
          <Image
            source={require('../../assets/logos/siara-logo.png')}
            style={styles.heroLogo}
            resizeMode="contain"
          />

          <Text style={styles.heroTitle}>SIARA Services</Text>
          <Text style={styles.heroSubtitle}>
            Empowering road safety through AI,{'\n'}community, and real-time data.
          </Text>

          {/* Stats row */}
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statNum}>6</Text>
              <Text style={styles.statLbl}>Services</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statNum}>58</Text>
              <Text style={styles.statLbl}>Wilayas</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statNum}>24/7</Text>
              <Text style={styles.statLbl}>Monitoring</Text>
            </View>
          </View>
        </LinearGradient>

        {/* ── Section label ── */}
        <View style={styles.sectionLabelRow}>
          <View style={styles.sectionLabelBadge}>
            <Text style={styles.sectionLabelText}>ALL SERVICES</Text>
          </View>
        </View>

        {/* ── Service cards ── */}
        <View style={styles.cardList}>
          {SERVICES.map((service) => (
            <TouchableOpacity
              key={service.title}
              style={styles.card}
              activeOpacity={0.75}
            >
              {/* Colored left accent */}
              <View style={[styles.cardAccent, { backgroundColor: service.color }]} />

              <View style={[styles.cardIconWrap, { backgroundColor: service.bg }]}>
                <Ionicons name={service.icon} size={26} color={service.color} />
              </View>

              <View style={styles.cardBody}>
                <Text style={styles.cardTitle}>{service.title}</Text>
                <Text style={styles.cardDesc}>{service.description}</Text>
                <View style={styles.learnMoreRow}>
                  <Text style={[styles.learnMoreText, { color: service.color }]}>Learn More</Text>
                  <Ionicons name="arrow-forward" size={13} color={service.color} />
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 0,
  },

  /* ── Hero ── */
  hero: {
    paddingTop: Platform.OS === 'ios' ? 60 : 48,
    paddingBottom: 32,
    paddingHorizontal: 24,
    alignItems: 'center',
    overflow: 'hidden',
  },
  heroDecor1: {
    position: 'absolute',
    top: -40,
    right: -40,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  heroDecor2: {
    position: 'absolute',
    bottom: -20,
    left: -40,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  backBtn: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 58 : 46,
    left: 20,
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroLogo: {
    width: 200,
    height: 100,
    marginBottom: 16,
  },
  heroTitle: {
    color: Colors.white,
    fontSize: 26,
    fontWeight: '800',
    marginBottom: 8,
    letterSpacing: -0.3,
  },
  heroSubtitle: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 24,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 0,
    width: '100%',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statNum: {
    color: Colors.white,
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 2,
  },
  statLbl: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
    fontWeight: '600',
  },
  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },

  /* ── Section label ── */
  sectionLabelRow: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 4,
  },
  sectionLabelBadge: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.violetLight,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
  },
  sectionLabelText: {
    color: Colors.primary,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
  },

  /* ── Cards ── */
  cardList: {
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 12,
  },
  card: {
    flexDirection: 'row',
    backgroundColor: Colors.white,
    borderRadius: 18,
    overflow: 'hidden',
    alignItems: 'center',
    gap: 16,
    paddingRight: 18,
    paddingVertical: 18,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    shadowColor: Colors.cardShadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 10,
    elevation: 3,
  },
  cardAccent: {
    width: 4,
    alignSelf: 'stretch',
    borderRadius: 0,
  },
  cardIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardBody: {
    flex: 1,
  },
  cardTitle: {
    color: Colors.heading,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  cardDesc: {
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
  learnMoreText: {
    fontSize: 13,
    fontWeight: '700',
  },

  bottomSpacer: {
    height: 32,
  },
});
