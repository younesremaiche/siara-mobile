import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

import PoliceScreenFrame, { PoliceListItem, PoliceSectionCard } from '../../components/police/PoliceScreenFrame';
import { Colors } from '../../theme/colors';
import { getPoliceDashboard, syncPoliceDeviceLocation } from '../../services/policeService';
import { useAuthStore } from '../../stores/authStore';

export default function PoliceDashboardScreen() {
  const navigation = useNavigation();
  const switchToUserMode = useAuthStore((s) => s.switchToUserMode);
  const [dashboard, setDashboard] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');

  const loadDashboard = React.useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      await syncPoliceDeviceLocation().catch(() => null);
      const payload = await getPoliceDashboard();
      setDashboard(payload);
    } catch (requestError) {
      setError(requestError.message || 'Failed to load police dashboard.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      void loadDashboard();
    }, [loadDashboard]),
  );

  const stats = [
    { label: 'Active', value: dashboard?.stats?.activeCount || 0, tone: Colors.primary },
    { label: 'Priority', value: dashboard?.stats?.highPriorityCount || 0, tone: Colors.severityHigh },
    { label: 'Queue', value: dashboard?.stats?.pendingVerificationCount || 0, tone: Colors.secondary },
    { label: 'Alerts', value: dashboard?.stats?.unreadAlertsCount || 0, tone: Colors.accent },
  ];

  return (
    <PoliceScreenFrame
      title="Police Dashboard"
      subtitle={`Live overview for ${dashboard?.workZone?.commune?.name || dashboard?.workZone?.wilaya?.name || 'your zone'}`}
      stats={stats}
      loading={loading}
      error={error}
      onRefresh={loadDashboard}
    >
      <PoliceSectionCard title="Officer Status">
        <PoliceListItem
          title={dashboard?.officer?.name || 'Officer'}
          subtitle={dashboard?.officer?.rank || 'Police role'}
          meta={[
            `Badge: ${dashboard?.officer?.badgeNumber || 'Pending'}`,
            `Wilaya: ${dashboard?.workZone?.wilaya?.name || 'Not selected'}`,
            `Commune: ${dashboard?.workZone?.commune?.name || 'Not selected'}`,
          ]}
        />
      </PoliceSectionCard>

      <PoliceSectionCard title="Active Incidents" actionLabel="Open" onActionPress={() => navigation.navigate('PoliceActiveIncidents')}>
        {(dashboard?.activeIncidents || []).slice(0, 5).map((incident) => (
          <PoliceListItem
            key={incident.id}
            title={incident.displayId}
            subtitle={incident.title}
            meta={[incident.locationText, `Status: ${incident.status}`, incident.timeAgo]}
            onPress={() => navigation.navigate('PoliceIncidentDetail', { incidentId: incident.id })}
          />
        ))}
        {!loading && !(dashboard?.activeIncidents || []).length ? <Text style={{ color: Colors.subtext }}>No active incidents in your zone.</Text> : null}
      </PoliceSectionCard>

      <PoliceSectionCard title="Nearby Incidents" actionLabel="Open" onActionPress={() => navigation.navigate('PoliceNearbyIncidents')}>
        {dashboard?.nearbyLocationRequired ? (
          <Text style={{ color: Colors.subtext }}>Location is required to show incidents within 500 meters.</Text>
        ) : (dashboard?.nearbyIncidents || []).slice(0, 5).map((incident) => (
          <PoliceListItem
            key={incident.id}
            title={incident.displayId}
            subtitle={incident.title}
            meta={[incident.locationText, incident.distanceLabel || 'Nearby', `Status: ${incident.status}`]}
            onPress={() => navigation.navigate('PoliceIncidentDetail', { incidentId: incident.id })}
          />
        ))}
        {!loading && !dashboard?.nearbyLocationRequired && !(dashboard?.nearbyIncidents || []).length ? (
          <Text style={{ color: Colors.subtext }}>No nearby incidents were found.</Text>
        ) : null}
      </PoliceSectionCard>

      <PoliceSectionCard title="Recent History" actionLabel="Full history" onActionPress={() => navigation.navigate('PoliceOperationHistory')}>
        {(dashboard?.recentHistory || []).slice(0, 5).map((item) => (
          <PoliceListItem
            key={item.id}
            title={item.actionType.replace(/_/g, ' ')}
            subtitle={item.note || 'Police action recorded'}
            meta={[item.createdAtLabel, item.reportId ? `Incident: ${item.reportId}` : null]}
          />
        ))}
      </PoliceSectionCard>

      {/* Switch to User Mode (web parity) */}
      <TouchableOpacity
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          backgroundColor: Colors.violetLight,
          borderRadius: 16,
          paddingVertical: 14,
          borderWidth: 1,
          borderColor: Colors.violetBorder,
        }}
        onPress={switchToUserMode}
        activeOpacity={0.85}
      >
        <Ionicons name="swap-horizontal" size={16} color={Colors.primary} />
        <Text style={{ color: Colors.primary, fontWeight: '800' }}>Switch to User Mode</Text>
        <Ionicons name="arrow-forward" size={14} color={Colors.primary} />
      </TouchableOpacity>

      <View style={{ flexDirection: 'row', gap: 12 }}>
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: Colors.primary, borderRadius: 16, paddingVertical: 14, alignItems: 'center' }}
          onPress={() => navigation.navigate('PoliceAlerts')}
          activeOpacity={0.88}
        >
          <Text style={{ color: Colors.white, fontWeight: '800' }}>Alert Center</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: Colors.white, borderRadius: 16, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: Colors.border }}
          onPress={() => navigation.navigate('PoliceMore')}
          activeOpacity={0.88}
        >
          <Text style={{ color: Colors.heading, fontWeight: '800' }}>More Tools</Text>
        </TouchableOpacity>
      </View>
    </PoliceScreenFrame>
  );
}
