import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import * as Haptics from 'expo-haptics';
import { type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { C, R } from './theme';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

type Props = {
  label: string;
  onPress?: () => void;
  icon?: SymbolViewProps['name'];
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  size?: 'md' | 'lg';
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
};

export function Button({ label, onPress, icon, variant = 'secondary', disabled, loading, size = 'md', style }: Props) {
  const scale = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  const v = VARIANTS[variant];
  const inactive = disabled || loading;
  return (
    <Animated.View style={[anim, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: !!inactive, busy: !!loading }}
        disabled={inactive}
        onPressIn={() => scale.set(withSpring(0.96, { damping: 18, stiffness: 400 }))}
        onPressOut={() => scale.set(withSpring(1, { damping: 14, stiffness: 300 }))}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          onPress?.();
        }}
        style={[
          styles.base,
          size === 'lg' ? styles.lg : styles.md,
          { backgroundColor: v.bg, borderColor: v.border },
          inactive && styles.disabled,
        ]}>
        {loading ? (
          <ActivityIndicator color={v.fg} />
        ) : (
          <View style={styles.row}>
            {icon ? <SymbolView name={icon} tintColor={v.fg} size={size === 'lg' ? 20 : 17} weight="semibold" /> : null}
            <Text style={[styles.label, size === 'lg' && styles.labelLg, { color: v.fg }]}>{label}</Text>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

const VARIANTS: Record<Variant, { bg: string; fg: string; border: string }> = {
  primary: { bg: C.accent, fg: '#04201C', border: C.accent },
  secondary: { bg: 'rgba(255,255,255,0.06)', fg: C.text, border: C.hairlineStrong },
  ghost: { bg: 'transparent', fg: C.textSecondary, border: 'transparent' },
  danger: { bg: C.dangerBg, fg: C.danger, border: 'rgba(255,107,107,0.3)' },
};

const styles = StyleSheet.create({
  base: { borderRadius: R.pill, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  md: { minHeight: 48, paddingHorizontal: 20 },
  lg: { minHeight: 60, paddingHorizontal: 28 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  label: { fontSize: 16, fontWeight: '600', letterSpacing: 0.1 },
  labelLg: { fontSize: 18 },
  disabled: { opacity: 0.4 },
});
