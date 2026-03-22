import React, { useContext } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { Ionicons } from '@expo/vector-icons';
import { AuthContext } from '../contexts/AuthContext';
import { Colors } from '../theme/colors';

// Shared screens
import LoginScreen from '../screens/shared/LoginScreen';
import RegisterScreen from '../screens/shared/RegisterScreen';
import VerifyEmailScreen from '../screens/shared/VerifyEmailScreen';
import AboutScreen from '../screens/shared/AboutScreen';
import DescriptionScreen from '../screens/shared/DescriptionScreen';

// User screens
import HomeScreen from '../screens/user/HomeScreen';
import MapScreen from '../screens/user/MapScreen';
import NewsScreen from '../screens/user/NewsScreen';
import PredictionsScreen from '../screens/user/PredictionsScreen';
import AlertsScreen from '../screens/user/AlertsScreen';
import CreateAlertScreen from '../screens/user/CreateAlertScreen';
import ReportIncidentScreen from '../screens/user/ReportIncidentScreen';
import IncidentDetailScreen from '../screens/user/IncidentDetailScreen';
import NotificationsScreen from '../screens/user/NotificationsScreen';
import UserDashboardScreen from '../screens/user/UserDashboardScreen';
import ProfileScreen from '../screens/user/ProfileScreen';
import SettingsScreen from '../screens/user/SettingsScreen';
import ServicesScreen from '../screens/user/ServicesScreen';
import ContactScreen from '../screens/user/ContactScreen';

// Admin screens
import AdminOverviewScreen from '../screens/admin/AdminOverviewScreen';
import AdminIncidentsScreen from '../screens/admin/AdminIncidentsScreen';
import AdminIncidentReviewScreen from '../screens/admin/AdminIncidentReviewScreen';
import AdminAlertsScreen from '../screens/admin/AdminAlertsScreen';
import AdminAIMonitoringScreen from '../screens/admin/AdminAIMonitoringScreen';
import AdminUsersScreen from '../screens/admin/AdminUsersScreen';
import AdminZonesScreen from '../screens/admin/AdminZonesScreen';
import AdminSystemSettingsScreen from '../screens/admin/AdminSystemSettingsScreen';
import AdminAnalyticsScreen from '../screens/admin/AdminAnalyticsScreen';
import DashboardScreen from '../screens/admin/DashboardScreen';

// Admin drawer content
import AdminDrawerContent from '../components/layout/AdminDrawerContent';
import { getPostAuthRoute } from '../utils/auth';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
const Drawer = createDrawerNavigator();
const AdminStack = createNativeStackNavigator();

// ─── User bottom tab navigator ───────────────────────────
function UserTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
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
        tabBarIcon: ({ color, size }) => {
          const icons = {
            Home: 'home',
            Map: 'map',
            News: 'newspaper',
            Dashboard: 'grid',
            Profile: 'person',
          };
          return <Ionicons name={icons[route.name] || 'ellipse'} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Map" component={MapScreen} />
      <Tab.Screen name="News" component={NewsScreen} />
      <Tab.Screen name="Dashboard" component={UserDashboardScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

// ─── Admin stack inside drawer ───────────────────────────
function AdminStackScreens() {
  return (
    <AdminStack.Navigator
      screenOptions={{
        headerShown: false,
      }}
    >
      <AdminStack.Screen name="AdminOverview" component={AdminOverviewScreen} />
      <AdminStack.Screen name="AdminIncidents" component={AdminIncidentsScreen} />
      <AdminStack.Screen name="AdminIncidentReview" component={AdminIncidentReviewScreen} />
      <AdminStack.Screen name="AdminAlerts" component={AdminAlertsScreen} />
      <AdminStack.Screen name="AdminAI" component={AdminAIMonitoringScreen} />
      <AdminStack.Screen name="AdminUsers" component={AdminUsersScreen} />
      <AdminStack.Screen name="AdminZones" component={AdminZonesScreen} />
      <AdminStack.Screen name="AdminSystem" component={AdminSystemSettingsScreen} />
      <AdminStack.Screen name="AdminAnalytics" component={AdminAnalyticsScreen} />
      <AdminStack.Screen name="AdminDashboard" component={DashboardScreen} />
    </AdminStack.Navigator>
  );
}

// ─── Admin drawer navigator ──────────────────────────────
function AdminDrawer() {
  return (
    <Drawer.Navigator
      drawerContent={(props) => <AdminDrawerContent {...props} />}
      screenOptions={{
        headerShown: false,
        drawerStyle: {
          backgroundColor: Colors.adminBg,
          width: 280,
        },
      }}
    >
      <Drawer.Screen name="AdminMain" component={AdminStackScreens} />
    </Drawer.Navigator>
  );
}

// ─── Root navigator ──────────────────────────────────────
export default function AppNavigator() {
  const { user, loading } = useContext(AuthContext);

  if (loading) return null;

  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName={user ? getPostAuthRoute(user) : 'Login'}
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: Colors.bg },
        }}
      >
        {/* Auth screens (shown when not logged in, but also reachable) */}
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="Register" component={RegisterScreen} />
        <Stack.Screen name="VerifyEmail" component={VerifyEmailScreen} />

        {/* Public user screens */}
        <Stack.Screen name="UserTabs" component={UserTabs} />
        <Stack.Screen name="About" component={AboutScreen} />
        <Stack.Screen name="Description" component={DescriptionScreen} />
        <Stack.Screen name="Predictions" component={PredictionsScreen} />
        <Stack.Screen name="Alerts" component={AlertsScreen} />
        <Stack.Screen name="CreateAlert" component={CreateAlertScreen} />
        <Stack.Screen name="Notifications" component={NotificationsScreen} />
        <Stack.Screen name="IncidentDetail" component={IncidentDetailScreen} />
        <Stack.Screen name="ReportIncident" component={ReportIncidentScreen} />
        <Stack.Screen name="Contact" component={ContactScreen} />
        <Stack.Screen name="Services" component={ServicesScreen} />
        <Stack.Screen name="Settings" component={SettingsScreen} />

        {/* Admin panel (drawer-based) */}
        <Stack.Screen name="AdminPanel" component={AdminDrawer} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
