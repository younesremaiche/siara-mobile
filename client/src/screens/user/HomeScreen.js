import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  StatusBar,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '../../theme/colors';

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - 56) / 2;

/* ------------------------------------------------------------------ */
/*  DATA                                                               */
/* ------------------------------------------------------------------ */

const HOW_IT_WORKS = [
  {
    icon: 'cloud-download-outline',
    title: 'Data Collection',
    desc: 'Real-time ingestion from traffic sensors, cameras, weather APIs, and community reports across all 58 wilayas.',
    color: Colors.primary,
    bg: Colors.violetLight,
  },
  {
    icon: 'analytics-outline',
    title: 'Analysis & Predictive AI',
    desc: 'Deep-learning models analyze patterns, forecast accident risk zones, and surface hidden correlations.',
    color: Colors.secondary,
    bg: Colors.blueLight,
  },
  {
    icon: 'notifications-outline',
    title: 'Real-Time Alerts',
    desc: 'Instant push notifications to drivers, authorities, and emergency responders when risk spikes.',
    color: Colors.accent,
    bg: 'rgba(15,169,88,0.08)',
  },
];

const STATS = [
  { value: '1.35M', label: 'Deaths / Year', sub: 'Worldwide road fatalities', icon: 'skull-outline', color: Colors.severityCritical },
  { value: '50%', label: 'Reduction Target', sub: 'UN Decade of Action goal', icon: 'trending-down-outline', color: Colors.accent },
  { value: '92%', label: 'AI Accuracy', sub: 'SIARA prediction model', icon: 'checkmark-circle-outline', color: Colors.secondary },
  { value: '+1 000', label: 'Risk Zones', sub: 'Monitored across Algeria', icon: 'location-outline', color: Colors.primary },
];

const SERVICES = [
  {
    icon: 'bar-chart-outline',
    title: 'Analytics Dashboard',
    desc: 'Comprehensive risk analytics, severity breakdowns, time-series trends, and wilaya-level insights for decision-makers.',
    color: Colors.primary,
    bg: Colors.violetLight,
    border: Colors.violetBorder,
  },
  {
    icon: 'map-outline',
    title: 'Prediction Map',
    desc: 'Interactive heatmap powered by AI. Visualize risk zones, accident clusters, and forecast overlays in real time.',
    color: Colors.secondary,
    bg: Colors.blueLight,
    border: Colors.blueBorder,
  },
  {
    icon: 'phone-portrait-outline',
    title: 'SIARA Mobile App',
    desc: 'On-the-go alerts, incident reporting, route safety scoring, and community-driven road intelligence.',
    color: Colors.accent,
    bg: 'rgba(15,169,88,0.08)',
    border: 'rgba(15,169,88,0.18)',
  },
];

/* ------------------------------------------------------------------ */
/*  COMPONENT                                                          */
/* ------------------------------------------------------------------ */

export default function HomeScreen({ navigation }) {
  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ========== HERO ========== */}
        <LinearGradient
          colors={[Colors.gradientFrom, Colors.gradientTo]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          {/* Decorative circles */}
          <View style={styles.heroDecor1} />
          <View style={styles.heroDecor2} />

          <View style={styles.heroLogoRow}>
            <Ionicons name="shield-checkmark" size={32} color={Colors.white} />
            <Text style={styles.heroLogoText}>SIARA</Text>
          </View>

          <Text style={styles.heroHeading}>
            Make roads safer{'\n'}with AI
          </Text>
          <Text style={styles.heroSubtitle}>
            Intelligent road safety analytics and real-time risk prediction for Algeria, powered by advanced machine learning.
          </Text>

          <View style={styles.heroBtns}>
            <TouchableOpacity
              style={styles.heroBtnPrimary}
              activeOpacity={0.85}
              onPress={() => navigation.navigate('Login')}
            >
              <Ionicons name="arrow-forward-outline" size={18} color={Colors.primary} />
              <Text style={styles.heroBtnPrimaryText}>Get Started</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.heroBtnGhost}
              activeOpacity={0.7}
              onPress={() => navigation.navigate('Services')}
            >
              <Ionicons name="compass-outline" size={18} color={Colors.white} />
              <Text style={styles.heroBtnGhostText}>Discover Services</Text>
            </TouchableOpacity>
          </View>

          {/* Trust bar */}
          <View style={styles.trustBar}>
            <View style={styles.trustItem}>
              <Ionicons name="shield-checkmark-outline" size={16} color="rgba(255,255,255,0.7)" />
              <Text style={styles.trustText}>AI-Powered</Text>
            </View>
            <View style={styles.trustDivider} />
            <View style={styles.trustItem}>
              <Ionicons name="time-outline" size={16} color="rgba(255,255,255,0.7)" />
              <Text style={styles.trustText}>Real-Time</Text>
            </View>
            <View style={styles.trustDivider} />
            <View style={styles.trustItem}>
              <Ionicons name="globe-outline" size={16} color="rgba(255,255,255,0.7)" />
              <Text style={styles.trustText}>58 Wilayas</Text>
            </View>
          </View>
        </LinearGradient>

        {/* ========== HOW IT WORKS ========== */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionBadge}>
              <Text style={styles.sectionBadgeText}>HOW IT WORKS</Text>
            </View>
            <Text style={styles.sectionTitle}>How does SIARA work?</Text>
            <Text style={styles.sectionSubtitle}>
              Three pillars of intelligent road safety
            </Text>
          </View>

          {HOW_IT_WORKS.map((item, i) => (
            <View key={i} style={styles.hiwCard}>
              <View style={[styles.hiwIconWrap, { backgroundColor: item.bg }]}>
                <Ionicons name={item.icon} size={28} color={item.color} />
              </View>
              <View style={styles.hiwStepBadge}>
                <Text style={styles.hiwStepText}>{i + 1}</Text>
              </View>
              <Text style={styles.hiwTitle}>{item.title}</Text>
              <Text style={styles.hiwDesc}>{item.desc}</Text>
            </View>
          ))}
        </View>

        {/* ========== MISSION ========== */}
        <View style={styles.missionSection}>
          <LinearGradient
            colors={[Colors.violetLight, Colors.blueLight]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.missionCard}
          >
            <View style={styles.missionIconWrap}>
              <Ionicons name="heart-outline" size={28} color={Colors.primary} />
            </View>
            <Text style={styles.missionTitle}>Our Mission</Text>
            <Text style={styles.missionText}>
              Reduce road accident fatalities in Algeria through intelligent data analysis, predictive artificial intelligence, and community-driven reporting. Every data point saves lives.
            </Text>
            <View style={styles.missionDivider} />
            <View style={styles.missionQuoteRow}>
              <Ionicons name="chatbubble-ellipses-outline" size={18} color={Colors.grey} />
              <Text style={styles.missionQuote}>
                "Technology should serve humanity's most pressing challenges. Road safety is one of them."
              </Text>
            </View>
          </LinearGradient>
        </View>

        {/* ========== STATS ========== */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionBadge}>
              <Text style={styles.sectionBadgeText}>IMPACT</Text>
            </View>
            <Text style={styles.sectionTitle}>The Global Road Safety Crisis</Text>
            <Text style={styles.sectionSubtitle}>
              Key figures that drive our commitment
            </Text>
          </View>

          <View style={styles.statsGrid}>
            {STATS.map((s, i) => (
              <View key={i} style={styles.statCard}>
                <View style={[styles.statIconWrap, { backgroundColor: s.color + '14' }]}>
                  <Ionicons name={s.icon} size={22} color={s.color} />
                </View>
                <Text style={[styles.statValue, { color: s.color }]}>{s.value}</Text>
                <Text style={styles.statLabel}>{s.label}</Text>
                <Text style={styles.statSub}>{s.sub}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ========== SERVICES ========== */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionBadge}>
              <Text style={styles.sectionBadgeText}>SERVICES</Text>
            </View>
            <Text style={styles.sectionTitle}>Our Services</Text>
            <Text style={styles.sectionSubtitle}>
              Comprehensive tools for road safety intelligence
            </Text>
          </View>

          {SERVICES.map((svc, i) => (
            <View key={i} style={[styles.serviceCard, { borderColor: svc.border }]}>
              <View style={[styles.serviceIconWrap, { backgroundColor: svc.bg }]}>
                <Ionicons name={svc.icon} size={26} color={svc.color} />
              </View>
              <Text style={styles.serviceTitle}>{svc.title}</Text>
              <Text style={styles.serviceDesc}>{svc.desc}</Text>
              <TouchableOpacity style={styles.serviceLink} activeOpacity={0.7}>
                <Text style={[styles.serviceLinkText, { color: svc.color }]}>Learn more</Text>
                <Ionicons name="arrow-forward" size={14} color={svc.color} />
              </TouchableOpacity>
            </View>
          ))}
        </View>

        {/* ========== CTA ========== */}
        <LinearGradient
          colors={[Colors.gradientFrom, Colors.gradientTo]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.ctaSection}
        >
          <View style={styles.ctaDecor1} />
          <View style={styles.ctaDecor2} />

          <Ionicons name="people-outline" size={36} color="rgba(255,255,255,0.85)" />
          <Text style={styles.ctaTitle}>Join the Initiative</Text>
          <Text style={styles.ctaSubtitle}>
            Become part of the community working to make Algeria's roads safer for everyone. Your contribution matters.
          </Text>
          <TouchableOpacity
            style={styles.ctaBtn}
            activeOpacity={0.85}
            onPress={() => navigation.navigate('Login')}
          >
            <Text style={styles.ctaBtnText}>Get Started Now</Text>
            <Ionicons name="arrow-forward" size={18} color={Colors.primary} />
          </TouchableOpacity>
        </LinearGradient>

        {/* ========== FOOTER ========== */}
        <View style={styles.footer}>
          <View style={styles.footerLogoRow}>
            <Ionicons name="shield-checkmark" size={20} color={Colors.primary} />
            <Text style={styles.footerLogo}>SIARA</Text>
          </View>
          <Text style={styles.footerText}>
            AI-Powered Road Safety Intelligence for Algeria
          </Text>
          <View style={styles.footerDivider} />
          <Text style={styles.footerCopy}>{'\u00A9'} 2025 SIARA. All rights reserved.</Text>
        </View>
      </ScrollView>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/*  STYLES                                                             */
/* ------------------------------------------------------------------ */

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

  /* ---------- Hero ---------- */
  hero: {
    paddingTop: Platform.OS === 'ios' ? 64 : 52,
    paddingBottom: 40,
    paddingHorizontal: 24,
    alignItems: 'center',
    overflow: 'hidden',
  },
  heroDecor1: {
    position: 'absolute',
    top: -40,
    right: -40,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  heroDecor2: {
    position: 'absolute',
    bottom: -30,
    left: -50,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  heroLogoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 24,
  },
  heroLogoText: {
    color: Colors.white,
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: 4,
  },
  heroHeading: {
    color: Colors.white,
    fontSize: 30,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 38,
    marginBottom: 14,
  },
  heroSubtitle: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 340,
    marginBottom: 28,
  },
  heroBtns: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 28,
  },
  heroBtnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.white,
    paddingHorizontal: 22,
    paddingVertical: 13,
    borderRadius: 12,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  heroBtnPrimaryText: {
    color: Colors.primary,
    fontSize: 15,
    fontWeight: '700',
  },
  heroBtnGhost: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 22,
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  heroBtnGhostText: {
    color: Colors.white,
    fontSize: 15,
    fontWeight: '600',
  },
  trustBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  trustItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  trustText: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
    fontWeight: '600',
  },
  trustDivider: {
    width: 1,
    height: 14,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },

  /* ---------- Sections ---------- */
  section: {
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  sectionHeader: {
    alignItems: 'center',
    marginBottom: 24,
    marginTop: 36,
  },
  sectionBadge: {
    backgroundColor: Colors.violetLight,
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 20,
    marginBottom: 12,
  },
  sectionBadgeText: {
    color: Colors.primary,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  sectionTitle: {
    color: Colors.heading,
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
  },
  sectionSubtitle: {
    color: Colors.subtext,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 300,
  },

  /* ---------- How It Works ---------- */
  hiwCard: {
    backgroundColor: Colors.cardBg,
    borderRadius: 16,
    padding: 22,
    marginBottom: 14,
    alignItems: 'center',
    elevation: 3,
    shadowColor: Colors.cardShadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 12,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  hiwIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  hiwStepBadge: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Colors.violetLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  hiwStepText: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '800',
  },
  hiwTitle: {
    color: Colors.heading,
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  hiwDesc: {
    color: Colors.subtext,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    maxWidth: 280,
  },

  /* ---------- Mission ---------- */
  missionSection: {
    paddingHorizontal: 20,
    marginTop: 12,
    marginBottom: 8,
  },
  missionCard: {
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.violetBorder,
  },
  missionIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.white,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    elevation: 2,
    shadowColor: Colors.cardShadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
  },
  missionTitle: {
    color: Colors.heading,
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 12,
  },
  missionText: {
    color: Colors.text,
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
  },
  missionDivider: {
    width: 60,
    height: 2,
    backgroundColor: Colors.violetBorder,
    borderRadius: 1,
    marginVertical: 18,
  },
  missionQuoteRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  missionQuote: {
    color: Colors.subtext,
    fontSize: 13,
    fontStyle: 'italic',
    lineHeight: 19,
    flex: 1,
  },

  /* ---------- Stats ---------- */
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 14,
  },
  statCard: {
    width: CARD_WIDTH,
    backgroundColor: Colors.cardBg,
    borderRadius: 16,
    padding: 18,
    alignItems: 'center',
    elevation: 3,
    shadowColor: Colors.cardShadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 12,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  statIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '900',
    marginBottom: 4,
  },
  statLabel: {
    color: Colors.heading,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 4,
  },
  statSub: {
    color: Colors.subtext,
    fontSize: 11,
    textAlign: 'center',
  },

  /* ---------- Services ---------- */
  serviceCard: {
    backgroundColor: Colors.cardBg,
    borderRadius: 16,
    padding: 22,
    marginBottom: 14,
    borderWidth: 1,
    elevation: 3,
    shadowColor: Colors.cardShadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 12,
  },
  serviceIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  serviceTitle: {
    color: Colors.heading,
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 8,
  },
  serviceDesc: {
    color: Colors.subtext,
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 14,
  },
  serviceLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  serviceLinkText: {
    fontSize: 13,
    fontWeight: '700',
  },

  /* ---------- CTA ---------- */
  ctaSection: {
    marginHorizontal: 20,
    borderRadius: 20,
    paddingVertical: 42,
    paddingHorizontal: 28,
    alignItems: 'center',
    overflow: 'hidden',
    marginTop: 28,
    marginBottom: 32,
  },
  ctaDecor1: {
    position: 'absolute',
    top: -20,
    left: -20,
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  ctaDecor2: {
    position: 'absolute',
    bottom: -30,
    right: -30,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  ctaTitle: {
    color: Colors.white,
    fontSize: 24,
    fontWeight: '800',
    marginTop: 14,
    marginBottom: 10,
    textAlign: 'center',
  },
  ctaSubtitle: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 24,
    maxWidth: 300,
  },
  ctaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.white,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 12,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  ctaBtnText: {
    color: Colors.primary,
    fontSize: 15,
    fontWeight: '700',
  },

  /* ---------- Footer ---------- */
  footer: {
    backgroundColor: Colors.white,
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 24,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  footerLogoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  footerLogo: {
    color: Colors.primary,
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 2,
  },
  footerText: {
    color: Colors.subtext,
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 16,
  },
  footerDivider: {
    width: 60,
    height: 1,
    backgroundColor: Colors.border,
    marginBottom: 16,
  },
  footerCopy: {
    color: Colors.greyLight,
    fontSize: 11,
  },
});
