import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../config/env.js';
import { logger } from './logger.js';

/**
 * With no SMTP server configured, emails are logged instead of sent, so local development
 * needs no setup. To see real emails locally, run Mailpit and set SMTP_HOST=localhost, SMTP_PORT=1025.
 */
function createTransport(): Transporter {
  if (!env.SMTP_HOST) return nodemailer.createTransport({ jsonTransport: true });
  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
  });
}

let transport = createTransport();

/** For tests. */
export function setMailTransport(next: Transporter) {
  transport = next;
}

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function notificationEmailHtml(input: {
  title: string;
  body: string;
  link?: string | null;
}) {
  const button = input.link
    ? `<p style="margin:24px 0 0"><a href="${escapeHtml(`${env.WEB_ORIGIN}${input.link}`)}" style="background:#0593C6;color:#FCFFFF;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">Open Shikshya</a></p>`
    : '';
  return `<!doctype html>
<html><body style="margin:0;background:#E7F5FA;font-family:Inter,Arial,sans-serif;color:#0B2B3A">
  <div style="max-width:520px;margin:0 auto;padding:24px">
    <div style="background:#FCFFFF;border:1px solid #D5E6ED;border-radius:12px;overflow:hidden">
      <div style="background:#0593C6;color:#FCFFFF;padding:14px 24px;font-weight:700;font-size:18px">Shikshya</div>
      <div style="padding:24px">
        <h1 style="margin:0 0 8px;font-size:18px">${escapeHtml(input.title)}</h1>
        <p style="margin:0;line-height:1.5">${escapeHtml(input.body)}</p>
        ${button}
      </div>
    </div>
  </div>
</body></html>`;
}

/** Never throws: a failed email must not undo the payment or result that triggered it. */
export async function sendEmail(message: { to: string; subject: string; html: string }) {
  try {
    await transport.sendMail({ from: env.MAIL_FROM, ...message });
    if (!env.SMTP_HOST && env.NODE_ENV === 'development') {
      logger.info({ to: message.to, subject: message.subject }, 'Email not sent: no SMTP_HOST');
    }
  } catch (error) {
    logger.error({ err: error, to: message.to }, 'Could not send email');
  }
}
