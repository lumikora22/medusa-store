import React from "react";
import Svg, { Rect } from "react-native-svg";
import { code128Bars } from "../../core/labels/code128";
import { colors } from "../../theme/tokens";

export function Code128View({ value, height = 58 }: { value: string; height?: number }) {
  const barcode = code128Bars(value, 2, height);
  return <Svg accessibilityLabel={`Código de barras ${value}`} width="100%" height={height} viewBox={`0 0 ${barcode.width} ${height}`} preserveAspectRatio="xMidYMid meet">{barcode.bars.map((bar, index) => <Rect key={`${bar.x}-${index}`} x={bar.x} y={0} width={bar.width} height={height} fill={colors.dark} />)}</Svg>;
}
