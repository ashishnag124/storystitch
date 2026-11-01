import { Resend } from "resend";

export interface Email {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface Mailer {
  send(email: Email): Promise<void>;
}

/** Sends through Resend (staging and production). */
export function resendMailer(apiKey: string, from: string): Mailer {
  const resend = new Resend(apiKey);
  return {
    async send(email) {
      const { error } = await resend.emails.send({ from, ...email });
      if (error) throw new Error(`Resend: ${error.message}`);
    },
  };
}

/** Prints emails instead of sending them (local development). */
export function consoleMailer(): Mailer {
  return {
    async send({ to, subject, text }) {
      console.log(`\n✉️  To: ${to}\nSubject: ${subject}\n\n${text}\n`);
    },
  };
}

/** Keeps emails in memory so tests can read them (local and CI only; see ENABLE_TEST_ROUTES). */
export function memoryMailer(): Mailer & { sent: Email[] } {
  const sent: Email[] = [];
  return { sent, send: async (email) => void sent.push(email) };
}

const escape = (s: string) => s.replace(/[&<>"]/g, (c) => `&${{ "&": "amp", "<": "lt", ">": "gt", '"': "quot" }[c]};`);

/** A short email with one call-to-action link. */
export function linkEmail(to: string, subject: string, intro: string, action: string, url: string): Email {
  const text = `${intro}\n\n${action}: ${url}\n\nIf you didn't ask for this, you can ignore this email.\n\nStoryStitch`;
  const html = `<div style="font-family:system-ui,sans-serif;font-size:16px;line-height:1.5;color:#1c1917;max-width:480px">
<p>${escape(intro)}</p>
<p><a href="${escape(url)}" style="display:inline-block;padding:12px 20px;border-radius:999px;background:#2563eb;color:#fff;text-decoration:none;font-weight:600">${escape(action)}</a></p>
<p style="color:#57534e;font-size:14px">If you didn't ask for this, you can ignore this email.</p>
<p style="color:#57534e;font-size:14px">StoryStitch</p></div>`;
  return { to, subject, text, html };
}
