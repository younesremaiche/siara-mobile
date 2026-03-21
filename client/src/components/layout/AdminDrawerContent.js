import React, { useContext } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { DrawerContentScrollView } from '@react-navigation/drawer';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { AuthContext } from '../../contexts/AuthContext';
import { Colors } from '../../theme/colors';

// ── Navigation sections with Ionicons icon names ────────────────────────────
const sections = [
  {
    label: 'Overview',
    links: [
      { screen: 'AdminOverview', icon: 'grid-outline', text: 'System Overview' },
    ],
  },
  {
    label: 'Incident Management',
    links: [
      { screen: 'AdminIncidents', icon: 'flash-outline', text: 'Pending Review', badge: '8' },
      {
        screen: 'AdminIncidents',
        icon: 'alert-circle-outline',
        text: 'AI-Flagged High Risk',
        badge: '3',
        params: { filter: 'ai-flagged' },
      },
      {
        screen: 'AdminIncidents',
        icon: 'flag-outline',
        text: 'Community Flagged',
        badge: '2',
        params: { filter: 'community' },
      },
    ],
  },
  {
    label: 'Alert Operations',
    links: [
      { screen: 'AdminAlerts', icon: 'notifications-outline', text: 'Active Alerts', badge: '4' },
      {
        screen: 'AdminAlerts',
        icon: 'megaphone-outline',
        text: 'Emergency Broadcast',
        params: { tab: 'emergency' },
      },
      {
        screen: 'AdminAlerts',
        icon: 'document-text-outline',
        text: 'Alert Templates',
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
      { screen: 'AdminUsers', icon: 'people-outline', text: 'All Users', badge: '2' },
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

// ── Component ────────────────────────────────────────────────────────────────
export default function AdminDrawerContent(props) {
  const navigation = useNavigation();
  const { logout } = useContext(AuthContext);

  // Determine active route name for highlighting
  const activeRoute = props.state?.routes?.[props.state.index]?.name;

  function handleNav(screen, params) {
    navigation.navigate('AdminMain', { screen, params });
    props.navigation.closeDrawer();
  }

  function handleLogout() {
    logout();
    navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
  }

  return (
    <DrawerContentScrollView
      {...props}
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
    >
      {/* ── Brand ──────────────────────────────────────────────────────── */}
      <View style={styles.brand}>
        <View style={styles.logoRow}>
          <View style={styles.logoDot} />
          <Text style={styles.brandName}>SIARA</Text>
        </View>
        <Text style={styles.brandSub}>Admin Panel</Text>
      </View>

      {/* ── Navigation sections ────────────────────────────────────────── */}
      {sections.map((section) => (
        <View key={section.label} style={styles.section}>
          <Text style={styles.sectionLabel}>{section.label}</Text>
          {section.links.map((link, i) => {
            const isActive = activeRoute === link.screen;
            return (
              <TouchableOpacity
                key={i}
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
                {link.badge ? (
                  <View style={[styles.badge, isActive && styles.badgeActive]}>
                    <Text style={styles.badgeText}>{link.badge}</Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            );
          })}
        </View>
      ))}

      {/* ── Footer ─────────────────────────────────────────────────────── */}
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
    </DrawerContentScrollView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.adminBg,
  },
  scrollContent: {
    paddingBottom: 40,
  },

  // Brand
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

  // Sections
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

  // Nav links
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

  // Badges
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

  // Footer
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
