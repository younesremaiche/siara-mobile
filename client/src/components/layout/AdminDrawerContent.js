import React, { useContext, useEffect, useState } from 'react';
import {
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AuthContext } from '../../contexts/AuthContext';
import { useAdminDrawer } from '../../contexts/AdminDrawerContext';
import { fetchAdminIncidentCounts } from '../../services/adminIncidentsService';
import { fetchAdminOperationalAlertCounts } from '../../services/adminOperationalAlertsService';
import { Colors } from '../../theme/colors';

function buildSections(incidentCounts, alertCounts) {
  return [
    {
      label: 'Overview',
      links: [
        { screen: 'AdminOverview', icon: 'grid-outline', text: 'System Overview' },
      ],
    },
    {
      label: 'Incident Management',
      links: [
        {
          screen: 'AdminIncidents',
          icon: 'flash-outline',
          text: 'Pending Review',
          badge: String(incidentCounts.pending ?? 0),
        },
        {
          screen: 'AdminIncidents',
          icon: 'alert-circle-outline',
          text: 'AI-Flagged High Risk',
          badge: String(incidentCounts['ai-flagged'] ?? 0),
          params: { filter: 'ai-flagged' },
        },
        {
          screen: 'AdminIncidents',
          icon: 'flag-outline',
          text: 'Community Flagged',
          badge: String(incidentCounts.community ?? 0),
          params: { filter: 'community' },
        },
        {
          screen: 'AdminIncidents',
          icon: 'git-merge-outline',
          text: 'Merged Incidents',
          badge: String(incidentCounts.merged ?? 0),
          params: { filter: 'merged' },
        },
        {
          screen: 'AdminIncidents',
          icon: 'archive-outline',
          text: 'Archived',
          badge: String(incidentCounts.archived ?? 0),
          params: { filter: 'archived' },
        },
      ],
    },
    {
      label: 'Alert Operations',
      links: [
        {
          screen: 'AdminAlerts',
          icon: 'notifications-outline',
          text: 'Active Alerts',
          badge: String(alertCounts.active ?? 0),
        },
        {
          screen: 'AdminAlerts',
          icon: 'time-outline',
          text: 'Scheduled Alerts',
          badge: String(alertCounts.scheduled ?? 0),
          params: { tab: 'scheduled' },
        },
        {
          screen: 'AdminAlerts',
          icon: 'warning-outline',
          text: 'Expiring / Expired',
          badge: String(alertCounts.expired ?? 0),
          params: { tab: 'expired' },
        },
        {
          screen: 'AdminAlerts',
          icon: 'megaphone-outline',
          text: 'Emergency Broadcast',
          badge: String(alertCounts.emergency ?? 0),
          params: { tab: 'emergency' },
        },
        {
          screen: 'AdminAlerts',
          icon: 'document-text-outline',
          text: 'Alert Templates',
          badge: String(alertCounts.templates ?? 0),
          params: { tab: 'templates' },
        },
      ],
    },
    {
      label: 'Risk & Zones',
      links: [
        { screen: 'AdminZones', icon: 'map-outline', text: 'Risk Heatmap' },
        {
          screen: 'AdminZones',
          icon: 'location-outline',
          text: 'Zone Management',
          params: { tab: 'table' },
        },
        {
          screen: 'AdminZones',
          icon: 'bar-chart-outline',
          text: 'Wilaya Risk Ranking',
          params: { tab: 'ranking' },
        },
      ],
    },
    {
      label: 'AI & Model Supervision',
      links: [
        { screen: 'AdminAI', icon: 'trending-up-outline', text: 'Accuracy Trends' },
        {
          screen: 'AdminAI',
          icon: 'apps-outline',
          text: 'Confusion Matrix',
          params: { tab: 'confusion' },
        },
        {
          screen: 'AdminAI',
          icon: 'swap-horizontal-outline',
          text: 'Override Logs',
          params: { tab: 'overrides' },
        },
      ],
    },
    {
      label: 'User Governance',
      links: [
        { screen: 'AdminUsers', icon: 'people-outline', text: 'All Users' },
        {
          screen: 'AdminUsers',
          icon: 'star-outline',
          text: 'Top Contributors',
          params: { filter: 'trusted' },
        },
      ],
    },
    {
      label: 'Data & Analytics',
      links: [
        { screen: 'AdminAnalytics', icon: 'analytics-outline', text: 'Analytics Dashboard' },
      ],
    },
    {
      label: 'System',
      links: [
        { screen: 'AdminSystem', icon: 'settings-outline', text: 'Configuration' },
      ],
    },
  ];
}

export default function AdminDrawerContent(props) {
  const { logout } = useContext(AuthContext);
  const adminDrawer = useAdminDrawer();
  const [incidentCounts, setIncidentCounts] = useState({
    pending: 0,
    'ai-flagged': 0,
    community: 0,
    merged: 0,
    archived: 0,
  });
  const [alertCounts, setAlertCounts] = useState({
    all: 0,
    active: 0,
    scheduled: 0,
    expired: 0,
    emergency: 0,
    templates: 0,
  });

  useEffect(() => {
    const controller = new AbortController();

    async function loadCounts() {
      const [incidentResult, alertResult] = await Promise.allSettled([
        fetchAdminIncidentCounts({
          signal: controller.signal,
        }),
        fetchAdminOperationalAlertCounts({
          signal: controller.signal,
        }),
      ]);

      if (controller.signal.aborted) {
        return;
      }

      if (incidentResult.status === 'fulfilled') {
        setIncidentCounts(incidentResult.value);
      }

      if (alertResult.status === 'fulfilled') {
        setAlertCounts(alertResult.value);
      }
    }

    loadCounts().catch(() => {
      // Keep the drawer usable if counts fail to load.
    });

    return () => controller.abort();
  }, []);

  const drawerRoute = props.state?.routes?.[props.state.index];
  const nestedState = drawerRoute?.state;
  const activeRoute =
    adminDrawer?.activeRoute ||
    nestedState?.routes?.[nestedState.index]?.name ||
    drawerRoute?.name;
  const sections = buildSections(incidentCounts, alertCounts);

  function handleNav(screen, params) {
    if (adminDrawer?.navigateTo) {
      adminDrawer.navigateTo(screen, params);
      return;
    }

    props.navigation?.navigate?.(screen, params);
    props.navigation?.closeDrawer?.();
  }

  function handleLogout() {
    adminDrawer?.closeDrawer?.();
    void logout();
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <View style={styles.brand}>
        <View style={styles.logoRow}>
          <View style={styles.logoDot} />
          <Text style={styles.brandName}>SIARA</Text>
        </View>
        <Text style={styles.brandSub}>Admin Panel</Text>
      </View>

      {sections.map((section) => (
        <View key={section.label} style={styles.section}>
          <Text style={styles.sectionLabel}>{section.label}</Text>
          {section.links.map((link, index) => {
            const isActive = activeRoute === link.screen;
            return (
              <TouchableOpacity
                key={`${link.screen}-${index}`}
                style={[styles.navLink, isActive && styles.navLinkActive]}
                onPress={() => handleNav(link.screen, link.params)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={link.icon}
                  size={18}
                  color={isActive ? Colors.btnPrimary : Colors.grey}
                  style={styles.navIcon}
                />
                <Text style={[styles.navText, isActive && styles.navTextActive]}>
                  {link.text}
                </Text>
                {link.badge != null ? (
                  <View style={[styles.badge, isActive && styles.badgeActive]}>
                    <Text style={styles.badgeText}>{link.badge}</Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            );
          })}
        </View>
      ))}

      <View style={styles.footer}>
        <View style={styles.envBadge}>
          <View style={[styles.dot, { backgroundColor: Colors.adminSuccess }]} />
          <Text style={styles.envText}>Production</Text>
        </View>
        <View style={styles.healthRow}>
          <View style={[styles.dot, { backgroundColor: Colors.adminSuccess }]} />
          <Text style={styles.healthText}>System Health: Operational</Text>
        </View>

        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.7}>
          <Ionicons name="log-out-outline" size={18} color={Colors.adminDanger} />
          <Text style={styles.logoutText}>Log Out</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.adminBg,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  brand: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: Colors.adminBorder,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logoDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.btnPrimary,
  },
  brandName: {
    color: Colors.btnPrimary,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 2,
  },
  brandSub: {
    color: Colors.grey,
    fontSize: 12,
    marginTop: 4,
    marginLeft: 20,
    fontWeight: '500',
  },
  section: {
    paddingHorizontal: 12,
    marginTop: 20,
  },
  sectionLabel: {
    color: Colors.grey,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 6,
    paddingLeft: 8,
  },
  navLink: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
    marginBottom: 2,
  },
  navLinkActive: {
    backgroundColor: 'rgba(124,58,237,0.12)',
  },
  navIcon: {
    width: 26,
    marginRight: 10,
  },
  navText: {
    flex: 1,
    color: Colors.adminText,
    fontSize: 13,
    fontWeight: '500',
  },
  navTextActive: {
    color: Colors.btnPrimary,
    fontWeight: '700',
  },
  badge: {
    backgroundColor: Colors.secondary,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    minWidth: 24,
    alignItems: 'center',
  },
  badgeActive: {
    backgroundColor: Colors.btnPrimary,
  },
  badgeText: {
    color: Colors.white,
    fontSize: 11,
    fontWeight: '700',
  },
  footer: {
    marginTop: 28,
    paddingHorizontal: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: Colors.adminBorder,
  },
  envBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  envText: {
    color: Colors.grey,
    fontSize: 12,
    fontWeight: '500',
  },
  healthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  healthText: {
    color: Colors.grey,
    fontSize: 11,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 20,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.adminDanger,
    backgroundColor: 'rgba(239,68,68,0.08)',
  },
  logoutText: {
    color: Colors.adminDanger,
    fontWeight: '700',
    fontSize: 14,
  },
});
