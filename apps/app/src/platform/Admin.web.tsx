// The admin dashboard at /admin (web only, behind EXPO_PUBLIC_FEATURE_ADMIN). Loaded on first use, so it stays out of the
// first download. The API decides who may see the numbers; this screen only shows what it answers.
import { ADMIN_DAILY_EVENTS, AdminStatsSchema, type AdminStats } from "@storystitch/shared";
import { useEffect, useState, type ReactNode } from "react";
import { authClient, errorMessage } from "../authClient";
import { API_URL } from "../config";
import "./admin.css";
import { Field, Form, SubmitButton } from "./forms";
import { navigate, useLocation } from "./route";
import { Turnstile } from "./Turnstile";

const DESKTOP = "(min-width: 900px)";
const PERIODS = [7, 30, 90] as const;
const COLUMNS: Record<(typeof ADMIN_DAILY_EVENTS)[number], string> = {
  visitors: "Visitors",
  visit_started: "Visits",
  photos_picked: "Photo picks",
  collage_exported: "Exports",
  collage_shared: "Shares",
  layout_saved: "Layouts saved",
  signed_up: "Sign-ups",
  error_shown: "Errors",
};

function useDesktop() {
  const [desktop, setDesktop] = useState(() => window.matchMedia(DESKTOP).matches);
  useEffect(() => {
    const query = window.matchMedia(DESKTOP);
    const update = () => setDesktop(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return desktop;
}

const Message = ({ error, children }: { error?: boolean; children: ReactNode }) => (
  <p role={error ? "alert" : "status"} className={error ? "admin-message error" : "admin-message"}>
    {children}
  </p>
);

function CodeField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label className="field">
      <span>Authenticator code</span>
      <input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={value} onChange={(e) => onChange(e.target.value.trim())} />
    </label>
  );
}

function SignIn({ onCodeNeeded }: { onCodeNeeded: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    const { data, error } = await authClient.signIn.email({ email, password, fetchOptions: { headers: { "x-captcha-response": token ?? "" } } });
    setBusy(false);
    // A token works once, so the form has to wait for the next one.
    setToken(null);
    setResetKey((k) => k + 1);
    setError(error ? errorMessage(error) : null);
    // With an authenticator on, the password alone doesn't start a session: the code is asked for next.
    if ((data as { twoFactorRedirect?: boolean } | null)?.twoFactorRedirect) onCodeNeeded();
  }

  return (
    <Form onSubmit={() => void submit()} label="Admin sign in">
      <Field label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" />
      <Field label="Password" type="password" value={password} onChange={setPassword} autoComplete="current-password" minLength={8} />
      <Turnstile onToken={setToken} resetKey={resetKey} />
      {error && <Message error>{error}</Message>}
      <SubmitButton label={busy ? "Signing in…" : "Sign in"} disabled={busy || !token} />
    </Form>
  );
}

function Code({ onDone, children }: { onDone: () => void; children?: ReactNode }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    const { error } = await authClient.twoFactor.verifyTotp({ code });
    setBusy(false);
    if (error) setError(error.status === 429 ? errorMessage(error) : "That code isn't right. Check the time on your device and try again.");
    else onDone();
  }

  return (
    <Form onSubmit={() => void submit()} label="Second step">
      {children}
      <CodeField value={code} onChange={setCode} />
      {error && <Message error>{error}</Message>}
      <SubmitButton label={busy ? "Checking…" : "Verify"} disabled={busy} />
    </Form>
  );
}

/** Admin accounts must sign in with an authenticator app: this adds it, ending with a code to prove it works. */
function Enroll({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [secret, setSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function start() {
    setBusy(true);
    const { data, error } = await authClient.twoFactor.enable({ password, issuer: "StoryStitch" });
    setBusy(false);
    const uri = data && "totpURI" in data ? data.totpURI : null;
    const found = uri ? new URL(uri).searchParams.get("secret") : null;
    setError(error ? errorMessage(error) : found ? null : "Something went wrong. Please try again.");
    setSecret(found);
  }

  if (!secret) {
    return (
      <Form onSubmit={() => void start()} label="Set up the authenticator">
        <Message>Admin accounts need an authenticator app (any app that makes six-digit codes). Confirm your password to set it up.</Message>
        <Field label="Password" type="password" value={password} onChange={setPassword} autoComplete="current-password" minLength={8} />
        {error && <Message error>{error}</Message>}
        <SubmitButton label={busy ? "Working…" : "Set up"} disabled={busy} />
      </Form>
    );
  }
  return (
    <Code onDone={onDone}>
      <p>
        In your authenticator app, add an account by entering this key (choose the time-based option):
        <br />
        <code className="secret">{secret}</code>
      </p>
      <p>Then enter the six-digit code it shows.</p>
    </Code>
  );
}

const percent = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : "-");

function Table({ caption, headers, rows }: { caption: string; headers: string[]; rows: (string | number)[][] }) {
  return (
    <section>
      <h2>{caption}</h2>
      {rows.length ? (
        <table>
          <thead>
            <tr>
              {headers.map((h) => (
                <th key={h} scope="col">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row[0]}>
                {row.map((cell, i) => (i === 0 ? <th key={i} scope="row">{cell}</th> : <td key={i}>{cell}</td>))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="muted">None in this period.</p>
      )}
    </section>
  );
}

function Stats({ stats }: { stats: AdminStats }) {
  const { picked, exported, saved } = stats.funnel;
  return (
    <>
      <Table
        caption="Daily totals"
        headers={["Day", ...ADMIN_DAILY_EVENTS.map((e) => COLUMNS[e])]}
        rows={stats.daily.map((d) => [d.day, ...ADMIN_DAILY_EVENTS.map((e) => d.counts[e])])}
      />
      <section>
        <h2>Funnel</h2>
        <p className="muted">Visitors are estimates; each day is counted separately.</p>
        <dl className="funnel">
          <div>
            <dt>Photos picked</dt>
            <dd>{picked}</dd>
          </div>
          <div>
            <dt>Exported</dt>
            <dd>
              {exported} <small>{percent(exported, picked)} of picked</small>
            </dd>
          </div>
          <div>
            <dt>Saved</dt>
            <dd>
              {saved} <small>{percent(saved, exported)} of exported</small>
            </dd>
          </div>
        </dl>
      </section>
      <Table caption="Top layouts (all time)" headers={["Layout", "Exports"]} rows={stats.topLayouts.map((l) => [l.layout, l.exports])} />
      <Table caption="Errors by code" headers={["Code", "Shown"]} rows={stats.errors.map((e) => [e.code, e.count])} />
    </>
  );
}

type Load = { state: "loading" } | { state: "ready"; stats: AdminStats } | { state: "refused" } | { state: "enroll" } | { state: "error" };

function Dashboard() {
  const [days, setDays] = useState<(typeof PERIODS)[number]>(30);
  const [attempt, setAttempt] = useState(0);
  const [load, setLoad] = useState<Load>({ state: "loading" });

  useEffect(() => {
    let cancelled = false;
    const done = (next: Load) => !cancelled && setLoad(next);
    fetch(`${API_URL}/admin/stats?days=${days}`, { credentials: "include" })
      .then(async (res) => {
        if (res.ok) return done({ state: "ready", stats: AdminStatsSchema.parse(await res.json()) });
        if (res.status === 403) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          return done({ state: body?.error === "TWO_FACTOR_REQUIRED" ? "enroll" : "refused" } as Load);
        }
        done({ state: "error" });
      })
      .catch(() => done({ state: "error" }));
    return () => {
      cancelled = true;
    };
  }, [days, attempt]);

  if (load.state === "loading") return <p className="muted">Loading…</p>;
  if (load.state === "enroll") return <Enroll onDone={() => setAttempt((n) => n + 1)} />;
  if (load.state === "refused") {
    return (
      <>
        <Message error>This account can't open the admin dashboard.</Message>
        <button type="button" className="submit" onClick={() => void authClient.signOut()}>
          Sign out
        </button>
      </>
    );
  }
  if (load.state === "error") return <Message error>Couldn't load the numbers. Try again in a moment.</Message>;
  return (
    <>
      <div className="periods" role="group" aria-label="Period">
        {PERIODS.map((p) => (
          <button key={p} type="button" aria-pressed={p === days} onClick={() => setDays(p)}>
            {p} days
          </button>
        ))}
        <button type="button" onClick={() => void authClient.signOut()}>
          Sign out
        </button>
      </div>
      <Stats stats={load.stats} />
    </>
  );
}

function Gate() {
  const { data, isPending } = authClient.useSession();
  const [codeNeeded, setCodeNeeded] = useState(false);
  if (isPending) return <p className="muted">Loading…</p>;
  if (data) return <Dashboard />;
  return codeNeeded ? <Code onDone={() => setCodeNeeded(false)} /> : <SignIn onCodeNeeded={() => setCodeNeeded(true)} />;
}

export default function Admin() {
  const { pathname } = useLocation();
  const desktop = useDesktop();
  if (pathname !== "/admin") return null;
  return (
    <main className="admin">
      <header>
        <h1>Admin</h1>
        <a
          href="/"
          onClick={(e) => {
            e.preventDefault();
            navigate("/");
          }}
        >
          Back to StoryStitch
        </a>
      </header>
      {desktop ? <Gate /> : <p>Open the admin dashboard on a desktop.</p>}
    </main>
  );
}
