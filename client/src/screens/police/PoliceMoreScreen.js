import React from 'react';
import { TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import PoliceScreenFrame, { PoliceSectionCard } from '../../components/police/PoliceScreenFrame';
import { Colors } from '../../theme/colors';
import { useAuthStore } from '../../stores/authStore';
import { LinearGradient } from 'expo-linear-gradient';

const ITEMS = [
  { route: 'PoliceMyIncidents', icon: 'briefcase-outline', title: 'My Incidents', subtitle: 'Reports created by you or assigned to you' },
  { route: 'PoliceFieldReports', icon: 'document-text-outline', title: 'Field Reports', subtitle: 'Citizen and officer reports for police review' },
  { route: 'PoliceOperationHistory', icon: 'time-outline', title: 'Operation History', subtitle: 'Audit log of officer actions' },
  { route: 'PoliceZoneSetup', icon: 'location-outline', title: 'Working Zone', subtitle: 'Review or update your current Wilaya and Commune' },
];

export default function PoliceMoreScreen({ navigation }) {
  const switchToUserMode      = useAuthStore(st => st.switchToUserMode);
  const switchToSupervisorMode = useAuthStore(st => st.switchToSupervisorMode);
  const isSupervisor          = useAuthStore(st => st.isSupervisor);

  return (
    <PoliceScreenFrame
      title="Police Tools"
      subtitle="Additional police sections and setup"
      stats={[
        { label: 'Sections', value: ITEMS.length, tone: Colors.primary },
      ]}
    >
      <PoliceSectionCard title="Tools" icon="grid-outline">
        <View style={styles.grid}>
          {ITEMS.map((item) => (
            <TouchableOpacity key={item.route} style={styles.tile} onPress={() => navigation.navigate(item.route)} activeOpacity={0.88}>
              <View style={styles.tileLeft}>
                <View style={styles.iconWrap}>
                  <Ionicons name={item.icon} size={20} color={Colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.tileTitle}>{item.title}</Text>
                  <Text style={styles.tileSub}>{item.subtitle}</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={16} color={Colors.subtext} />
            </TouchableOpacity>
          ))}
        </View>
      </PoliceSectionCard>

      {/* Switch to Supervisor Mode — only for supervisors */}
      {isSupervisor && (
        <TouchableOpacity style={styles.switchCard} onPress={switchToSupervisorMode} activeOpacity={0.85}>
          <LinearGradient
            colors={['#1C1200', '#3B2600', '#5C3D00']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={styles.switchGrad}
          >
            <View style={[styles.switchIconWrap, { backgroundColor: 'rgba(245,158,11,0.2)' }]}>
              <Ionicons name="eye-outline" size={20} color="#F59E0B" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.switchTitle}>Switch to Supervisor Mode</Text>
              <Text style={styles.switchSub}>Access command center & officer monitoring</Text>
            </View>
            <Ionicons name="arrow-forward-circle" size={24} color="rgba(245,158,11,0.7)" />
          </LinearGradient>
        </TouchableOpacity>
      )}

      {/* Switch to User Mode */}
      <TouchableOpacity style={styles.switchCard} onPress={switchToUserMode} activeOpacity={0.85}>
        <LinearGradient
          colors={[Colors.gradientFrom, Colors.gradientTo]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={styles.switchGrad}
        >
          <View style={styles.switchIconWrap}>
            <Ionicons name="people-outline" size={20} color={Colors.white} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.switchTitle}>Switch to User Mode</Text>
            <Text style={styles.switchSub}>Return to the standard SIARA experience</Text>
          </View>
          <Ionicons name="arrow-forward-circle" size={24} color="rgba(255,255,255,0.7)" />
        </LinearGradient>
      </TouchableOpacity>
    </PoliceScreenFrame>
  );
}

const styles = StyleSheet.create({
  grid: { gap: 2 },

  tile: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  tileLeft: { flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 },
  iconWrap: {
    width: 42, height: 42, borderRadius: 12,
    backgroundColor: Colors.violetLight,
    alignItems: 'center', justifyContent: 'center',
  },
  tileTitle: { color: Colors.heading, fontSize: 14, fontWeight: '800' },
  tileSub: { color: Colors.subtext, fontSize: 12, lineHeight: 17, marginTop: 1 },

  switchCard: { borderRadius: 18, overflow: 'hidden' },
  switchGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 18,
    paddingHorizontal: 18,
  },
  switchIconWrap: {
    width: 44, height: 44, borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center', justifyContent: 'center',
  },
  switchTitle: { color: Colors.white, fontSize: 15, fontWeight: '800' },
  switchSub: { color: 'rgba(255,255,255,0.72)', fontSize: 12, marginTop: 2 },
});
