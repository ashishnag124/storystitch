import type { ReactNode } from "react";
import { Pressable, type PressableProps } from "react-native";

interface Props extends Omit<PressableProps, "role" | "children"> {
  role: "radio" | "tab";
  onPress: () => void;
  children: ReactNode;
}

/** A radio or tab. React Native Web only treats Space as a press on role="button", so these add it themselves. */
export function Choice({ onPress, children, ...props }: Props) {
  const onKeyDown = (e: { key?: string; nativeEvent?: { key?: string }; preventDefault?: () => void }) => {
    if ((e.key ?? e.nativeEvent?.key) !== " ") return;
    e.preventDefault?.();
    onPress();
  };
  return (
    <Pressable {...props} onPress={onPress} {...{ onKeyDown }}>
      {children}
    </Pressable>
  );
}
