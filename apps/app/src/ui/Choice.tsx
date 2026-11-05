import type { UsageControl } from "@storystitch/shared";
import type { ReactNode } from "react";
import { Pressable, type PressableProps } from "react-native";
import { track } from "../usage";

interface Props extends Omit<PressableProps, "role" | "children"> {
  role: "radio" | "tab";
  onPress: () => void;
  children: ReactNode;
  /** Counts presses in usage reports, under this name. */
  trackAs?: UsageControl;
}

/** A radio or tab. React Native Web only treats Space as a press on role="button", so these add it themselves. */
export function Choice({ onPress, children, trackAs, ...props }: Props) {
  const press = () => {
    if (trackAs) track("control_pressed", { control: trackAs });
    onPress();
  };
  const onKeyDown = (e: { key?: string; nativeEvent?: { key?: string }; preventDefault?: () => void }) => {
    if ((e.key ?? e.nativeEvent?.key) !== " ") return;
    e.preventDefault?.();
    press();
  };
  return (
    <Pressable {...props} onPress={press} {...{ onKeyDown }}>
      {children}
    </Pressable>
  );
}
