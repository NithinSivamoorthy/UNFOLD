import { NativeTabs } from 'expo-router/native-tabs';

import { C } from '@/ui/theme';

// Screens apply safe-area insets themselves via useLayout(); automatic scroll-view inset adjustment
// is disabled so insets are never applied twice (that double offset caused the rotation glitches).
export default function TabsLayout() {
  return (
    <NativeTabs tintColor={C.accent} iconColor={C.textSecondary} labelStyle={{ color: C.textSecondary, selected: { color: C.accent } }}>
      <NativeTabs.Trigger name="index" disableAutomaticContentInsets>
        <NativeTabs.Trigger.Label>Capture</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'camera.viewfinder', selected: 'camera.viewfinder' }} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="library" disableAutomaticContentInsets>
        <NativeTabs.Trigger.Label>My Models</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'cube', selected: 'cube.fill' }} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="lab" disableAutomaticContentInsets>
        <NativeTabs.Trigger.Label>Lab</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'flask', selected: 'flask.fill' }} />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
