import React from 'react';
import { Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';

import PoliceScreenFrame, { PoliceChip, PoliceListItem, PoliceSectionCard } from '../../components/police/PoliceScreenFrame';
import { Colors } from '../../theme/colors';
import { listPoliceIncidents } from '../../services/policeService';

const FILTERS = ['all', 'pending', 'under_review', 'verified', 'dispatched', 'resolved'];

export default function PoliceMyIncidentsScreen() {
  const navigation = useNavigation();
  const [status, setStatus] = React.useState('all');
  const [incidents, setIncidents] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');

  const loadIncidents = React.useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const payload = await listPoliceIncidents({
        scope: 'my',
        page: 1,
        pageSize: 40,
        status: status === 'all' ? undefined : status,
      });
      setIncidents(payload.items);
    } catch (requestError) {
      setError(requestError.message || 'Failed to load assigned incidents.');
    } finally {
      setLoading(false);
    }
  }, [status]);

  useFocusEffect(
    React.useCallback(() => {
      void loadIncidents();
    }, [loadIncidents]),
  );

  return (
    <PoliceScreenFrame
      title="My Incidents"
      subtitle="Reports created by you or assigned to you"
      loading={loading}
      error={error}
      onRefresh={loadIncidents}
      stats={[
        { label: 'Visible', value: incidents.length, tone: Colors.primary },
        { label: 'Resolved', value: incidents.filter((item) => item.status === 'resolved').length, tone: Colors.accent },
      ]}
    >
      <PoliceSectionCard title="Status Filter">
        <Text style={{ color: Colors.subtext, marginBottom: 8 }}>Filter the incidents you are responsible for.</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {FILTERS.map((filter) => (
            <PoliceChip
              key={filter}
              label={filter.replace(/_/g, ' ')}
              active={status === filter}
              onPress={() => setStatus(filter)}
            />
          ))}
        </View>
      </PoliceSectionCard>

      <PoliceSectionCard title="Incident List">
        {incidents.map((incident) => (
          <PoliceListItem
            key={incident.id}
            title={`${incident.displayId} - ${incident.title}`}
            subtitle={incident.description || 'No description provided.'}
            meta={[incident.locationText, `Status: ${incident.status}`, incident.timeAgo]}
            onPress={() => navigation.navigate('PoliceIncidentDetail', { incidentId: incident.id })}
          />
        ))}
        {!loading && !incidents.length ? <Text style={{ color: Colors.subtext }}>No incidents match the current filter.</Text> : null}
      </PoliceSectionCard>
    </PoliceScreenFrame>
  );
}
