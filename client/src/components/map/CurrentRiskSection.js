import React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../theme/colors';
import { formatPercent } from '../../utils/mapHelpers';

function SentinelNotice({ sentinelInfo, compact = false }) {
  if (!sentinelInfo?.hasSentinel) return null;

  const notes = [...(sentinelInfo.reasons || []), ...(sentinelInfo.fallbackDetails || [])].slice(0, compact ? 1 : 4);

  return (
    <View style={[styles.noticeCard, compact && styles.noticeCardCompact]}>
      <View style={styles.noticeHeader}>
        <Ionicons name="warning-outline" size={14} color={Colors.warning} />
        <Text style={styles.noticeTitle}>Data quality notice</Text>
      </View>
      {sentinelInfo.bannerTitle ? <Text style={styles.noticeLead}>{sentinelInfo.bannerTitle}</Text> : null}
      {notes.map((note) => (
        <Text key={note} style={styles.noticeText}>- {note}</Text>
      ))}
    </View>
  );
}

export default function CurrentRiskSection({
  riskDisplay,
  currentRiskState = 'idle',
  currentRiskError = '',
  sentinelInfo,
  onExplain,
  compact = false,
}) {
  if (!riskDisplay && currentRiskState === 'idle' && !currentRiskError) return null;

  const level = riskDisplay?.level ? `${riskDisplay.level.charAt(0).toUpperCase()}${riskDisplay.level.slice(1)}` : 'Unknown';
  const percent = riskDisplay?.pct != null ? formatPercent(riskDisplay.pct) : '--';

  return (
    <View style={[styles.card, compact && styles.cardCompact]}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <View style={[styles.indicator, { backgroundColor: riskDisplay?.color || Colors.grey }]} />
          <Text style={styles.title}>Current Risk</Text>
          {currentRiskState === 'loading' ? <ActivityIndicator size="small" color={Colors.primary} style={styles.inlineState} /> : null}
          {currentRiskState === 'error' ? <Ionicons name="alert-circle" size={16} color={Colors.error} style={styles.inlineState} /> : null}
        </View>
        {!compact && onExplain ? (
          <TouchableOpacity style={styles.explainBtn} onPress={onExplain}>
            <Ionicons name="bulb-outline" size={15} color={Colors.primary} />
            <Text style={styles.explainText}>Why?</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={[styles.metricRow, compact && styles.metricRowCompact]}>
        <View style={styles.metricGroup}>
          <Text style={[styles.percent, riskDisplay?.color ? { color: riskDisplay.color } : null]}>{percent}</Text>
          <Text style={styles.level}>{level}</Text>
        </View>
        {compact ? (
          <Text style={styles.compactHint}>Drag up for route, forecast, and context details.</Text>
        ) : currentRiskError ? (
          <Text style={styles.errorText}>{currentRiskError}</Text>
        ) : (
          <Text style={styles.helperText}>Local safety score for your current area and selected time.</Text>
        )}
      </View>

      <SentinelNotice sentinelInfo={sentinelInfo} compact={compact} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    borderRadius: 18,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 12,
  },
  cardCompact: {
    paddingVertical: 12,
    gap: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  indicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  title: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.heading,
  },
  inlineState: {
    marginLeft: 8,
  },
  explainBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: Colors.violetLight,
    borderWidth: 1,
    borderColor: Colors.violetBorder,
  },
  explainText: {
    marginLeft: 4,
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primary,
  },
  metricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  metricRowCompact: {
    alignItems: 'flex-start',
  },
  metricGroup: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  percent: {
    fontSize: 30,
    fontWeight: '800',
    color: Colors.heading,
  },
  level: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.subtext,
  },
  helperText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    color: Colors.subtext,
  },
  compactHint: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    color: Colors.subtext,
  },
  errorText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    color: Colors.error,
  },
  noticeCard: {
    padding: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(245,158,11,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.24)',
    gap: 4,
  },
  noticeCardCompact: {
    paddingVertical: 10,
  },
  noticeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  noticeTitle: {
    marginLeft: 6,
    fontSize: 12,
    fontWeight: '800',
    color: Colors.heading,
  },
  noticeLead: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.text,
  },
  noticeText: {
    fontSize: 11,
    lineHeight: 16,
    color: Colors.text,
  },
});
