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
  'Interactive road accident risk map with heatmap overlays',
  'AI-powered danger prediction based on historical data',
  'Real-time community incident reports and alerts',
  'Driver behavior assessment quiz and scoring',
  'Comprehensive analytics dashboard with trend analysis',
];

const STEPS = [
  { title: 'Create an Account', desc: 'Sign up or use demo access to get started instantly.' },
  { title: 'Explore the Risk Map', desc: 'View the interactive map highlighting accident hotspots across Algeria.' },
  { title: 'Take the Assessment', desc: 'Complete the driving behavior questionnaire to get your safety score.' },
  { title: 'Report Incidents', desc: 'Contribute to the community by reporting road incidents in real time.' },
  { title: 'Set Up Alerts', desc: 'Configure notifications for your frequent routes and areas of interest.' },
];

export default function DescriptionScreen() {
  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.bg} />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Main Card ── */}
        <View style={styles.card}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.kickerBadge}>
              <Ionicons name="document-text-outline" size={12} color={Colors.secondary} />
              <Text style={styles.kickerText}>PROJECT OVERVIEW</Text>
            </View>
            <Text style={styles.title}>SIARA Project Description</Text>
            <View style={styles.titleUnderline} />
          </View>

          {/* ── Description ── */}
          <View style={styles.section}>
            <Text style={styles.bodyText}>
              SIARA is a comprehensive platform for intelligent road accident risk analysis in Algeria.
              It combines AI prediction models, community-sourced data, and real-time mapping to help
              reduce road accidents and save lives.
            </Text>
            <Text style={[styles.bodyText, { marginTop: 10 }]}>
              The platform serves drivers, authorities, and urban planners by providing data-driven
              insights and actionable intelligence about road safety conditions.
            </Text>
          </View>

          {/* ── Key Features ── */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionIconWrap}>
                <Ionicons name="flash-outline" size={18} color={Colors.primary} />
              </View>
              <Text style={styles.sectionTitle}>Key Features</Text>
            </View>

            {FEATURES.map((feature, idx) => (
              <View key={idx} style={styles.featureRow}>
                <View style={styles.featureArrow}>
                  <Ionicons name="arrow-forward" size={14} color={Colors.primary} />
                </View>
                <Text style={styles.featureText}>{feature}</Text>
              </View>
            ))}
          </View>

          {/* Divider */}
          <View style={styles.divider} />

          {/* ── Getting Started ── */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIconWrap, styles.sectionIconBlue]}>
                <Ionicons name="rocket-outline" size={18} color={Colors.secondary} />
              </View>
              <Text style={styles.sectionTitle}>Getting Started</Text>
            </View>

            {STEPS.map((step, idx) => (
              <View key={idx} style={styles.stepRow}>
                <View style={styles.stepNumberWrap}>
                  <Text style={styles.stepNumber}>{idx + 1}</Text>
                </View>
                <View style={styles.stepContent}>
                  <Text style={styles.stepTitle}>{step.title}</Text>
                  <Text style={styles.stepDesc}>{step.desc}</Text>
                </View>
                {idx < STEPS.length - 1 && <View style={styles.stepConnector} />}
              </View>
            ))}
          </View>

          {/* ── Footer Note ── */}
          <View style={styles.footerNote}>
            <Ionicons name="bulb-outline" size={16} color={Colors.warning} />
            <Text style={styles.footerNoteText}>
              Tip: Use the Quick Demo Access on the login screen to explore all features without
              creating an account.
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
    marginBottom: 22,
  },
  kickerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Colors.blueLight,
    borderWidth: 1,
    borderColor: Colors.blueBorder,
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 20,
    marginBottom: 14,
  },
  kickerText: {
    color: Colors.secondary,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  title: {
    fontSize: 23,
    fontWeight: '800',
    color: Colors.heading,
    textAlign: 'center',
    marginBottom: 10,
  },
  titleUnderline: {
    width: 50,
    height: 3,
    borderRadius: 2,
    backgroundColor: Colors.primary,
  },

  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 6,
    marginHorizontal: 10,
    marginBottom: 22,
  },

  /* ── Sections ── */
  section: {
    marginBottom: 22,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
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
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 12,
    paddingLeft: 4,
  },
  featureArrow: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: Colors.violetLight,
    borderWidth: 1,
    borderColor: Colors.violetBorder,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 0,
  },
  featureText: {
    color: Colors.textDark,
    fontSize: 14,
    flex: 1,
    fontWeight: '500',
    lineHeight: 20,
  },

  /* ── Steps ── */
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    marginBottom: 18,
    position: 'relative',
  },
  stepNumberWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  stepNumber: {
    color: Colors.white,
    fontSize: 14,
    fontWeight: '800',
  },
  stepContent: {
    flex: 1,
    paddingTop: 2,
  },
  stepTitle: {
    color: Colors.heading,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 3,
  },
  stepDesc: {
    color: Colors.subtext,
    fontSize: 13,
    lineHeight: 19,
  },
  stepConnector: {
    position: 'absolute',
    left: 15,
    top: 34,
    width: 2,
    height: 22,
    backgroundColor: Colors.violetBorder,
    zIndex: 1,
  },

  /* ── Footer Note ── */
  footerNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: 'rgba(244,162,97,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(244,162,97,0.2)',
    borderRadius: 14,
    padding: 14,
  },
  footerNoteText: {
    color: Colors.text,
    fontSize: 13,
    lineHeight: 19,
    flex: 1,
  },
});
