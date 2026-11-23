import React from 'react';
import { Platform } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { COPY } from '../copy';
import { fonts } from '../theme';
import { useTheme } from '../state/ThemeProvider';
import { TabIcon } from '../ui/Mark';
import { BrainstormScreen } from '../screens/BrainstormScreen';
import { ConstructionScreen } from '../screens/ConstructionScreen';
import { ReviewScreen } from '../screens/ReviewScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { useCrew } from '../state/CrewProvider';
import { useResponsiveLayout } from '../ui/primitives';

const Tab = createBottomTabNavigator();

export function RootTabs() {
  const { state } = useCrew();
  const { colors } = useTheme();
  const { contentMaxWidth } = useResponsiveLayout();
  const awaiting = state.projects.filter(
    (item) => item.status === 'AWAITING_USER' && item.pending,
  ).length;

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'fade',
        tabBarActiveTintColor: colors.accentText,
        tabBarInactiveTintColor: colors.faint,
        tabBarStyle: {
          width: '100%',
          maxWidth: contentMaxWidth,
          alignSelf: 'center',
          backgroundColor: colors.surfaceRaised,
          borderTopColor: colors.line,
          borderTopWidth: 0.5,
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          height: Platform.OS === 'ios' ? 88 : 76,
          paddingTop: 8,
          paddingBottom: Platform.OS === 'ios' ? 24 : 12,
          ...(Platform.OS === 'web'
            ? { boxShadow: `0 -14px 44px ${colors.shadowColor}66, inset 0 1px 0 ${colors.sheen}` }
            : {
                shadowColor: colors.shadowColor,
                shadowOffset: { width: 0, height: -8 },
                shadowOpacity: 0.3,
                shadowRadius: 22,
                elevation: 14,
              }),
        },
        tabBarLabelStyle: {
          fontFamily: fonts.ui,
          fontSize: 11,
          fontWeight: '500',
          letterSpacing: 0,
        },
        tabBarItemStyle: { borderRadius: 12 },
      }}
    >
      <Tab.Screen
        name={COPY.tabs.brainstorm}
        component={BrainstormScreen}
        options={{ tabBarIcon: ({ color }) => <TabIcon name="brainstorm" color={color} /> }}
      />
      <Tab.Screen
        name={COPY.tabs.construction}
        component={ConstructionScreen}
        options={{ tabBarIcon: ({ color }) => <TabIcon name="construction" color={color} /> }}
      />
      <Tab.Screen
        name={COPY.tabs.review}
        component={ReviewScreen}
        options={{
          tabBarIcon: ({ color }) => <TabIcon name="review" color={color} />,
          tabBarBadge: awaiting > 0 ? awaiting : undefined,
          tabBarBadgeStyle: {
            backgroundColor: colors.yellow,
            color: colors.onYellow,
            fontSize: 10,
            fontWeight: '600',
          },
        }}
      />
      <Tab.Screen
        name={COPY.tabs.profile}
        component={ProfileScreen}
        options={{ tabBarIcon: ({ color }) => <TabIcon name="profile" color={color} /> }}
      />
    </Tab.Navigator>
  );
}
