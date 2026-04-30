import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';

import PoliceScreenFrame, {
  PoliceChip,
  PoliceEmptyState,
  PoliceIncidentCard,
  PoliceSectionCard,
} from '../../components/police/PoliceScreenFrame';
import { Colors } from '../../theme/colors';
import { listPoliceIncidents } from '../../services/policeService';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'under_review', label: 'In Review' },
  { key: 'verified', label: 'Verified' },
  { key: 'high', label: 'High' },
];

export default function PoliceIncidentsScreen() {
  const navigation = useNavigation();
  const [incidents, setIncidents] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [filter, setFilter] = React.useState('all');

  const loadIncidents = React.useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const payload = await listPoliceIncidents({ scope: 'active', page: 1, pageSize: 40 });
      setIncidents(payload.items || []);
    } catch (requestError) {
      setError(requestError.message || 'Failed to load active incidents.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      void loadIncidents();
    }, [loadIncidents]),
  );

  const filtered = incidents.filter((i) => {
    if (filter === 'all') return true;
    if (filter === 'high') return ['high', 'critical'].includes(String(i.severity || '').toLowerCase());
    return String(i.status || '').toLowerCase() === filter;
  });

  const stats = [
    {
      label: 'Open',
      value: incidents.length,
      sublabel: 'Total active',
      tone: Colors.secondary,
      icon: 'flash-outline',
    },
    {
      label: 'High',
      value: incidents.filter((i) => ['high', 'critical'].includes(String(i.severity || '').toLowerCase())).length,
      sublabel: 'High severity',
      tone: Colors.severityCritical,
      icon: 'flame-outline',
    },
    {
      label: 'Assigned',
      value: incidents.filter((i) => i.assignedOfficer?.id).length,
      sublabel: 'Has officer',
      tone: Colors.primary,
      icon: 'person-outline',
    },
  ];

  return (
    <PoliceScreenFrame
      title="Active Incidents"
      subtitle="Open incidents in your police work zone"
      liveLabel={loading ? 'SYNCING…' : 'LIVE'}
      stats={stats}
      loading={loading}
      error={error}
      onRefresh={loadIncidents}
    >
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
        {FILTERS.map((f) => (
          <PoliceChip
            key={f.key}
            label={f.label}
            active={filter === f.key}
            onPress={() => setFilter(f.key)}
          />
        ))}
      </ScrollView>

      <PoliceSectionCard
        title={filter === 'all' ? 'Incident Stream' : `${FILTERS.find((f) => f.key === filter)?.label || 'Filtered'}`}
        icon="reader-outline"
        count={filtered.length}
      >
        {filtered.length === 0 ? (
          <PoliceEmptyState
            icon="shield-checkmark-outline"
            title={filter === 'all' ? 'No active incidents' : 'Nothing matches this filter'}
            body={filter === 'all'
              ? 'No active incidents are currently assigned to your zone.'
              : 'Try a different filter or pull down to refresh.'}
          />
        ) : (
          <View>
            {filtered.map((incident) => (
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
                primaryActionLabel="Take Action"
              />
            ))}
          </View>
        )}
      </PoliceSectionCard>
    </PoliceScreenFrame>
  );
}

const styles = StyleSheet.create({
  chipsRow: { gap: 8, paddingVertical: 2 },
});
