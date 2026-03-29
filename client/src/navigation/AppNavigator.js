import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../stores/authStore';
import { Colors } from '../theme/colors';

// Shared screens
import SplashScreen from '../screens/shared/SplashScreen';
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
import ReportCreateScreen from '../screens/user/ReportCreateScreen';
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
import { flushPendingNotificationNavigation, navigationRef } from './navigationService';

// Admin shell
import AdminDrawerShell from '../components/layout/AdminDrawerShell';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
const AdminStack = createNativeStackNavigator();

// ─── Public Stack (Login, Register, Verify Email) ─────────
function PublicStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Colors.bg },
      }}
    >
      <Stack.Screen 
        name="Login" 
        component={LoginScreen}
        options={{ animationEnabled: true }}
      />
      <Stack.Screen 
        name="Register" 
        component={RegisterScreen}
        options={{ animationEnabled: true }}
      />
      <Stack.Screen 
        name="VerifyEmail" 
        component={VerifyEmailScreen}
        options={{ animationEnabled: true }}
      />
      {/* Public screens accessible to all */}
      <Stack.Screen 
        name="About" 
        component={AboutScreen}
        options={{ animationEnabled: true }}
      />
      <Stack.Screen 
        name="Description" 
        component={DescriptionScreen}
        options={{ animationEnabled: true }}
      />
      <Stack.Screen 
        name="Predictions" 
        component={PredictionsScreen}
        options={{ animationEnabled: true }}
      />
      <Stack.Screen 
        name="Alerts" 
        component={AlertsScreen}
        options={{ animationEnabled: true }}
      />
      <Stack.Screen 
        name="CreateAlert" 
        component={CreateAlertScreen}
        options={{ animationEnabled: true }}
      />
      <Stack.Screen 
        name="Notifications" 
        component={NotificationsScreen}
        options={{ animationEnabled: true }}
      />
      <Stack.Screen 
        name="IncidentDetail" 
        component={IncidentDetailScreen}
        options={{ animationEnabled: true }}
      />
      <Stack.Screen 
        name="ReportIncident" 
        component={ReportCreateScreen}
        options={{ animationEnabled: true }}
      />
      <Stack.Screen 
        name="Contact" 
        component={ContactScreen}
        options={{ animationEnabled: true }}
      />
      <Stack.Screen 
        name="Services" 
        component={ServicesScreen}
        options={{ animationEnabled: true }}
      />
      <Stack.Screen 
        name="Settings" 
        component={SettingsScreen}
        options={{ animationEnabled: true }}
      />
    </Stack.Navigator>
  );
}

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

// ─── User Stack (with public screens) ─────────────────────
function UserStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Colors.bg },
      }}
    >
      {/* User main tabs */}
      <Stack.Screen 
        name="UserTabs" 
        component={UserTabs}
        options={{ animationEnabled: false }}
      />
      
      {/* Public screens accessible from user area */}
      <Stack.Screen 
        name="About" 
        component={AboutScreen}
        options={{ animationEnabled: true }}
      />
      <Stack.Screen 
        name="Description" 
        component={DescriptionScreen}
        options={{ animationEnabled: true }}
      />
      <Stack.Screen 
        name="Predictions" 
        component={PredictionsScreen}
        options={{ animationEnabled: true }}
      />
      <Stack.Screen 
        name="Alerts" 
        component={AlertsScreen}
        options={{ animationEnabled: true }}
      />
      <Stack.Screen 
        name="CreateAlert" 
        component={CreateAlertScreen}
        options={{ animationEnabled: true }}
      />
      <Stack.Screen 
        name="Notifications" 
        component={NotificationsScreen}
        options={{ animationEnabled: true }}
      />
      <Stack.Screen 
        name="IncidentDetail" 
        component={IncidentDetailScreen}
        options={{ animationEnabled: true }}
      />
      <Stack.Screen 
        name="ReportIncident" 
        component={ReportCreateScreen}
        options={{ animationEnabled: true }}
      />
      <Stack.Screen 
        name="Contact" 
        component={ContactScreen}
        options={{ animationEnabled: true }}
      />
      <Stack.Screen 
        name="Services" 
        component={ServicesScreen}
        options={{ animationEnabled: true }}
      />
      <Stack.Screen 
        name="Settings" 
        component={SettingsScreen}
        options={{ animationEnabled: true }}
      />
    </Stack.Navigator>
  );
}

// ─── Admin stack inside shell ────────────────────────────
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

// ─── Admin shell navigator ───────────────────────────────
function AdminDrawer() {
  return (
    <AdminDrawerShell>
      <AdminStackScreens />
    </AdminDrawerShell>
  );
}

// ─── Root Navigator ──────────────────────────────────────
export default function AppNavigator() {
  const isHydrated = useAuthStore((state) => state.hasCheckedSession);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isAdmin = useAuthStore((state) => state.isAdmin);

  // Show splash screen while session is being restored
  if (!isHydrated) {
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
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: Colors.bg },
        }}
      >
        {/* Unauthenticated: show login/register/public screens */}
        {!isAuthenticated ? (
          <Stack.Group screenOptions={{ animationEnabled: false }}>
            <Stack.Screen 
              name="PublicStack" 
              component={PublicStack}
              options={{ animationEnabled: false }}
            />
          </Stack.Group>
        ) : isAdmin ? (
          /* Authenticated Admin: show admin panel with all public screens accessible */
          <Stack.Group screenOptions={{ animationEnabled: false }}>
            <Stack.Screen
              name="AdminPanel"
              component={AdminDrawer}
              options={{ animationEnabled: false }}
            />
            {/* Public screens accessible from admin area */}
            <Stack.Screen 
              name="About" 
              component={AboutScreen}
              options={{ animationEnabled: true }}
            />
            <Stack.Screen 
              name="Description" 
              component={DescriptionScreen}
              options={{ animationEnabled: true }}
            />
            <Stack.Screen 
              name="Predictions" 
              component={PredictionsScreen}
              options={{ animationEnabled: true }}
            />
            <Stack.Screen 
              name="Alerts" 
              component={AlertsScreen}
              options={{ animationEnabled: true }}
            />
            <Stack.Screen 
              name="CreateAlert" 
              component={CreateAlertScreen}
              options={{ animationEnabled: true }}
            />
            <Stack.Screen 
              name="Notifications" 
              component={NotificationsScreen}
              options={{ animationEnabled: true }}
            />
            <Stack.Screen 
              name="IncidentDetail" 
              component={IncidentDetailScreen}
              options={{ animationEnabled: true }}
            />
            <Stack.Screen 
              name="ReportIncident" 
              component={ReportCreateScreen}
              options={{ animationEnabled: true }}
            />
            <Stack.Screen 
              name="Contact" 
              component={ContactScreen}
              options={{ animationEnabled: true }}
            />
            <Stack.Screen 
              name="Services" 
              component={ServicesScreen}
              options={{ animationEnabled: true }}
            />
            <Stack.Screen 
              name="Settings" 
              component={SettingsScreen}
              options={{ animationEnabled: true }}
            />
          </Stack.Group>
        ) : (
          /* Authenticated Non-Admin: show user stack */
          <Stack.Group screenOptions={{ animationEnabled: false }}>
            <Stack.Screen
              name="UserStack"
              component={UserStack}
              options={{ animationEnabled: false }}
            />
          </Stack.Group>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
