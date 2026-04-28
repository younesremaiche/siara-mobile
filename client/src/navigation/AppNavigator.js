import React from 'react';
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

import { flushPendingNotificationNavigation, navigationRef } from './navigationService';
import AdminDrawerShell from '../components/layout/AdminDrawerShell';
import { getPoliceMe } from '../services/policeService';

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
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.bg } }}
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
      <Stack.Screen name="MyReports" component={MyReportsScreen} />
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
      <Tab.Screen name="Dashboard" component={UserDashboardScreen} />
      <Tab.Screen name="Map" component={MapScreen} />
      <Tab.Screen name="News" component={NewsScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

function UserStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.bg } }}>
      <Stack.Screen name="UserTabs" component={UserTabs} options={{ animationEnabled: false }} />
      <Stack.Screen name="About" component={AboutScreen} />
      <Stack.Screen name="Description" component={DescriptionScreen} />
      <Stack.Screen name="Predictions" component={PredictionsScreen} />
      <Stack.Screen name="Alerts" component={AlertsScreen} />
      <Stack.Screen name="CreateAlert" component={CreateAlertScreen} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
      <Stack.Screen name="IncidentDetail" component={IncidentDetailScreen} />
      <Stack.Screen name="ReportIncident" component={ReportCreateScreen} />
      <Stack.Screen name="MyReports" component={MyReportsScreen} />
      <Stack.Screen name="Contact" component={ContactScreen} />
      <Stack.Screen name="Services" component={ServicesScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
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
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.bg } }}
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
  const activeMode = useAuthStore((state) => state.activeMode);
  const userId = useAuthStore((state) => state.user?.id);
  const [policeBootstrap, setPoliceBootstrap] = React.useState({
    loading: false,
    requiresZoneSelection: false,
  });
  const shouldBootstrapPolice = isAuthenticated && isPolice && activeMode === 'police';
  const navigatorKey = !isAuthenticated
    ? 'public'
    : isAdmin
      ? 'admin'
      : isPolice
        ? `police-access-${activeMode}`
        : 'user';

  React.useEffect(() => {
    let isCancelled = false;

    async function loadPoliceBootstrap() {
      if (!shouldBootstrapPolice) {
        setPoliceBootstrap({
          loading: false,
          requiresZoneSelection: false,
        });
        return;
      }

      setPoliceBootstrap((previous) => ({
        ...previous,
        loading: true,
      }));

      try {
        const payload = await getPoliceMe();
        if (!isCancelled) {
          setPoliceBootstrap({
            loading: false,
            requiresZoneSelection: Boolean(payload.requiresZoneSelection),
          });
        }
      } catch (_error) {
        if (!isCancelled) {
          setPoliceBootstrap({
            loading: false,
            requiresZoneSelection: false,
          });
        }
      }
    }

    void loadPoliceBootstrap();
    return () => {
      isCancelled = true;
    };
  }, [shouldBootstrapPolice, userId]);

  if (!hasCheckedSession || (shouldBootstrapPolice && policeBootstrap.loading)) {
    return (
      <NavigationContainer ref={navigationRef} onReady={flushPendingNotificationNavigation}>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Splash" component={SplashScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    );
  }

  return (
    <NavigationContainer ref={navigationRef} onReady={flushPendingNotificationNavigation}>
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
            <Stack.Screen name="MyReports" component={MyReportsScreen} />
            <Stack.Screen name="Contact" component={ContactScreen} />
            <Stack.Screen name="Services" component={ServicesScreen} />
            <Stack.Screen name="Settings" component={SettingsScreen} />
          </Stack.Group>
        ) : isPolice && activeMode === 'police' ? (
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
    </NavigationContainer>
  );
}
