import { createContext, use, useState, type ReactNode } from "react";
import { Text, TextInput, View } from "react-native";
import { WEB_URL } from "../config";
import { colors, type } from "../theme";
import { Button } from "../ui/Button";

/** Where emailed links go when iOS doesn't hand them to the app, such as on a computer: the website. */
export const ORIGIN = WEB_URL;

// The bot check page only runs on web.
export const sendToApp = () => {};

const Submit = createContext<() => void>(() => {});

export function Form({ onSubmit, children }: { onSubmit: () => void; label?: string; children: ReactNode }) {
  return (
    <Submit value={onSubmit}>
      <View style={{ gap: 12 }}>{children}</View>
    </Submit>
  );
}

interface FieldProps {
  label: string;
  type: "email" | "password";
  value: string;
  onChange: (value: string) => void;
}

export function Field({ label, type: kind, value, onChange }: FieldProps) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={type.hint}>{label}</Text>
      <TextInput
        aria-label={label}
        value={value}
        onChangeText={onChange}
        autoCapitalize="none"
        secureTextEntry={kind === "password"}
        keyboardType={kind === "email" ? "email-address" : "default"}
        style={{ minHeight: 44, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 10, backgroundColor: colors.surface, color: colors.text, fontSize: 16 }}
      />
    </View>
  );
}

export function SubmitButton({ label, disabled, danger }: { label: string; disabled?: boolean; danger?: boolean }) {
  const submit = use(Submit);
  return <Button label={label} primary danger={danger} disabled={disabled} onPress={submit} />;
}

export function Disclosure({ summary, children }: { summary: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ gap: 12 }}>
      <Button label={summary} quiet danger onPress={() => setOpen(!open)} />
      {open && children}
    </View>
  );
}
