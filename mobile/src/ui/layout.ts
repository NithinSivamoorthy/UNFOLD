import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * One source of truth for adaptive layout. Values recompute on every rotation / split-view resize.
 *
 * Insets: each native tab screen is wrapped in its own SafeAreaProvider (expo-router NativeTabs, iOS),
 * so inside a tab `insets` already include the tab bar — bottom bar on iPhone, floating top bar on
 * iPadOS. Tabs set `disableAutomaticContentInsets`, so screens apply these insets exactly once.
 */
export function useLayout() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const landscape = width > height;
  const tablet = Math.min(width, height) >= 600;
  const gutter = width >= 1000 ? 48 : width >= 600 ? 32 : 20;
  // Side-by-side panels when there is genuinely room for two columns.
  const twoColumn = width >= 1000 || (landscape && width >= 700);
  const contentHeight = height - insets.top - insets.bottom;
  return {
    width,
    height,
    insets,
    landscape,
    tablet,
    twoColumn,
    gutter,
    contentHeight,
    /** Horizontal padding including notch/home-indicator side insets in landscape. */
    padLeft: gutter + insets.left,
    padRight: gutter + insets.right,
  };
}

export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
