import { useEffect, useMemo, useRef, useState } from "react";
import { PanResponder, StyleSheet, Text, View } from "react-native";
import { MIN_TARGET, colors, type } from "../theme";

interface Props {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  /** The value as shown beside the slider. */
  display: string;
  disabled?: boolean;
  onChange: (value: number) => void;
}

const THUMB = 26;

export function Slider({ label, value, min, max, step, display, disabled, onChange }: Props) {
  const [width, setWidth] = useState(0);
  const from = useRef(0);
  function moveTo(x: number) {
    if (disabled || width <= THUMB) return;
    const fraction = Math.min(1, Math.max(0, (x - THUMB / 2) / (width - THUMB)));
    onChange(Math.round((min + fraction * (max - min)) / step) * step);
  }
  const grant = (x: number) => {
    from.current = x;
    moveTo(x);
  };
  const drag = (dx: number) => moveTo(from.current + dx);
  // The responder lasts the life of the slider, so it reaches the latest props through this ref.
  const handlers = useRef({ grant, drag });
  useEffect(() => {
    handlers.current = { grant, drag };
  });
  const responder = useMemo(
    () =>
      // eslint-disable-next-line react-hooks/refs -- these run on touch events, never during render
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (e) => handlers.current.grant(e.nativeEvent.locationX),
        onPanResponderMove: (_, s) => handlers.current.drag(s.dx),
      }),
    [],
  );
  const fraction = (value - min) / (max - min);
  const adjust = (direction: number) => !disabled && onChange(Math.min(max, Math.max(min, value + direction * Math.max(step, (max - min) / 10))));
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <View
        accessible
        role="slider"
        aria-label={label}
        aria-disabled={disabled}
        accessibilityValue={{ text: display }}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        onAccessibilityAction={(e) => adjust(e.nativeEvent.actionName === "increment" ? 1 : -1)}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        style={[styles.track, disabled && styles.disabled]}
        {...responder.panHandlers}
      >
        <View style={styles.rail} />
        <View style={[styles.fill, { width: THUMB / 2 + fraction * (width - THUMB) }]} />
        <View style={[styles.thumb, { left: fraction * (width - THUMB) }]} />
      </View>
      <Text style={styles.value}>{display}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  label: { ...type.hint, width: 72 },
  track: { flex: 1, height: MIN_TARGET, justifyContent: "center" },
  disabled: { opacity: 0.4 },
  rail: { height: 4, borderRadius: 2, backgroundColor: colors.border },
  fill: { position: "absolute", height: 4, borderRadius: 2, backgroundColor: colors.accent },
  thumb: { position: "absolute", width: THUMB, height: THUMB, borderRadius: THUMB / 2, backgroundColor: colors.accent },
  value: { ...type.body, width: 44, fontSize: 14, textAlign: "right" },
});
