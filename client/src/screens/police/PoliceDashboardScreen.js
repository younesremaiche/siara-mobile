import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import PoliceScreenFrame, {
  PoliceEmptyState,
  PoliceIncidentCard,
  PoliceOfficerCard,
  PoliceQuickActionTile,
  PoliceSectionCard,
  PoliceTimelineItem,
} from '../../components/police/PoliceScreenFrame';
import { Colors } from '../../theme/colors';
import {
  usePoliceDashboard,
  useSyncPoliceLocationMutation,
} from '../../features/police/hooks/usePoliceQueries';

export default function PoliceDashboardScreen() {
  const navigation = useNavigation();
  const {
    data: dashboard,
    isLoading: loading,
    error: dashboardError,
    refetch: refetchDashboard,
  } = usePoliceDashboard();
  const { mutate: syncPoliceLocation } = useSyncPoliceLocationMutation();

  useFocusEffect(
    React.useCallback(() => {
      syncPoliceLocation(undefined, {
        onSettled: () => {
          void refetchDashboard();
        },
      });
    }, [refetchDashboard, syncPoliceLocation]),
  );

  const error = dashboardError?.message || '';

  const stats = [
    {
      label: 'Active',
      value: dashboard?.stats?.activeCount || 0,
      sublabel: 'Open in zone',
      tone: Colors.secondary,
      icon: 'flash-outline',
    },
    {
      label: 'Critical',
      value: dashboard?.stats?.highPriorityCount || 0,
      sublabel: 'High severity',
      tone: Colors.severityCritical,
      icon: 'flame-outline',
    },
    {
      label: 'Queue',
      value: dashboard?.stats?.pendingVerificationCount || 0,
      sublabel: 'Awaiting review',
      tone: Colors.severityMedium,
      icon: 'hourglass-outline',
    },
    {
      label: 'Alerts',
      value: dashboard?.stats?.unreadAlertsCount || 0,
      sublabel: 'Unread',
      tone: Colors.accent,
      icon: 'notifications-outline',
    },
  ];

  const priorityIncidents = (dashboard?.activeIncidents || [])
    .filter((i) => ['high', 'critical'].includes(String(i.severity || '').toLowerCase()))
    .slice(0, 3);
  const recentHistory = (dashboard?.recentHistory || []).slice(0, 5);

  return (
    <PoliceScreenFrame
      title="Command Center"
      subtitle={`Live operations for ${dashboard?.workZone?.commune?.name || dashboard?.workZone?.wilaya?.name || 'your zone'}`}
      liveLabel={loading ? 'SYNCING…' : 'LIVE · SYNCED'}
      stats={stats}
      loading={loading}
      error={error}
      onRefresh={refetchDashboard}
    >
      <PoliceOfficerCard
        name={dashboard?.officer?.name}
        rank={dashboard?.officer?.rank}
        badgeNumber={dashboard?.officer?.badgeNumber}
        avatarUrl={dashboard?.officer?.avatarUrl}
        isOnDuty={dashboard?.officer?.isOnDuty !== false}
        wilaya={dashboard?.workZone?.wilaya?.name}
        commune={dashboard?.workZone?.commune?.name}
        onWorkZonePress={() => navigation.navigate('PoliceZoneSetup')}
      />

      <PoliceSectionCard
        title="Priority Incidents"
        icon="alert-circle-outline"
        count={priorityIncidents.length}
        actionLabel="Open stream"
        onActionPress={() => navigation.navigate('PoliceActiveIncidents')}
      >
        {priorityIncidents.length === 0 ? (
          <PoliceEmptyState
            icon="shield-checkmark-outline"
            title="No priority incidents"
            body="No high-severity reports are open in your zone right now."
          />
        ) : (
          priorityIncidents.map((incident) => (
            <PoliceIncidentCard
              key={incident.id}
              displayId={incident.displayId}
              title={incident.title}
              severity={incident.severity}
              status={incident.status}
              locationText={incident.locationText}
              description={incident.description}
              timeAgo={incident.timeAgo}
              onPress={() => navigation.navigate('PoliceIncidentDetail', { incidentId: incident.id })}
              onSecondaryAction={() => navigation.navigate('PoliceIncidentDetail', { incidentId: incident.id })}
              secondaryActionLabel="View"
              onPrimaryAction={() => navigation.navigate('PoliceIncidentDetail', { incidentId: incident.id, autoStart: true })}
              primaryActionLabel="Start Review"
            />
          ))
        )}
      </PoliceSectionCard>

      <PoliceSectionCard title="Quick Actions" icon="grid-outline">
        <View style={styles.actionGrid}>
          <PoliceQuickActionTile
            icon="shield-half-outline"
            tone={Colors.severityMedium}
            label="Verification"
            sublabel="Review pending reports"
            count={dashboard?.stats?.pendingVerificationCount || 0}
            onPress={() => navigation.navigate('PoliceActiveIncidents')}
          />
          <PoliceQuickActionTile
            icon="reader-outline"
            tone={Colors.secondary}
            label="All Incidents"
            sublabel="Live active stream"
            count={dashboard?.stats?.activeCount || 0}
            onPress={() => navigation.navigate('PoliceActiveIncidents')}
          />
          <PoliceQuickActionTile
            icon="briefcase-outline"
            tone={Colors.primary}
            label="My Assigned"
            sublabel="Cases on me"
            count={dashboard?.stats?.assignedToMeCount || 0}
            onPress={() => navigation.navigate('PoliceAssignedIncidents')}
          />
          <PoliceQuickActionTile
            icon="locate-outline"
            tone={Colors.accent}
            label="Nearby"
            sublabel="Within 500 m"
            count={(dashboard?.nearbyIncidents || []).length}
            onPress={() => navigation.navigate('PoliceNearbyIncidents')}
          />
        </View>
      </PoliceSectionCard>

      <PoliceSectionCard
        title="Activity"
        icon="pulse-outline"
        actionLabel="Full history"
        onActionPress={() => navigation.navigate('PoliceOperationHistory')}
      >
        {recentHistory.length === 0 ? (
          <PoliceEmptyState icon="time-outline" title="No recent activity" body="Police actions on this device will appear here." />
        ) : (
          recentHistory.map((item, idx) => (
            <PoliceTimelineItem
              key={item.id || idx}
              icon={timelineIconFor(item.actionType)}
              title={prettifyAction(item.actionType)}
              subtitle={item.note || (item.reportId ? `Incident ${item.reportId}` : 'Police action recorded')}
              timeLabel={item.createdAtLabel}
              isLast={idx === recentHistory.length - 1}
            />
          ))
        )}
      </PoliceSectionCard>

      <View style={styles.footerRow}>
        <TouchableOpacity style={styles.footerPrimary} onPress={() => navigation.navigate('PoliceAlerts')} activeOpacity={0.85}>
          <LinearGradient colors={['#1D4ED8', '#7A3DF0']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.footerGrad}>
            <Ionicons name="notifications-outline" size={16} color={Colors.white} />
            <Text style={styles.footerPrimaryText}>Alert Center</Text>
          </LinearGradient>
        </TouchableOpacity>
        <TouchableOpacity style={styles.footerGhost} onPress={() => navigation.navigate('PoliceMore')} activeOpacity={0.85}>
          <Ionicons name="grid-outline" size={16} color={Colors.heading} />
          <Text style={styles.footerGhostText}>More Tools</Text>
        </TouchableOpacity>
      </View>
    </PoliceScreenFrame>
  );
}

function prettifyAction(actionType) {
  if (!actionType) return 'Activity';
  return actionType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function timelineIconFor(actionType) {
  const t = String(actionType || '').toLowerCase();
  if (t.includes('verify')) return 'checkmark-circle';
  if (t.includes('reject')) return 'close-circle';
  if (t.includes('assign')) return 'person-add';
  if (t.includes('note')) return 'document-text';
  if (t.includes('manual')) return 'pencil';
  return 'ellipse';
}

const styles = StyleSheet.create({
  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  footerRow: { flexDirection: 'row', gap: 12 },
  footerPrimary: { flex: 1, borderRadius: 16, overflow: 'hidden' },
  footerGrad: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 8, paddingVertical: 15,
  },
  footerPrimaryText: { color: Colors.white, fontWeight: '800', fontSize: 14 },
  footerGhost: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 8,
    backgroundColor: Colors.white, borderRadius: 16, paddingVertical: 15,
    borderWidth: 1, borderColor: Colors.border,
  },
  footerGhostText: { color: Colors.heading, fontWeight: '800', fontSize: 14 },
});
