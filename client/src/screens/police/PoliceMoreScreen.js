import React from 'react';
import { TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import PoliceScreenFrame, { PoliceSectionCard } from '../../components/police/PoliceScreenFrame';
import { Colors } from '../../theme/colors';

const ITEMS = [
  { route: 'PoliceMyIncidents', icon: 'briefcase-outline', title: 'My Incidents', subtitle: 'Reports created by you or assigned to you' },
  { route: 'PoliceFieldReports', icon: 'document-text-outline', title: 'Field Reports', subtitle: 'Citizen and officer reports for police review' },
  { route: 'PoliceOperationHistory', icon: 'time-outline', title: 'Operation History', subtitle: 'Audit log of officer actions' },
  { route: 'PoliceZoneSetup', icon: 'location-outline', title: 'Working Zone', subtitle: 'Review or update your current Wilaya and Commune' },
];

export default function PoliceMoreScreen({ navigation }) {
  return (
    <PoliceScreenFrame
      title="Police Tools"
      subtitle="Additional police sections and setup"
      stats={[
        { label: 'Sections', value: ITEMS.length, tone: Colors.primary },
      ]}
    >
      <PoliceSectionCard title="More">
        <View style={styles.grid}>
          {ITEMS.map((item) => (
            <TouchableOpacity key={item.route} style={styles.tile} onPress={() => navigation.navigate(item.route)} activeOpacity={0.88}>
              <View style={styles.iconWrap}>
                <Ionicons name={item.icon} size={22} color={Colors.primary} />
              </View>
              <Text style={styles.title}>{item.title}</Text>
              <Text style={styles.subtitle}>{item.subtitle}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </PoliceSectionCard>
    </PoliceScreenFrame>
  );
}

const styles = StyleSheet.create({
  grid: {
    gap: 12,
  },
  tile: {
    backgroundColor: Colors.bg,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    padding: 16,
    gap: 8,
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: Colors.violetLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: Colors.heading,
    fontSize: 15,
    fontWeight: '800',
  },
  subtitle: {
    color: Colors.subtext,
    fontSize: 12,
    lineHeight: 18,
  },
});
