import React, { useRef, useState } from "react";
import { Animated, StyleSheet } from "react-native";
import { Image } from "expo-image";
import {
  PanGestureHandler,
  PinchGestureHandler,
  State,
  type PanGestureHandlerStateChangeEvent,
  type PinchGestureHandlerStateChangeEvent,
} from "react-native-gesture-handler";

/**
 * Pinch-to-zoom + pan image that works on both iOS and Android.
 *
 * The previous viewer relied on `ScrollView` `maximumZoomScale`, which is an
 * iOS-only prop — Android users could not zoom at all. This drives the zoom with
 * react-native-gesture-handler + the built-in Animated API (no Reanimated / babel
 * plugin needed), so pinch and pan behave the same on every platform.
 */
export function ZoomableImage({ uri, width, height, onZoomChange }: { uri: string; width: number; height: number; onZoomChange?: (zoomed: boolean) => void }) {
  const pinchRef = useRef(null);
  const panRef = useRef(null);
  const [zoomed, setZoomed] = useState(false);
  const reportZoom = (next: boolean) => { setZoomed(next); onZoomChange?.(next); };

  const baseScale = useRef(new Animated.Value(1)).current;
  const pinchScale = useRef(new Animated.Value(1)).current;
  const scale = Animated.multiply(baseScale, pinchScale);
  const lastScale = useRef(1);

  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const lastPan = useRef({ x: 0, y: 0 });

  const resetPan = () => {
    translateX.setOffset(0); translateX.setValue(0);
    translateY.setOffset(0); translateY.setValue(0);
    lastPan.current = { x: 0, y: 0 };
  };

  const onPinchEvent = Animated.event([{ nativeEvent: { scale: pinchScale } }], { useNativeDriver: true });
  const onPinchStateChange = (event: PinchGestureHandlerStateChangeEvent) => {
    if (event.nativeEvent.oldState === State.ACTIVE) {
      lastScale.current *= event.nativeEvent.scale;
      pinchScale.setValue(1);
      if (lastScale.current <= 1) {
        lastScale.current = 1;
        Animated.spring(baseScale, { toValue: 1, useNativeDriver: true, bounciness: 0 }).start();
        Animated.spring(translateX, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start(resetPan);
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start();
      } else {
        if (lastScale.current > 5) lastScale.current = 5;
        baseScale.setValue(lastScale.current);
      }
      reportZoom(lastScale.current > 1.01);
    }
  };

  const onPanEvent = Animated.event([{ nativeEvent: { translationX: translateX, translationY: translateY } }], { useNativeDriver: true });
  const onPanStateChange = (event: PanGestureHandlerStateChangeEvent) => {
    if (event.nativeEvent.oldState === State.ACTIVE) {
      if (lastScale.current <= 1) { resetPan(); return; }
      lastPan.current = { x: lastPan.current.x + event.nativeEvent.translationX, y: lastPan.current.y + event.nativeEvent.translationY };
      translateX.setOffset(lastPan.current.x); translateX.setValue(0);
      translateY.setOffset(lastPan.current.y); translateY.setValue(0);
    }
  };

  return (
    <PanGestureHandler ref={panRef} enabled={zoomed} simultaneousHandlers={pinchRef} onGestureEvent={onPanEvent} onHandlerStateChange={onPanStateChange} minPointers={1} maxPointers={2} avgTouches>
      <Animated.View style={styles.fill} collapsable={false}>
        <PinchGestureHandler ref={pinchRef} simultaneousHandlers={panRef} onGestureEvent={onPinchEvent} onHandlerStateChange={onPinchStateChange}>
          <Animated.View style={[styles.fill, { transform: [{ translateX }, { translateY }, { scale }] }]} collapsable={false}>
            <Image source={uri} contentFit="contain" style={{ width, height }} />
          </Animated.View>
        </PinchGestureHandler>
      </Animated.View>
    </PanGestureHandler>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1, alignItems: "center", justifyContent: "center" } });
