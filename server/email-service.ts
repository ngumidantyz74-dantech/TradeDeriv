import { config } from './config.ts';
import { execute, pool } from './db.ts';

export async function sendTransactionalEmail(params: {
  to: string;
  toName?: string;
  template: 'welcome_verification' | 'connection_status' | 'password_reset' | 'system_alert';
  subject: string;
  htmlContent: string;
}): Promise<{ delivered: boolean; messageId?: string }> {
  const { to, toName, template, subject, htmlContent } = params;

  if (!config.brevoApiKey) {
    if (pool) {
      await execute(
        'INSERT INTO email_logs (recipient_email, template, subject, status, provider_response) VALUES ($1, $2, $3, $4, $5)',
        [to, template, subject, 'queued_local', 'BREVO_API_KEY not configured; logged locally']
      );
    }
    return { delivered: false };
  }

  try {
    const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': config.brevoApiKey,
      },
      body: JSON.stringify({
        sender: { name: config.brevoSenderName, email: config.brevoSenderEmail },
        to: [{ email: to, name: toName || to }],
        subject,
        htmlContent,
      }),
    });

    const bodyText = await resp.text();
    if (pool) {
      await execute(
        'INSERT INTO email_logs (recipient_email, template, subject, status, provider_response) VALUES ($1, $2, $3, $4, $5)',
        [to, template, subject, resp.ok ? 'sent' : 'failed', bodyText.slice(0, 500)]
      );
    }

    return { delivered: resp.ok };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Brevo network error';
    if (pool) {
      await execute(
        'INSERT INTO email_logs (recipient_email, template, subject, status, provider_response) VALUES ($1, $2, $3, $4, $5)',
        [to, template, subject, 'error', msg]
      );
    }
    return { delivered: false };
  }
}
