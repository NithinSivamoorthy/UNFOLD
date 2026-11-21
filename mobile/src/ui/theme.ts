import { Platform } from 'react-native';

export const C = {
  bg: '#07090B',
  surface: '#0F1317',
  elevated: '#161B21',
  hairline: 'rgba(255,255,255,0.08)',
  hairlineStrong: 'rgba(255,255,255,0.14)',
  text: '#F2F5F7',
  textSecondary: '#97A1AD',
  textTertiary: '#5F6975',
  accent: '#5EEAD4',
  accentDeep: '#14B8A6',
  accentGlow: 'rgba(94,234,212,0.16)',
  danger: '#FF6B6B',
  dangerBg: 'rgba(255,107,107,0.10)',
  warning: '#F5C26B',
} as const;

export const F = {
  sans: Platform.select({ ios: 'System', default: undefined }),
  rounded: Platform.select({ ios: 'ui-rounded', default: undefined }),
  mono: Platform.select({ ios: 'Menlo', default: 'monospace' }),
};

export const R = { sm: 10, md: 16, lg: 24, xl: 32, pill: 999 } as const;
export const S = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 } as const;
