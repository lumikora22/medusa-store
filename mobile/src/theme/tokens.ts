export const palette = {
  navy: "#14263D",
  ivory: "#F4EBDD",
  gold: "#B89A5A",
  background: "#FAF7F0",
  surface: "#FFFDF8",
  dark: "#0D1B2A",
  navyMedium: "#36516F",
  textSecondary: "#687382",
  border: "#D9D0C2",
  success: "#52705B",
  error: "#A34E4E",
} as const;

export const colors = {
  ink: palette.navy,
  primary: palette.navy,
  primaryDark: palette.navyMedium,
  primarySoft: palette.gold,
  canvas: palette.background,
  surface: palette.surface,
  dark: palette.dark,
  tint: palette.ivory,
  tintStrong: palette.border,
  border: palette.border,
  textPrimary: palette.dark,
  textSecondary: palette.navyMedium,
  textMuted: palette.textSecondary,
  textFaint: palette.textSecondary,
  onPrimary: palette.ivory,
  price: palette.success,
  success: palette.success,
  danger: palette.error,
  dangerDark: palette.error,
  dangerSoft: "#F5E7E4",
  warning: palette.gold,
  overlay: "rgba(13, 27, 42, 0.72)",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 10,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
} as const;

export const typography = {
  h1: 24,
  h2: 20,
  title: 16,
  body: 15,
  small: 13,
  tiny: 11,
} as const;

/**
 * Shared style for raw React Native TextInputs (Scanner, CreateItem, etc.).
 * Tighter vertical rhythm than the previous padding:14 so fields don't feel
 * oversized on an iPhone-sized screen.
 */
export const inputStyle = {
  backgroundColor: colors.surface,
  borderRadius: radius.md,
  minHeight: 48,
  paddingVertical: 10,
  paddingHorizontal: 12,
  borderWidth: 1,
  borderColor: colors.tintStrong,
  fontSize: typography.body,
  color: colors.textPrimary,
} as const;

/**
 * Shared style for the primary raw button (ink background, white label).
 * Kept in sync with Paper's contained buttons for a single visual language.
 */
export const primaryButton = {
  backgroundColor: colors.ink,
  borderRadius: radius.lg,
  minHeight: 48,
  justifyContent: "center",
  paddingVertical: 12,
  paddingHorizontal: 16,
  alignItems: "center",
} as const;

export const primaryButtonLabel = {
  color: colors.onPrimary,
  fontWeight: "800",
  fontSize: typography.body,
} as const;
