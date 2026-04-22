import React from 'react';
import { Text } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';

import PoliceScreenFrame, { PoliceListItem, PoliceSectionCard } from '../../components/police/PoliceScreenFrame';
import { Colors } from '../../theme/colors';
import { listPoliceIncidents, syncPoliceDeviceLocation } from '../../services/policeService';

export default function PoliceNearbyIncidentsScreen() {
  const navigation = useNavigation();
  const [incidents, setIncidents] = React.useState([]);
  const [locationRequired, setLocationRequired] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');

  const loadNearby = React.useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      await syncPoliceDeviceLocation().catch(() => null);
      const payload = await listPoliceIncidents({
        scope: 'nearby',
        page: 1,
        pageSize: 40,
      });
      setIncidents(payload.items);
      setLocationRequired(Boolean(payload.locationRequired));
    } catch (requestError) {
      setError(requestError.message || 'Failed to load nearby incidents.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      void loadNearby();
    }, [loadNearby]),
  );

  return (
    <PoliceScreenFrame
      title="Nearby Incidents"
      subtitle="Backend results using the 500 meter police radius"
      loading={loading}
      error={error}
      onRefresh={loadNearby}
      stats={[
        { label: 'Nearby', value: incidents.length, tone: Colors.primary },
        { label: 'High', value: incidents.filter((item) => ['high', 'critical'].includes(item.severity)).length, tone: Colors.severityHigh },
        { label: 'Radius', value: '500m', tone: Colors.secondary },
      ]}
    >
      <PoliceSectionCard title="Live Radius">
        {locationRequired ? <Text style={{ color: Colors.subtext }}>Location access is required before the API can return nearby incidents.</Text> : null}
        {incidents.map((incident) => (
          <PoliceListItem
            key={incident.id}
            title={`${incident.displayId} · ${incident.distanceLabel || 'Nearby'}`}
            subtitle={incident.title}
            meta={[incident.locationText, `Status: ${incident.status}`, incident.timeAgo]}
            onPress={() => navigation.navigate('PoliceIncidentDetail', { incidentId: incident.id })}
          />
        ))}
        {!loading && !locationRequired && !incidents.length ? <Text style={{ color: Colors.subtext }}>No incidents were found within 500 meters.</Text> : null}
      </PoliceSectionCard>
    </PoliceScreenFrame>
  );
}
