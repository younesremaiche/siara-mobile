import React from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../theme/colors';
import { useAuthStore } from '../../stores/authStore';

export function PoliceStatCard({ label, value, tone = Colors.primary }) {
  return (
    <View style={styles.statCard}>
      <Text style={[styles.statValue, { color: tone }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export function PoliceSectionCard({ title, children, actionLabel, onActionPress }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{title}</Text>
        {actionLabel && onActionPress ? (
          <TouchableOpacity onPress={onActionPress} activeOpacity={0.85}>
            <Text style={styles.cardAction}>{actionLabel}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {children}
    </View>
  );
}

export function PoliceChip({ label, active, onPress }) {
  return (
    <TouchableOpacity
      style={[styles.chip, active && styles.chipActive]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

export function PoliceListItem({ title, subtitle, meta = [], right, onPress }) {
  const content = (
    <View style={styles.listItem}>
      <View style={styles.listItemMain}>
        <Text style={styles.listItemTitle}>{title}</Text>
        {subtitle ? <Text style={styles.listItemSubtitle}>{subtitle}</Text> : null}
        {meta.length ? (
          <View style={styles.metaWrap}>
            {meta.filter(Boolean).map((item) => (
              <Text key={item} style={styles.metaText}>{item}</Text>
            ))}
          </View>
        ) : null}
      </View>
      {right ? <View style={styles.listItemRight}>{right}</View> : null}
    </View>
  );

  if (!onPress) {
    return content;
  }

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.88}>
      {content}
    </TouchableOpacity>
  );
}

export default function PoliceScreenFrame({
  title,
  subtitle,
  stats = [],
  loading = false,
  error = '',
  onRefresh,
  children,
}) {
  const isPolice = useAuthStore((state) => state.isPolice);
  const activeMode = useAuthStore((state) => state.activeMode);
  const switchToUserMode = useAuthStore((state) => state.switchToUserMode);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={onRefresh ? <RefreshControl refreshing={loading} onRefresh={onRefresh} tintColor={Colors.primary} /> : undefined}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        <View style={styles.headerActions}>
          {isPolice && activeMode === 'police' ? (
            <TouchableOpacity style={styles.modeButton} onPress={switchToUserMode} activeOpacity={0.85}>
              <Ionicons name="swap-horizontal" size={16} color={Colors.secondary} />
              <Text style={styles.modeButtonText}>Switch to User Mode</Text>
            </TouchableOpacity>
          ) : null}
          {onRefresh ? (
            <TouchableOpacity style={styles.refreshButton} onPress={onRefresh} activeOpacity={0.85}>
              <Ionicons name="refresh" size={18} color={Colors.heading} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {stats.length ? (
        <View style={styles.statsRow}>
          {stats.map((item) => (
            <PoliceStatCard key={item.label} label={item.label} value={item.value} tone={item.tone} />
          ))}
        </View>
      ) : null}

      {error ? (
        <View style={[styles.card, styles.errorCard]}>
          <Text style={styles.errorTitle}>Something went wrong</Text>
          <Text style={styles.errorBody}>{error}</Text>
        </View>
      ) : null}

      {loading && !children ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="small" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      ) : null}

      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 48,
    paddingBottom: 100,
    gap: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerCopy: {
    flex: 1,
    marginRight: 12,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  title: {
    color: Colors.heading,
    fontSize: 28,
    fontWeight: '800',
  },
  subtitle: {
    color: Colors.subtext,
    fontSize: 13,
    marginTop: 4,
  },
  refreshButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.blueLight,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: Colors.blueBorder,
  },
  modeButtonText: {
    color: Colors.secondary,
    fontSize: 12,
    fontWeight: '700',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.white,
    borderRadius: 18,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.borderLight,
    gap: 4,
  },
  statValue: {
    fontSize: 22,
    fontWeight: '800',
  },
  statLabel: {
    color: Colors.subtext,
    fontSize: 12,
    textAlign: 'center',
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    gap: 14,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTitle: {
    color: Colors.heading,
    fontSize: 18,
    fontWeight: '800',
  },
  cardAction: {
    color: Colors.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  chipText: {
    color: Colors.heading,
    fontSize: 13,
    fontWeight: '600',
  },
  chipTextActive: {
    color: Colors.white,
  },
  listItem: {
    backgroundColor: Colors.bg,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  listItemMain: {
    flex: 1,
    gap: 6,
  },
  listItemRight: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  listItemTitle: {
    color: Colors.heading,
    fontSize: 15,
    fontWeight: '800',
  },
  listItemSubtitle: {
    color: Colors.text,
    fontSize: 13,
    lineHeight: 19,
  },
  metaWrap: {
    gap: 4,
  },
  metaText: {
    color: Colors.subtext,
    fontSize: 12,
  },
  errorCard: {
    borderColor: 'rgba(220,38,38,0.18)',
    backgroundColor: 'rgba(220,38,38,0.06)',
  },
  errorTitle: {
    color: Colors.btnDanger,
    fontSize: 15,
    fontWeight: '800',
  },
  errorBody: {
    color: Colors.text,
    fontSize: 13,
  },
  loadingWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    gap: 10,
  },
  loadingText: {
    color: Colors.subtext,
    fontSize: 13,
  },
});
