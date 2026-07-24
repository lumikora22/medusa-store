import { MD3LightTheme, type MD3Theme } from "react-native-paper";

import { colors, radius } from "./tokens";

export function createPaperTheme(largeInterface = false): MD3Theme {
  const fonts = largeInterface ? Object.fromEntries(Object.entries(MD3LightTheme.fonts).map(([key, font]) => [key, "fontSize" in font ? { ...font, fontSize: font.fontSize + 2, lineHeight: font.lineHeight + 3 } : font])) as unknown as MD3Theme["fonts"] : MD3LightTheme.fonts;
  return {
  ...MD3LightTheme,
  fonts,
  roundness: radius.md,
  colors: {
    ...MD3LightTheme.colors,
    primary: colors.primary,
    onPrimary: colors.onPrimary,
    primaryContainer: colors.tint,
    onPrimaryContainer: colors.ink,
    secondary: colors.primaryDark,
    onSecondary: colors.onPrimary,
    secondaryContainer: colors.tint,
    onSecondaryContainer: colors.ink,
    tertiary: colors.primarySoft,
    onTertiary: colors.textPrimary,
    tertiaryContainer: colors.tint,
    onTertiaryContainer: colors.textPrimary,
    error: colors.danger,
    onError: colors.onPrimary,
    errorContainer: colors.dangerSoft,
    onErrorContainer: colors.danger,
    background: colors.canvas,
    onBackground: colors.textPrimary,
    surface: colors.surface,
    onSurface: colors.textPrimary,
    surfaceVariant: colors.tint,
    onSurfaceVariant: colors.textMuted,
    outline: colors.border,
    outlineVariant: colors.border,
    inverseSurface: colors.textPrimary,
    inverseOnSurface: colors.onPrimary,
    inversePrimary: colors.primarySoft,
    elevation: {
      level0: "transparent",
      level1: colors.surface,
      level2: colors.surface,
      level3: colors.surface,
      level4: colors.surface,
      level5: colors.surface,
    },
    surfaceDisabled: colors.tint,
    onSurfaceDisabled: colors.textMuted,
    backdrop: colors.overlay,
  },
  };
}

export const paperTheme = createPaperTheme();
