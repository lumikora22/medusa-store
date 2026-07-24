import React from "react";
import Svg, { Path } from "react-native-svg";

type MedusaIconProps = {
  size?: number;
  color?: string;
  accessibilityLabel?: string;
};

/**
 * Brand symbol for in-app use (headers, empty states, splash-like marks).
 * Sourced from the Medusa Store icon identity pack. The launcher icon, adaptive
 * icon and splash are configured separately in app.json.
 */
export function MedusaIcon({ size = 32, color = "#14263D", accessibilityLabel = "Medusa Store" }: MedusaIconProps) {
  return (
    <Svg width={size} height={size * 1.3} viewBox="0 0 200 260" accessibilityRole="image" accessibilityLabel={accessibilityLabel}>
      <Path fill={color} d="M96 18C65 23 39 51 24 93c9 8 21 10 34 3 19-10 33-43 38-78Z" />
      <Path fill={color} d="M101 18c-3 27-11 56-26 74 8 8 17 12 26 12s18-4 26-12c-15-18-23-47-26-74Z" />
      <Path fill={color} d="M106 18c31 5 57 33 72 75-9 8-21 10-34 3-19-10-33-43-38-78Z" />
      <Path fill={color} d="M56 105c17 18 8 37 1 54-9 21-6 40 3 53-15-10-22-26-18-44 4-18 22-37 17-52-1-5-2-8-3-11Z" />
      <Path fill={color} d="M72 105c15 22 5 43-2 61-8 23-3 47 13 62-11-25-2-44 9-63 13-23 8-45-4-60H72Z" />
      <Path fill={color} d="M94 106c3 29-10 50-8 78 2 23 11 44 15 57 8-15 16-31 15-51-1-28-11-55-8-84H94Z" />
      <Path fill={color} d="M130 105c-15 22-5 43 2 61 8 23 3 47-13 62 11-25 2-44-9-63-13-23-8-45 4-60h16Z" />
      <Path fill={color} d="M146 105c-17 18-8 37-1 54 9 21 6 40-3 53 15-10 22-26 18-44-4-18-22-37-17-52 1-5 2-8 3-11Z" />
    </Svg>
  );
}
