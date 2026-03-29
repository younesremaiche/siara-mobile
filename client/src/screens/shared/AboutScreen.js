import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Platform,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../theme/colors';

const FEATURES = [
  'AI-powered risk prediction engine',
  'Real-time incident detection and alerts',
  'Interactive risk heatmap of Algeria',
  'Community-driven incident reporting',
  'Driver behavior analysis via questionnaire',
  'Comprehensive analytics dashboard',
];

export default function AboutScreen() {
  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.bg} />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Main Card ── */}
        <View style={styles.card}>
          {/* Logo & Kicker */}
          <View style={styles.header}>
            <View style={styles.logoWrap}>
              <View style={styles.logoIcon}>
                <Ionicons name="navigate" size={20} color={Colors.white} />
              </View>
              <Text style={styles.logoText}>SIARA</Text>
            </View>
            <View style={styles.kickerBadge}>
              <Ionicons name="sparkles" size={12} color={Colors.primary} />
              <Text style={styles.kickerText}>AI PLATFORM</Text>
            </View>
          </View>

          <Text style={styles.title}>About SIARA</Text>

          {/* Divider */}
          <View style={styles.divider} />

          {/* ── Mission Section ── */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionIconWrap}>
                <Ionicons name="compass-outline" size={18} color={Colors.primary} />
              </View>
              <Text style={styles.sectionTitle}>Our Mission</Text>
            </View>
            <Text style={styles.bodyText}>
              SIARA (System for Intelligent Analysis of Road Accidents) is an AI-powered platform
              designed to analyze, predict, and help prevent road accidents across Algeria.
            </Text>
            <Text style={[styles.bodyText, { marginTop: 10 }]}>
              Algeria experiences a high rate of road accidents. SIARA leverages machine learning,
              real-time data, and community reports to provide actionable intelligence for drivers,
              authorities, and urban planners.
            </Text>
          </View>

          {/* ── Key Features Section ── */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIconWrap, styles.sectionIconBlue]}>
                <Ionicons name="layers-outline" size={18} color={Colors.secondary} />
              </View>
              <Text style={styles.sectionTitle}>Key Features</Text>
            </View>

            {FEATURES.map((feature, idx) => (
              <View key={idx} style={styles.featureRow}>
                <View style={styles.featureCheck}>
                  <Ionicons name="checkmark" size={14} color={Colors.primary} />
                </View>
                <Text style={styles.featureText}>{feature}</Text>
              </View>
            ))}
          </View>

          {/* ── Project Status Badge ── */}
          <View style={styles.statusCard}>
            <View style={styles.statusDot} />
            <View style={styles.statusContent}>
              <Text style={styles.statusLabel}>Project Status</Text>
              <Text style={styles.statusValue}>Active Development — Prototype Phase</Text>
            </View>
          </View>

          {/* ── Disclaimer ── */}
          <View style={styles.disclaimerWrap}>
            <Ionicons name="information-circle-outline" size={16} color={Colors.subtext} />
            <Text style={styles.disclaimerText}>
              This is a research and educational project. Data shown is for demonstration purposes only.
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 60 : 44,
    paddingBottom: 40,
  },

  /* ── Card ── */
  card: {
    backgroundColor: Colors.white,
    borderRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 30,
    paddingBottom: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.07,
    shadowRadius: 20,
    elevation: 8,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },

  /* ── Header ── */
  header: {
    alignItems: 'center',
    marginBottom: 8,
  },
  logoWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  logoIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    color: Colors.primary,
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: 3,
  },
  kickerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Colors.violetLight,
    borderWidth: 1,
    borderColor: Colors.violetBorder,
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 20,
  },
  kickerText: {
    color: Colors.primary,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
  },

  title: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.heading,
    textAlign: 'center',
    marginTop: 14,
    marginBottom: 6,
  },

  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 18,
    marginHorizontal: 10,
  },

  /* ── Sections ── */
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  sectionIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: Colors.violetLight,
    borderWidth: 1,
    borderColor: Colors.violetBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionIconBlue: {
    backgroundColor: Colors.blueLight,
    borderColor: Colors.blueBorder,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.heading,
  },
  bodyText: {
    color: Colors.text,
    fontSize: 14,
    lineHeight: 22,
  },

  /* ── Features ── */
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
    paddingLeft: 4,
  },
  featureCheck: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: Colors.violetLight,
    borderWidth: 1,
    borderColor: Colors.violetBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureText: {
    color: Colors.textDark,
    fontSize: 14,
    flex: 1,
    fontWeight: '500',
  },

  /* ── Status ── */
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: Colors.blueLight,
    borderWidth: 1,
    borderColor: Colors.blueBorder,
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.success,
    shadowColor: Colors.success,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 2,
  },
  statusContent: {
    flex: 1,
  },
  statusLabel: {
    color: Colors.subtext,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 3,
  },
  statusValue: {
    color: Colors.secondary,
    fontSize: 14,
    fontWeight: '700',
  },

  /* ── Disclaimer ── */
  disclaimerWrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: Colors.bg,
    borderRadius: 12,
    padding: 14,
  },
  disclaimerText: {
    color: Colors.subtext,
    fontSize: 12,
    lineHeight: 18,
    fontStyle: 'italic',
    flex: 1,
  },
});
