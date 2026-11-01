// Account screens (loaded only when accounts are switched on). They cover the editor rather than replacing it, so
// opening "Account" mid-edit doesn't lose the collage.
import { marked } from "marked";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import privacyMarkdown from "../../../../docs/legal/privacy-policy.md?raw";
import termsMarkdown from "../../../../docs/legal/terms.md?raw";
import { authClient, errorMessage } from "./client";
import { ACCOUNT_PATHS, navigate, useLocation } from "./route";
import { Turnstile } from "./Turnstile";

const MIN_PASSWORD = 8;

/** An in-app link that doesn't reload the page. */
function Link({ to, children }: { to: string; children: ReactNode }) {
  return (
    <a
      href={to}
      onClick={(e) => {
        e.preventDefault();
        navigate(to);
      }}
    >
      {children}
    </a>
  );
}

function Screen({ title, children }: { title: string; children: ReactNode }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), [title]);
  return (
    <main className="account-screen">
      <div className="account-inner">
        <header className="editor-header">
          <h1 ref={heading} tabIndex={-1}>
            {title}
          </h1>
          <a
            className="button"
            href="/"
            onClick={(e) => {
              e.preventDefault();
              navigate("/");
            }}
          >
            Back to StoryStitch
          </a>
        </header>
        {children}
      </div>
    </main>
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

function Field(props: { label: string; type: string; value: string; onChange: (v: string) => void; autoComplete: string }) {
  return (
    <label className="field">
      <span>{props.label}</span>
      <input
        type={props.type}
        value={props.value}
        autoComplete={props.autoComplete}
        required
        minLength={props.type === "password" ? MIN_PASSWORD : undefined}
        onChange={(e) => props.onChange(e.target.value)}
      />
    </label>
  );
}

function Message({ error, children }: { error?: boolean; children: ReactNode }) {
  return (
    <p className={error ? "notice" : "success"} role={error ? "alert" : "status"}>
      {children}
    </p>
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

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await authClient.signIn.email({ email, password, fetchOptions: { headers: bot.headers() } });
    setBusy(false);
    bot.reset();
    setUnverified(error?.code === "EMAIL_NOT_VERIFIED");
    setError(error ? errorMessage(error) : null);
  }

  return (
    <form className="account-form" onSubmit={submit}>
      <p className="hint">Accounts are optional. You can make and share collages without one.</p>
      <Field label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" />
      <Field label="Password" type="password" value={password} onChange={setPassword} autoComplete="current-password" />
      {bot.widget}
      {error && <Message error>{error}</Message>}
      {unverified &&
        (resent ? (
          <Message>We sent a new confirmation link to {email}.</Message>
        ) : (
          <button
            type="button"
            className="button"
            onClick={async () => {
              await authClient.sendVerificationEmail({ email, callbackURL: `${location.origin}/account?welcome=1` });
              setResent(true);
            }}
          >
            Send the confirmation email again
          </button>
        ))}
      <button type="submit" className="button primary" disabled={busy || !bot.token}>
        {busy ? "Signing in…" : "Sign in"}
      </button>
      <p className="account-links">
        <Link to="/reset-password">Forgot your password?</Link> · <Link to="/sign-up">Create an account</Link>
      </p>
    </form>
  );
}

function SignUp() {
  const bot = useBotCheck();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await authClient.signUp.email({
      email,
      password,
      name: email.split("@")[0]!,
      callbackURL: `${location.origin}/account?welcome=1`,
      fetchOptions: { headers: bot.headers() },
    });
    setBusy(false);
    bot.reset();
    setError(error ? errorMessage(error) : null);
    setSent(!error);
  }

  if (sent) {
    return (
      <div className="account-form">
        <Message>
          Check your email. We sent a link to <strong>{email}</strong>. Open it on this device to finish creating your
          account.
        </Message>
        <p className="account-links">
          <Link to="/account">Back to sign in</Link>
        </p>
      </div>
    );
  }

  return (
    <form className="account-form" onSubmit={submit}>
      <p className="hint">Your photos stay on this device. An account only stores collages you choose to save.</p>
      <Field label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" />
      <Field label="Password (at least 8 characters)" type="password" value={password} onChange={setPassword} autoComplete="new-password" />
      {bot.widget}
      {error && <Message error>{error}</Message>}
      <p className="hint">
        By creating an account you agree to the <Link to="/terms">terms</Link> and <Link to="/privacy">privacy policy</Link>.
      </p>
      <button type="submit" className="button primary" disabled={busy || !bot.token}>
        {busy ? "Creating…" : "Create account"}
      </button>
      <p className="account-links">
        Already have an account? <Link to="/account">Sign in</Link>
      </p>
    </form>
  );
}

function ResetPassword({ token, error: linkError }: { token: string | null; error: string | null }) {
  const bot = useBotCheck();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(linkError ? errorMessage({ code: linkError }) : null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function requestLink(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await authClient.requestPasswordReset({
      email,
      redirectTo: `${location.origin}/reset-password`,
      fetchOptions: { headers: bot.headers() },
    });
    setBusy(false);
    bot.reset();
    setError(error ? errorMessage(error) : null);
    setDone(!error);
  }

  async function setNewPassword(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await authClient.resetPassword({ newPassword: password, token: token! });
    setBusy(false);
    setError(error ? errorMessage(error) : null);
    setDone(!error);
  }

  if (token && !linkError) {
    return done ? (
      <div className="account-form">
        <Message>Your password is changed, and you're signed out everywhere else.</Message>
        <Link to="/account">Sign in</Link>
      </div>
    ) : (
      <form className="account-form" onSubmit={setNewPassword}>
        <Field label="New password (at least 8 characters)" type="password" value={password} onChange={setPassword} autoComplete="new-password" />
        {error && <Message error>{error}</Message>}
        <button type="submit" className="button primary" disabled={busy}>
          {busy ? "Saving…" : "Set new password"}
        </button>
      </form>
    );
  }

  return done ? (
    <div className="account-form">
      <Message>If there's an account for {email}, we sent it a link to choose a new password.</Message>
    </div>
  ) : (
    <form className="account-form" onSubmit={requestLink}>
      <p className="hint">Enter your email and we'll send you a link to choose a new password.</p>
      <Field label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" />
      {bot.widget}
      {error && <Message error>{error}</Message>}
      <button type="submit" className="button primary" disabled={busy || !bot.token}>
        {busy ? "Sending…" : "Send reset link"}
      </button>
    </form>
  );
}

function Profile({ email, welcome }: { email: string; welcome: boolean }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function deleteAccount(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await authClient.deleteUser({ password });
    setBusy(false);
    if (error) setError(errorMessage(error));
    else navigate("/account?deleted=1");
  }

  return (
    <div className="account-form">
      {welcome && <Message>Your email is confirmed and you're signed in.</Message>}
      <p>
        Signed in as <strong>{email}</strong>
      </p>
      <button type="button" className="button" onClick={() => authClient.signOut()}>
        Sign out
      </button>
      <button
        type="button"
        className="button"
        onClick={async () => {
          await authClient.revokeSessions();
          await authClient.signOut();
        }}
      >
        Sign out on every device
      </button>
      <details className="danger-zone">
        <summary>Delete account</summary>
        <form className="account-form" onSubmit={deleteAccount}>
          <p className="hint">This permanently deletes your account and everything saved in it.</p>
          <Field label="Your password" type="password" value={password} onChange={setPassword} autoComplete="current-password" />
          {error && <Message error>{error}</Message>}
          <button type="submit" className="button danger" disabled={busy}>
            {busy ? "Deleting…" : "Delete my account"}
          </button>
        </form>
      </details>
      <p className="account-links">
        <Link to="/privacy">Privacy policy</Link> · <Link to="/terms">Terms</Link>
      </p>
    </div>
  );
}

function AccountHome({ params }: { params: URLSearchParams }) {
  const { data, isPending } = authClient.useSession();
  if (isPending) return <p className="hint">Loading…</p>;
  if (data) return <Profile email={data.user.email} welcome={params.has("welcome")} />;
  return (
    <>
      {params.has("deleted") && <Message>Your account and everything in it have been deleted.</Message>}
      <SignIn />
    </>
  );
}

/** Our own legal drafts (docs/legal), rendered from Markdown with their editing notes stripped. */
function Legal({ markdown }: { markdown: string }) {
  const html = marked.parse(markdown.replace(/<!--[\s\S]*?-->/g, ""), { async: false });
  return <article className="legal" dangerouslySetInnerHTML={{ __html: html }} />;
}

const TITLES: Record<(typeof ACCOUNT_PATHS)[number], string> = {
  "/account": "Account",
  "/sign-up": "Create an account",
  "/reset-password": "Reset password",
  "/privacy": "Privacy policy",
  "/terms": "Terms of use",
};

export default function Accounts() {
  const { pathname, searchParams } = useLocation();
  const path = ACCOUNT_PATHS.find((p) => p === pathname);
  if (!path) return null;
  return (
    <Screen title={TITLES[path]}>
      {path === "/account" && <AccountHome params={searchParams} />}
      {path === "/sign-up" && <SignUp />}
      {path === "/reset-password" && <ResetPassword token={searchParams.get("token")} error={searchParams.get("error")} />}
      {path === "/privacy" && <Legal markdown={privacyMarkdown} />}
      {path === "/terms" && <Legal markdown={termsMarkdown} />}
    </Screen>
  );
}
