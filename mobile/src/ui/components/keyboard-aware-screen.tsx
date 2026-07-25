import React, { useCallback, useEffect, useRef, useState } from "react";
import { Keyboard, type NativeScrollEvent, type NativeSyntheticEvent, ScrollView, type ScrollViewProps, TextInput, useWindowDimensions, View } from "react-native";

const REVEAL_GAP = 24;
const IS_IOS = process.env.EXPO_OS === "ios";
const SHOW_EVENT = IS_IOS ? "keyboardWillShow" : "keyboardDidShow";
const HIDE_EVENT = IS_IOS ? "keyboardWillHide" : "keyboardDidHide";

/** Current on-screen keyboard height, or 0 while it is hidden. */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener(SHOW_EVENT, (event) => setHeight(event.endCoordinates.height));
    const hide = Keyboard.addListener(HIDE_EVENT, () => setHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, []);
  return height;
}

/**
 * Scrollable screen body that keeps the focused input visible above the keyboard.
 *
 * Android edge-to-edge (default since Expo SDK 54) no longer resizes the window when the
 * keyboard opens, so bottom inputs stay covered unless the content is padded and scrolled
 * explicitly. This measures the focused input and scrolls just enough to reveal it.
 */
export function KeyboardAwareScreen({ children, contentContainerStyle, onScroll, ...rest }: ScrollViewProps) {
  const scrollRef = useRef<ScrollView>(null);
  const offset = useRef(0);
  const frame = useRef<number | null>(null);
  const { height: windowHeight } = useWindowDimensions();
  const keyboardHeight = useKeyboardHeight();

  const trackOffset = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    offset.current = event.nativeEvent.contentOffset.y;
    onScroll?.(event);
  }, [onScroll]);

  useEffect(() => {
    const reveal = (height: number) => {
      const input = TextInput.State.currentlyFocusedInput();
      if (!input) return;
      input.measureInWindow((_x, y, _width, inputHeight) => {
        const covered = y + inputHeight + REVEAL_GAP - (windowHeight - height);
        if (covered > 0) scrollRef.current?.scrollTo({ y: offset.current + covered, animated: true });
      });
    };
    const show = Keyboard.addListener(SHOW_EVENT, (event) => {
      const { height } = event.endCoordinates;
      frame.current = requestAnimationFrame(() => reveal(height));
    });
    return () => { show.remove(); if (frame.current != null) cancelAnimationFrame(frame.current); };
  }, [windowHeight]);

  return <ScrollView
    ref={scrollRef}
    contentInsetAdjustmentBehavior="automatic"
    keyboardShouldPersistTaps="handled"
    keyboardDismissMode="interactive"
    scrollEventThrottle={16}
    {...rest}
    onScroll={trackOffset}
    contentContainerStyle={contentContainerStyle}
  >
    {children}
    {keyboardHeight > 0 ? <View style={{ height: keyboardHeight }} /> : null}
  </ScrollView>;
}
