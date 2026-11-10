import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { authClient } from "./authClient";
import { BUY_SIGNED_OUT, CAN_RESTORE, buyPlus, plusPrice, restorePlus } from "./platform/purchases";
import { navigate } from "./platform/route";
import { colors, type as typography } from "./theme";
import { Actions, QuietActions } from "./ui/Actions";
import { Button } from "./ui/Button";

interface Props {
  recheck: (userId: string | null) => Promise<boolean>;
  onClose: () => void;
}

/**
 * What Plus is and what it costs, in the Export tool, opened from "Remove the mark". It never decides that the
 * purchase worked: it asks the API (`recheck`), and the switch unlocks when the API says so.
 */
export function PlusUpsell({ recheck, onClose }: Props) {
  /** The signed-in account, which a purchase is made under: undefined until known, null when signed out. */
  const [userId, setUserId] = useState<string | null | undefined>(undefined);
  const canBuy = userId !== undefined && (userId !== null || BUY_SIGNED_OUT);
  /** undefined while loading, null when it can't be bought here right now. */
  const [price, setPrice] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Only now, once someone asks about Plus, is the account looked up: making a collage never touches sign-in.
  useEffect(() => {
    let live = true;
    void authClient
      .getSession()
      .then(({ data }) => data?.user.id ?? null)
      .catch(() => null)
      .then((id) => live && setUserId(id));
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!canBuy) return;
    let live = true;
    void plusPrice(userId).then((p) => live && setPrice(p));
    return () => {
      live = false;
    };
  }, [canBuy, userId]);

  async function run(action: () => Promise<"bought" | "cancelled" | void>, notFound: string) {
    setBusy(true);
    setMessage(null);
    try {
      if ((await action()) === "cancelled") return;
      if (!(await recheck(userId ?? null))) setMessage(notFound);
    } catch (err) {
      console.error(err);
      setMessage("That didn't go through. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View role="region" aria-label="StoryStitch Plus" style={styles.card}>
      <Text style={typography.body}>StoryStitch Plus takes the mark off your exports. You pay once{price ? ` (${price})` : ""}, with no subscription.</Text>
      {canBuy && price === null && <Text style={typography.hint}>Plus can't be bought right now. Please try again later.</Text>}
      {message && (
        <Text role="alert" style={typography.hint}>
          {message}
        </Text>
      )}
      <Actions>
        {userId === undefined ? null : canBuy ? (
          <Button
            label={price ? `Get Plus for ${price}` : "Get Plus"}
            primary
            disabled={busy || !price}
            trackAs="plus_buy"
            onPress={() => void run(() => buyPlus(userId ?? null), "Thanks! Plus can take a minute to turn on. Open Export again if the switch is still locked.")}
          />
        ) : (
          <Button label="Sign in to get Plus" primary trackAs="plus_sign_in" onPress={() => navigate("/account")} />
        )}
      </Actions>
      <QuietActions>
        {CAN_RESTORE && <Button label="Restore purchases" quiet disabled={busy} onPress={() => void run(restorePlus, "No Plus purchase was found for this Apple Account.")} />}
        <Button label="Not now" quiet onPress={onClose} />
      </QuietActions>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12, padding: 16, borderRadius: 16, backgroundColor: colors.surface },
});
