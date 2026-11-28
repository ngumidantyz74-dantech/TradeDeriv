import { config } from './config.ts';
import { execute, pool } from './db.ts';

export async function sendTransactionalEmail(params: {
  to: string;
  toName?: string;
  template: 'welcome_verification' | 'connection_status' | 'password_reset' | 'system_alert' | 'daily_pnl_summary';
  subject: string;
  htmlContent: string;
}): Promise<{ delivered: boolean; status: 'sent' | 'queued_local' | 'failed' | 'error'; messageId?: string; errorMessage?: string }> {
  const { to, toName, template, subject, htmlContent } = params;

  if (!config.brevoApiKey) {
    if (pool) {
      await execute(
        'INSERT INTO email_logs (recipient_email, template, subject, status, provider_response) VALUES ($1, $2, $3, $4, $5)',
        [to, template, subject, 'queued_local', 'BREVO_API_KEY not configured; logged locally']
      );
    }
    return { delivered: false, status: 'queued_local', errorMessage: 'BREVO_API_KEY is not configured on the server' };
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
    let messageId: string | undefined;
    try {
      const parsed = JSON.parse(bodyText || '{}');
      if (parsed?.messageId) messageId = String(parsed.messageId);
    } catch {
      // ignore non-json response
    }

    if (pool) {
      await execute(
        'INSERT INTO email_logs (recipient_email, template, subject, status, provider_response) VALUES ($1, $2, $3, $4, $5)',
        [to, template, subject, resp.ok ? 'sent' : 'failed', bodyText.slice(0, 500)]
      );
    }

    return {
      delivered: resp.ok,
      status: resp.ok ? 'sent' : 'failed',
      messageId,
      errorMessage: resp.ok ? undefined : bodyText.slice(0, 200),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Brevo network error';
    if (pool) {
      await execute(
        'INSERT INTO email_logs (recipient_email, template, subject, status, provider_response) VALUES ($1, $2, $3, $4, $5)',
        [to, template, subject, 'error', msg]
      );
    }
    return { delivered: false, status: 'error', errorMessage: msg };
  }
}
