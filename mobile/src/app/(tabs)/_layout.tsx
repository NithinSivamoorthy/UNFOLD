import { NativeTabs } from 'expo-router/native-tabs';

import { C } from '@/ui/theme';

export default function TabsLayout() {
  return (
    <NativeTabs tintColor={C.accent} iconColor={C.textSecondary} labelStyle={{ color: C.textSecondary, selected: { color: C.accent } }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Capture</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'camera.viewfinder', selected: 'camera.viewfinder' }} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="library">
        <NativeTabs.Trigger.Label>My Models</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'cube', selected: 'cube.fill' }} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="lab">
        <NativeTabs.Trigger.Label>Lab</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'flask', selected: 'flask.fill' }} />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
