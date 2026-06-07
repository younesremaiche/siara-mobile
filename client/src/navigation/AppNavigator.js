import React from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../stores/authStore';
import { Colors } from '../theme/colors';

import SplashScreen from '../screens/shared/SplashScreen';
import LoginScreen from '../screens/shared/LoginScreen';
import RegisterScreen from '../screens/shared/RegisterScreen';
import VerifyEmailScreen from '../screens/shared/VerifyEmailScreen';
import ForgotPasswordScreen from '../screens/shared/ForgotPasswordScreen';
import ResetPasswordScreen from '../screens/shared/ResetPasswordScreen';
import AboutScreen from '../screens/shared/AboutScreen';
import DescriptionScreen from '../screens/shared/DescriptionScreen';

import HomeScreen from '../screens/user/HomeScreen';
import MapScreen from '../screens/user/MapScreen';
import NewsScreen from '../screens/user/NewsScreen';
import PredictionsScreen from '../screens/user/PredictionsScreen';
import AlertsScreen from '../screens/user/AlertsScreen';
import CreateAlertScreen from '../screens/user/CreateAlertScreen';
import ReportCreateScreen from '../screens/user/ReportCreateScreen';
import MyReportsScreen from '../screens/user/MyReportsScreen';
import IncidentDetailScreen from '../screens/user/IncidentDetailScreen';
import NotificationsScreen from '../screens/user/NotificationsScreen';
import UserDashboardScreen from '../screens/user/UserDashboardScreen';
import ProfileScreen from '../screens/user/ProfileScreen';
import SettingsScreen from '../screens/user/SettingsScreen';
import ServicesScreen from '../screens/user/ServicesScreen';
import ContactScreen from '../screens/user/ContactScreen';
import FullNavigationScreen from '../screens/user/FullNavigationScreen';

import AdminOverviewScreen from '../screens/admin/AdminOverviewScreen';
import AdminIncidentsScreen from '../screens/admin/AdminIncidentsScreen';
import AdminIncidentReviewScreen from '../screens/admin/AdminIncidentReviewScreen';
import AdminAlertsScreen from '../screens/admin/AdminAlertsScreen';
import AdminAIMonitoringScreen from '../screens/admin/AdminAIMonitoringScreen';
import AdminUsersScreen from '../screens/admin/AdminUsersScreen';
import AdminZonesScreen from '../screens/admin/AdminZonesScreen';
import AdminSystemSettingsScreen from '../screens/admin/AdminSystemSettingsScreen';
import AdminAnalyticsScreen from '../screens/admin/AdminAnalyticsScreen';
import AdminServiceControlScreen from '../screens/admin/AdminServiceControlScreen';
import DashboardScreen from '../screens/admin/DashboardScreen';

import PoliceDashboardScreen from '../screens/police/PoliceDashboardScreen';
import PoliceIncidentsScreen from '../screens/police/PoliceIncidentsScreen';
import PoliceNearbyIncidentsScreen from '../screens/police/PoliceNearbyIncidentsScreen';
import PoliceAlertsScreen from '../screens/police/PoliceAlertsScreen';
import PoliceMoreScreen from '../screens/police/PoliceMoreScreen';
import PoliceMyIncidentsScreen from '../screens/police/PoliceMyIncidentsScreen';
import PoliceFieldReportsScreen from '../screens/police/PoliceFieldReportsScreen';
import PoliceOperationHistoryScreen from '../screens/police/PoliceOperationHistoryScreen';
import PoliceIncidentDetailScreen from '../screens/police/PoliceIncidentDetailScreen';
import PoliceWorkZoneScreen from '../screens/police/PoliceWorkZoneScreen';

import SupervisorDashboardScreen from '../screens/supervisor/SupervisorDashboardScreen';
import SupervisorOfficersScreen from '../screens/supervisor/SupervisorOfficersScreen';
import SupervisorIncidentsScreen from '../screens/supervisor/SupervisorIncidentsScreen';
import SupervisorAnalyticsScreen from '../screens/supervisor/SupervisorAnalyticsScreen';
import SupervisorMapScreen from '../screens/supervisor/SupervisorMapScreen';
import SupervisorAlertsScreen from '../screens/supervisor/SupervisorAlertsScreen';

import { flushPendingNotificationNavigation, navigationRef } from './navigationService';
import AdminDrawerShell from '../components/layout/AdminDrawerShell';
import { usePoliceMe } from '../features/police/hooks/usePoliceQueries';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
const AdminStack = createNativeStackNavigator();
const PoliceStack = createNativeStackNavigator();

function buildTabScreenOptions(route) {
  const icons = {
    Home: 'home',
    Map: 'map',
    News: 'newspaper',
    Dashboard: 'grid',
    Reports: 'document-text',
    Profile: 'person',
    PoliceDashboard: 'shield-checkmark',
    PoliceActiveIncidents: 'warning',
    PoliceNearbyIncidents: 'navigate',
    PoliceAlerts: 'notifications',
    PoliceMore: 'menu',
  };

  return {
    headerShown: false,
    tabBarStyle: {
      backgroundColor: Colors.white,
      borderTopColor: Colors.border,
      height: 64,
      paddingBottom: 8,
      paddingTop: 4,
      elevation: 8,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -2 },
      shadowOpacity: 0.08,
      shadowRadius: 8,
    },
    tabBarActiveTintColor: Colors.primary,
    tabBarInactiveTintColor: Colors.greyLight,
    tabBarLabelStyle: {
      fontSize: 11,
      fontWeight: '600',
    },
    tabBarIcon: ({ color, size }) => (
      <Ionicons name={icons[route.name] || 'ellipse'} size={size} color={color} />
    ),
  };
}

function PublicStack() {
  return (
    <Stack.Navigator
      initialRouteName="Welcome"
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.bg }, statusBarColor: Colors.bg, statusBarStyle: 'dark', statusBarTranslucent: false }}
    >
      <Stack.Screen name="Welcome" component={HomeScreen} />
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
      <Stack.Screen name="VerifyEmail" component={VerifyEmailScreen} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
      <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />
      <Stack.Screen name="About" component={AboutScreen} />
      <Stack.Screen name="Description" component={DescriptionScreen} />
      <Stack.Screen name="Predictions" component={PredictionsScreen} />
      <Stack.Screen name="Alerts" component={AlertsScreen} />
      <Stack.Screen name="CreateAlert" component={CreateAlertScreen} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
      <Stack.Screen name="IncidentDetail" component={IncidentDetailScreen} />
      <Stack.Screen name="ReportIncident" component={ReportCreateScreen} />
      <Stack.Screen name="MyReports" component={MyReportsScreen} options={{ statusBarColor: '#7A3DF0', statusBarStyle: 'light' }} />
      <Stack.Screen name="Contact" component={ContactScreen} />
      <Stack.Screen name="Services" component={ServicesScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
    </Stack.Navigator>
  );
}

function UserTabs() {
  return (
    <Tab.Navigator
      initialRouteName="Dashboard"
      screenOptions={({ route }) => buildTabScreenOptions(route)}
    >
      <Tab.Screen name="Dashboard" component={UserDashboardScreen} options={{ statusBarColor: Colors.bg, statusBarStyle: 'dark', statusBarTranslucent: false }} />
      <Tab.Screen name="Map" component={MapScreen} options={{ statusBarColor: Colors.bg, statusBarStyle: 'dark', statusBarTranslucent: false }} />
      <Tab.Screen name="News" component={NewsScreen} options={{ statusBarColor: Colors.gradientFrom, statusBarStyle: 'light', statusBarTranslucent: false }} />
      <Tab.Screen name="Reports" component={MyReportsScreen} options={{ statusBarColor: '#7A3DF0', statusBarStyle: 'light', statusBarTranslucent: false }} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ statusBarColor: '#7C3AED', statusBarStyle: 'light', statusBarTranslucent: false }} />
    </Tab.Navigator>
  );
}

function UserStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.bg }, statusBarColor: Colors.bg, statusBarStyle: 'dark', statusBarTranslucent: false }}>
      <Stack.Screen name="UserTabs" component={UserTabs} options={{ animationEnabled: false }} />
      <Stack.Screen name="About" component={AboutScreen} />
      <Stack.Screen name="Description" component={DescriptionScreen} />
      <Stack.Screen name="Predictions" component={PredictionsScreen} />
      <Stack.Screen name="Alerts" component={AlertsScreen} />
      <Stack.Screen name="CreateAlert" component={CreateAlertScreen} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
      <Stack.Screen name="IncidentDetail" component={IncidentDetailScreen} />
      <Stack.Screen name="ReportIncident" component={ReportCreateScreen} />
      <Stack.Screen name="MyReports" component={MyReportsScreen} options={{ statusBarColor: '#7A3DF0', statusBarStyle: 'light' }} />
      <Stack.Screen name="Contact" component={ContactScreen} />
      <Stack.Screen name="Services" component={ServicesScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
      <Stack.Screen
        name="FullNavigation"
        component={FullNavigationScreen}
        options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }}
      />
    </Stack.Navigator>
  );
}

function PoliceTabs() {
  return (
    <Tab.Navigator screenOptions={({ route }) => buildTabScreenOptions(route)}>
      <Tab.Screen name="PoliceDashboard" component={PoliceDashboardScreen} options={{ title: 'Dashboard' }} />
      <Tab.Screen name="PoliceActiveIncidents" component={PoliceIncidentsScreen} options={{ title: 'Incidents' }} />
      <Tab.Screen name="PoliceNearbyIncidents" component={PoliceNearbyIncidentsScreen} options={{ title: 'Nearby' }} />
      <Tab.Screen name="PoliceAlerts" component={PoliceAlertsScreen} options={{ title: 'Alerts' }} />
      <Tab.Screen name="PoliceMore" component={PoliceMoreScreen} options={{ title: 'More' }} />
    </Tab.Navigator>
  );
}

function PoliceStackNavigator({ requiresZoneSelection }) {
  return (
    <PoliceStack.Navigator
      initialRouteName={requiresZoneSelection ? 'PoliceZoneSetup' : 'PoliceTabs'}
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.bg }, statusBarColor: Colors.bg, statusBarStyle: 'dark', statusBarTranslucent: false }}
    >
      <PoliceStack.Screen name="PoliceZoneSetup" component={PoliceWorkZoneScreen} />
      <PoliceStack.Screen name="PoliceTabs" component={PoliceTabs} options={{ animationEnabled: false }} />
      <PoliceStack.Screen name="PoliceMyIncidents" component={PoliceMyIncidentsScreen} />
      <PoliceStack.Screen name="PoliceFieldReports" component={PoliceFieldReportsScreen} />
      <PoliceStack.Screen name="PoliceOperationHistory" component={PoliceOperationHistoryScreen} />
      <PoliceStack.Screen name="PoliceIncidentDetail" component={PoliceIncidentDetailScreen} />
    </PoliceStack.Navigator>
  );
}

function AdminStackScreens() {
  return (
    <AdminStack.Navigator screenOptions={{ headerShown: false }}>
      <AdminStack.Screen name="AdminOverview" component={AdminOverviewScreen} />
      <AdminStack.Screen name="AdminIncidents" component={AdminIncidentsScreen} />
      <AdminStack.Screen name="AdminIncidentReview" component={AdminIncidentReviewScreen} />
      <AdminStack.Screen name="AdminAlerts" component={AdminAlertsScreen} />
      <AdminStack.Screen name="AdminAI" component={AdminAIMonitoringScreen} />
      <AdminStack.Screen name="AdminUsers" component={AdminUsersScreen} />
      <AdminStack.Screen name="AdminZones" component={AdminZonesScreen} />
      <AdminStack.Screen name="AdminSystem" component={AdminSystemSettingsScreen} />
      <AdminStack.Screen name="AdminAnalytics" component={AdminAnalyticsScreen} />
      <AdminStack.Screen name="AdminServiceControl" component={AdminServiceControlScreen} />
      <AdminStack.Screen name="AdminDashboard" component={DashboardScreen} />
    </AdminStack.Navigator>
  );
}

const SupervisorStack = createNativeStackNavigator();
function SupervisorStackNavigator() {
  return (
    <SupervisorStack.Navigator
      initialRouteName="SupervisorDashboard"
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#1C1200' }, statusBarColor: '#1C1200', statusBarStyle: 'light', statusBarTranslucent: false }}
    >
      <SupervisorStack.Screen name="SupervisorDashboard" component={SupervisorDashboardScreen} />
      <SupervisorStack.Screen name="SupervisorOfficers"  component={SupervisorOfficersScreen}  />
      <SupervisorStack.Screen name="SupervisorIncidents" component={SupervisorIncidentsScreen} />
      <SupervisorStack.Screen name="SupervisorAlerts"   component={SupervisorAlertsScreen}   />
      <SupervisorStack.Screen name="SupervisorAnalytics" component={SupervisorAnalyticsScreen} />
      <SupervisorStack.Screen name="SupervisorMap"       component={SupervisorMapScreen}       />
    </SupervisorStack.Navigator>
  );
}

function AdminDrawer() {
  return (
    <AdminDrawerShell>
      <AdminStackScreens />
    </AdminDrawerShell>
  );
}

export default function AppNavigator() {
  const hasCheckedSession = useAuthStore((state) => state.hasCheckedSession);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isAdmin = useAuthStore((state) => state.isAdmin);
  const isPolice = useAuthStore((state) => state.isPolice);
  const isSupervisor = useAuthStore((state) => state.isSupervisor);
  const activeMode = useAuthStore((state) => state.activeMode);
  const shouldBootstrapPolice = isAuthenticated && isPolice && activeMode === 'police';
  const isSupervisorMode = isAuthenticated && isSupervisor && activeMode === 'supervisor';
  const policeMeQuery = usePoliceMe({
    enabled: shouldBootstrapPolice,
    staleTime: 15 * 1000,
  });
  const policeBootstrap = {
    loading: shouldBootstrapPolice && policeMeQuery.isLoading,
    requiresZoneSelection: Boolean(policeMeQuery.data?.requiresZoneSelection),
  };

  // --- Mode transition overlay state ---
  const [renderedMode, setRenderedMode] = React.useState(activeMode);
  const [transitionDir, setTransitionDir] = React.useState(null);
  const [holdComplete, setHoldComplete] = React.useState(false);
  const overlayOpacity = React.useRef(new Animated.Value(0)).current;
  const iconScale   = React.useRef(new Animated.Value(0.4)).current;
  const contentOpacity = React.useRef(new Animated.Value(0)).current;
  const contentSlide   = React.useRef(new Animated.Value(24)).current;
  const startFadeOutRef  = React.useRef(null);
  const transitionActive = React.useRef(false);
  // -------------------------------------

  const navigatorKey = !isAuthenticated
    ? 'public'
    : isAdmin
      ? 'admin'
      : isSupervisorMode
        ? `supervisor-${renderedMode}`
        : isPolice
          ? `police-access-${renderedMode}`
          : 'user';

  // Fire whenever activeMode changes — animate overlay in, swap navigator, then fade out
  React.useEffect(() => {
    if (!isAuthenticated || (!isPolice && !isSupervisor)) return;
    if (activeMode === renderedMode) return;
    if (transitionActive.current) return;
    transitionActive.current = true;

    const dir = activeMode === 'supervisor' ? 'to-supervisor' : activeMode === 'police' ? 'to-police' : 'to-user';
    overlayOpacity.setValue(0);
    iconScale.setValue(0.4);
    contentOpacity.setValue(0);
    contentSlide.setValue(24);
    setHoldComplete(false);
    setTransitionDir(dir);

    Animated.timing(overlayOpacity, { toValue: 1, duration: 300, useNativeDriver: true }).start(() => {
      setRenderedMode(activeMode);
      Animated.parallel([
        Animated.spring(iconScale,   { toValue: 1, friction: 5, tension: 100, useNativeDriver: true }),
        Animated.timing(contentOpacity, { toValue: 1, duration: 320, useNativeDriver: true }),
        Animated.timing(contentSlide,   { toValue: 0, duration: 320, useNativeDriver: true }),
      ]).start();
      setTimeout(() => setHoldComplete(true), 750);
    });

    startFadeOutRef.current = () => {
      startFadeOutRef.current = null;
      Animated.timing(overlayOpacity, { toValue: 0, duration: 420, useNativeDriver: true }).start(() => {
        setTransitionDir(null);
        setHoldComplete(false);
        transitionActive.current = false;
      });
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMode]);

  // Start fade-out once hold timer fires AND police bootstrap is done
  React.useEffect(() => {
    if (holdComplete && !policeBootstrap.loading && startFadeOutRef.current) {
      startFadeOutRef.current();
    }
  }, [holdComplete, policeBootstrap.loading]);

  const isBootstrapLoading = !hasCheckedSession || (shouldBootstrapPolice && policeBootstrap.loading);

  return (
    <View style={{ flex: 1 }}>
      <NavigationContainer ref={navigationRef} onReady={flushPendingNotificationNavigation}>
        {isBootstrapLoading ? (
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="Splash" component={SplashScreen} />
          </Stack.Navigator>
        ) : (
          <Stack.Navigator
            key={navigatorKey}
            screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.bg } }}
          >
            {!isAuthenticated ? (
              <Stack.Group screenOptions={{ animationEnabled: false }}>
                <Stack.Screen name="PublicStack" component={PublicStack} options={{ animationEnabled: false }} />
              </Stack.Group>
            ) : isAdmin ? (
              <Stack.Group screenOptions={{ animationEnabled: false }}>
                <Stack.Screen name="AdminPanel" component={AdminDrawer} options={{ animationEnabled: false }} />
                <Stack.Screen name="About" component={AboutScreen} />
                <Stack.Screen name="Description" component={DescriptionScreen} />
                <Stack.Screen name="Predictions" component={PredictionsScreen} />
                <Stack.Screen name="Alerts" component={AlertsScreen} />
                <Stack.Screen name="CreateAlert" component={CreateAlertScreen} />
                <Stack.Screen name="Notifications" component={NotificationsScreen} />
                <Stack.Screen name="IncidentDetail" component={IncidentDetailScreen} />
                <Stack.Screen name="ReportIncident" component={ReportCreateScreen} />
                <Stack.Screen name="MyReports" component={MyReportsScreen} options={{ statusBarColor: '#7A3DF0', statusBarStyle: 'light' }} />
                <Stack.Screen name="Contact" component={ContactScreen} />
                <Stack.Screen name="Services" component={ServicesScreen} />
                <Stack.Screen name="Settings" component={SettingsScreen} />
              </Stack.Group>
            ) : isSupervisor && renderedMode === 'supervisor' ? (
              <Stack.Group screenOptions={{ animationEnabled: false }}>
                <Stack.Screen name="SupervisorStack" component={SupervisorStackNavigator} />
              </Stack.Group>
            ) : isPolice && renderedMode === 'police' ? (
              <Stack.Group screenOptions={{ animationEnabled: false }}>
                <Stack.Screen name="PoliceStack">
                  {() => <PoliceStackNavigator requiresZoneSelection={policeBootstrap.requiresZoneSelection} />}
                </Stack.Screen>
              </Stack.Group>
            ) : (
              <Stack.Group screenOptions={{ animationEnabled: false }}>
                <Stack.Screen name="UserStack" component={UserStack} options={{ animationEnabled: false }} />
              </Stack.Group>
            )}
          </Stack.Navigator>
        )}
      </NavigationContainer>

      {/* Mode transition overlay — covers the old screen while navigator remounts */}
      {transitionDir !== null && (
        <Animated.View style={[transStyles.overlay, { opacity: overlayOpacity }]} pointerEvents="none">
          <LinearGradient
            colors={
              transitionDir === 'to-supervisor'
                ? ['#1C1200', '#3B2600', '#5C3D00']
                : transitionDir === 'to-police'
                  ? ['#0D1B2A', '#1A3251', '#1E4976']
                  : ['#4C1D95', '#7A3DF0', '#9333EA']
            }
            style={transStyles.gradient}
            start={{ x: 0.3, y: 0 }} end={{ x: 0.7, y: 1 }}
          >
            <View style={transStyles.decCircle1} />
            <View style={transStyles.decCircle2} />

            <Animated.View style={[transStyles.iconRing, { transform: [{ scale: iconScale }] }]}>
              <View style={transStyles.iconInner}>
                <Ionicons
                  name={
                    transitionDir === 'to-supervisor'
                      ? 'eye'
                      : transitionDir === 'to-police'
                        ? 'shield-checkmark'
                        : 'person-circle'
                  }
                  size={52}
                  color="white"
                />
              </View>
            </Animated.View>

            <Animated.View style={[
              transStyles.textWrap,
              { opacity: contentOpacity, transform: [{ translateY: contentSlide }] },
            ]}>
              <Text style={transStyles.title}>
                {transitionDir === 'to-supervisor'
                  ? 'Supervisor Mode'
                  : transitionDir === 'to-police'
                    ? 'Police Mode'
                    : 'Citizen Mode'}
              </Text>
              <Text style={transStyles.subtitle}>
                {transitionDir === 'to-supervisor'
                  ? 'Activating command center'
                  : transitionDir === 'to-police'
                    ? 'Activating officer dashboard'
                    : 'Returning to SIARA experience'}
              </Text>
            </Animated.View>
          </LinearGradient>
        </Animated.View>
      )}
    </View>
  );
}

const transStyles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
  },
  gradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  decCircle1: {
    position: 'absolute',
    width: 340, height: 340, borderRadius: 170,
    top: -90, right: -90,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    backgroundColor: 'transparent',
  },
  decCircle2: {
    position: 'absolute',
    width: 260, height: 260, borderRadius: 130,
    bottom: -50, left: -70,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    backgroundColor: 'transparent',
  },
  iconRing: {
    width: 112, height: 112, borderRadius: 56,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 30,
  },
  iconInner: {
    width: 90, height: 90, borderRadius: 45,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textWrap: {
    alignItems: 'center',
    gap: 8,
  },
  title: {
    color: 'white',
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.68)',
    fontSize: 14,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
});
