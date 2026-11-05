// Account screens (loaded only when accounts are switched on). They cover the editor rather than replacing it, so
// opening "Account" mid-edit doesn't lose the collage.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ScrollView, StyleSheet, Text, View, type HostInstance } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { authClient, errorMessage } from "./authClient";
import { Disclosure, Field, Form, ORIGIN, SubmitButton, sendToApp } from "./platform/forms";
import { ACCOUNT_PATHS, navigate, useLocation } from "./platform/route";
import { Turnstile } from "./platform/Turnstile";
import { colors, fontFamily, type } from "./theme";
import { Button } from "./ui/Button";
import { NavLink, TextLink } from "./ui/NavLink";

const MIN_PASSWORD = 8;

function Screen({ title, children }: { title: string; children: ReactNode }) {
  const heading = useRef<HostInstance>(null);
  useEffect(() => heading.current?.focus?.(), [title]);
  return (
    <SafeAreaView role="main" style={styles.screen}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.inner}>
        <View style={styles.header}>
          <Text ref={heading} role="heading" aria-level={1} {...{ tabIndex: -1 }} style={styles.title}>
            {title}
          </Text>
          <NavLink to="/" label="Back to StoryStitch" />
        </View>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

/** A bot-checked form: holds the Turnstile token and gets a fresh one after every submit. */
function useBotCheck() {
  const [token, setToken] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  return {
    token,
    widget: <Turnstile onToken={setToken} resetKey={resetKey} />,
    headers: () => ({ "x-captcha-response": token ?? "" }),
    reset: () => setResetKey((k) => k + 1),
  };
}

const Hint = ({ children }: { children: string }) => <Text style={type.hint}>{children}</Text>;

function Message({ error, children }: { error?: boolean; children: ReactNode }) {
  return (
    <Text role={error ? "alert" : "status"} style={[styles.message, error ? styles.notice : styles.success]}>
      {children}
    </Text>
  );
}

function SignIn() {
  const bot = useBotCheck();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [unverified, setUnverified] = useState(false);
  const [resent, setResent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    const { error } = await authClient.signIn.email({ email, password, fetchOptions: { headers: bot.headers() } });
    setBusy(false);
    bot.reset();
    setUnverified(error?.code === "EMAIL_NOT_VERIFIED");
    setError(error ? errorMessage(error) : null);
  }

  return (
    <Form onSubmit={() => void submit()}>
      <Hint>Accounts are optional. You can make and share collages without one.</Hint>
      <Field label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" />
      <Field label="Password" type="password" value={password} onChange={setPassword} autoComplete="current-password" minLength={MIN_PASSWORD} />
      {bot.widget}
      {error && <Message error>{error}</Message>}
      {unverified &&
        (resent ? (
          <Message>We sent a new confirmation link to {email}.</Message>
        ) : (
          <Button
            label="Send the confirmation email again"
            onPress={async () => {
              await authClient.sendVerificationEmail({ email, callbackURL: `${ORIGIN}/account?welcome=1` });
              setResent(true);
            }}
          />
        ))}
      <SubmitButton label={busy ? "Signing in…" : "Sign in"} disabled={busy || !bot.token} />
      <Text style={type.hint}>
        <TextLink to="/reset-password">Forgot your password?</TextLink> · <TextLink to="/sign-up">Create an account</TextLink>
      </Text>
    </Form>
  );
}

function SignUp() {
  const bot = useBotCheck();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    const { error } = await authClient.signUp.email({
      email,
      password,
      name: email.split("@")[0]!,
      callbackURL: `${ORIGIN}/account?welcome=1`,
      fetchOptions: { headers: bot.headers() },
    });
    setBusy(false);
    bot.reset();
    setError(error ? errorMessage(error) : null);
    setSent(!error);
  }

  if (sent) {
    return (
      <View style={styles.form}>
        <Message>
          Check your email. We sent a link to <Text style={styles.strong}>{email}</Text>. Open it on this device to finish creating your account.
        </Message>
        <Text style={type.hint}>
          <TextLink to="/account">Back to sign in</TextLink>
        </Text>
      </View>
    );
  }

  return (
    <Form onSubmit={() => void submit()}>
      <Hint>Your photos stay on this device. An account only stores collages you choose to save.</Hint>
      <Field label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" />
      <Field label="Password (at least 8 characters)" type="password" value={password} onChange={setPassword} autoComplete="new-password" minLength={MIN_PASSWORD} />
      {bot.widget}
      {error && <Message error>{error}</Message>}
      <SubmitButton label={busy ? "Creating…" : "Create account"} disabled={busy || !bot.token} />
      <Text style={type.hint}>
        Already have an account? <TextLink to="/account">Sign in</TextLink>
      </Text>
    </Form>
  );
}

function ResetPassword({ token, error: linkError }: { token: string | null; error: string | null }) {
  const bot = useBotCheck();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(linkError ? errorMessage({ code: linkError }) : null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function requestLink() {
    setBusy(true);
    const { error } = await authClient.requestPasswordReset({
      email,
      redirectTo: `${ORIGIN}/reset-password`,
      fetchOptions: { headers: bot.headers() },
    });
    setBusy(false);
    bot.reset();
    setError(error ? errorMessage(error) : null);
    setDone(!error);
  }

  async function setNewPassword() {
    setBusy(true);
    const { error } = await authClient.resetPassword({ newPassword: password, token: token! });
    setBusy(false);
    setError(error ? errorMessage(error) : null);
    setDone(!error);
  }

  if (token && !linkError) {
    return done ? (
      <View style={styles.form}>
        <Message>Your password is changed, and you're signed out everywhere else.</Message>
        <Text style={type.hint}>
          <TextLink to="/account">Sign in</TextLink>
        </Text>
      </View>
    ) : (
      <Form onSubmit={() => void setNewPassword()}>
        <Field label="New password (at least 8 characters)" type="password" value={password} onChange={setPassword} autoComplete="new-password" minLength={MIN_PASSWORD} />
        {error && <Message error>{error}</Message>}
        <SubmitButton label={busy ? "Saving…" : "Set new password"} disabled={busy} />
      </Form>
    );
  }

  return done ? (
    <View style={styles.form}>
      <Message>If there's an account for {email}, we sent it a link to choose a new password.</Message>
    </View>
  ) : (
    <Form onSubmit={() => void requestLink()}>
      <Hint>Enter your email and we'll send you a link to choose a new password.</Hint>
      <Field label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" />
      {bot.widget}
      {error && <Message error>{error}</Message>}
      <SubmitButton label={busy ? "Sending…" : "Send reset link"} disabled={busy || !bot.token} />
    </Form>
  );
}

function Profile({ email, welcome }: { email: string; welcome: boolean }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function deleteAccount() {
    setBusy(true);
    const { error } = await authClient.deleteUser({ password });
    setBusy(false);
    if (error) setError(errorMessage(error));
    else navigate("/account?deleted=1");
  }

  return (
    <View style={styles.form}>
      {welcome && <Message>Your email is confirmed and you're signed in.</Message>}
      <Text style={type.body}>
        Signed in as <Text style={styles.strong}>{email}</Text>
      </Text>
      <Button label="Sign out" onPress={() => void authClient.signOut()} />
      <Button
        label="Sign out on every device"
        onPress={async () => {
          await authClient.revokeSessions();
          await authClient.signOut();
        }}
      />
      <Disclosure summary="Delete account">
        <Form onSubmit={() => void deleteAccount()}>
          <Hint>This permanently deletes your account and everything saved in it.</Hint>
          <Field label="Your password" type="password" value={password} onChange={setPassword} autoComplete="current-password" minLength={MIN_PASSWORD} />
          {error && <Message error>{error}</Message>}
          <SubmitButton label={busy ? "Deleting…" : "Delete my account"} disabled={busy} danger />
        </Form>
      </Disclosure>
    </View>
  );
}

function AccountHome({ params }: { params: URLSearchParams }) {
  const { data, isPending } = authClient.useSession();
  if (isPending) return <Hint>Loading…</Hint>;
  if (data) return <Profile email={data.user.email} welcome={params.has("welcome")} />;
  return (
    <>
      {params.has("deleted") && <Message>Your account and everything in it have been deleted.</Message>}
      <SignIn />
    </>
  );
}

const TITLES: Record<(typeof ACCOUNT_PATHS)[number], string> = {
  "/account": "Account",
  "/sign-up": "Create an account",
  "/reset-password": "Reset password",
};

/** The page the iOS app shows in a WebView, because Turnstile only runs on a web page. */
const BotCheck = () => (
  <View style={styles.botCheck}>
    <Turnstile onToken={sendToApp} resetKey={0} />
  </View>
);

export default function Accounts() {
  const { pathname, searchParams } = useLocation();
  if (pathname === "/bot-check") return <BotCheck />;
  const path = ACCOUNT_PATHS.find((p) => p === pathname);
  if (!path) return null;
  return (
    <Screen title={TITLES[path]}>
      {path === "/account" && <AccountHome params={searchParams} />}
      {path === "/sign-up" && <SignUp />}
      {path === "/reset-password" && <ResetPassword token={searchParams.get("token")} error={searchParams.get("error")} />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  botCheck: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, zIndex: 10, backgroundColor: colors.bg },
  screen: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, zIndex: 10, backgroundColor: colors.bg },
  inner: { width: "100%", maxWidth: 480, alignSelf: "center", gap: 16, paddingTop: 12, paddingHorizontal: 16, paddingBottom: 24 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  title: { ...type.title, flexShrink: 1 },
  form: { gap: 12 },
  message: { fontFamily, fontSize: 16, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10 },
  notice: { backgroundColor: colors.warnBg, color: colors.warnText },
  success: { backgroundColor: colors.okBg, color: colors.okText },
  strong: { fontWeight: "700" },
});
