import React from 'react';
import { Text } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';

import PoliceScreenFrame, { PoliceListItem, PoliceSectionCard } from '../../components/police/PoliceScreenFrame';
import { Colors } from '../../theme/colors';
import { listPoliceIncidents } from '../../services/policeService';

export default function PoliceIncidentsScreen() {
  const navigation = useNavigation();
  const [incidents, setIncidents] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');

  const loadIncidents = React.useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const payload = await listPoliceIncidents({
        scope: 'active',
        page: 1,
        pageSize: 40,
      });
      setIncidents(payload.items);
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

  return (
    <PoliceScreenFrame
      title="Active Incidents"
      subtitle="Open incidents in your police work zone"
      loading={loading}
      error={error}
      onRefresh={loadIncidents}
      stats={[
        { label: 'Open', value: incidents.length, tone: Colors.primary },
        { label: 'High', value: incidents.filter((item) => ['high', 'critical'].includes(item.severity)).length, tone: Colors.severityHigh },
        { label: 'Assigned', value: incidents.filter((item) => item.assignedOfficer?.id).length, tone: Colors.secondary },
      ]}
    >
      <PoliceSectionCard title="Incident Stream">
        {incidents.map((incident) => (
          <PoliceListItem
            key={incident.id}
            title={`${incident.displayId} · ${incident.title}`}
            subtitle={incident.description || 'No description provided.'}
            meta={[incident.locationText, `Status: ${incident.status}`, incident.timeAgo]}
            onPress={() => navigation.navigate('PoliceIncidentDetail', { incidentId: incident.id })}
          />
        ))}
        {!loading && !incidents.length ? <Text style={{ color: Colors.subtext }}>No active incidents are currently assigned to your zone.</Text> : null}
      </PoliceSectionCard>
    </PoliceScreenFrame>
  );
}
