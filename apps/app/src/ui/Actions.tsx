import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { Button, type ButtonProps } from "./Button";

/**
 * How actions are grouped, on every screen and on web and iOS alike. In a group:
 *
 * - At most one primary (`<Button primary>`): what most people came to do. Full width.
 * - At most one secondary (a plain `<Button>`): outlined, the same width as the primary.
 * - Everything else is quiet (`<Button quiet>` or a NavLink), in one QuietActions row at the bottom.
 * - Something destructive adds `danger`: quiet until it's asked to confirm, then a filled primary.
 *
 * In a top bar there's no room for that, so what leads back is quiet and the action on the end is primary. Tools of
 * equal rank, where none comes first, go in a ToolGrid. Keep labels short enough to fit on one line at 375 px.
 */
export const Actions = ({ children }: { children: ReactNode }) => <View style={styles.actions}>{children}</View>;

export const QuietActions = ({ children }: { children: ReactNode }) => <View style={styles.quiet}>{children}</View>;

/** Tools of equal rank, in even rows of equal widths. */
export function ToolGrid({ tools }: { tools: ButtonProps[] }) {
  // Three to a row when that comes out even, otherwise two.
  const flexBasis = tools.length % 3 === 0 ? "30%" : "40%";
  return (
    <View style={styles.tools}>
      {tools.map((t) => (
        <View key={t.label} style={[styles.tool, { flexBasis }]}>
          <Button {...t} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { gap: 8 },
  quiet: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "center", columnGap: 16 },
  tools: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tool: { flexGrow: 1 },
});
