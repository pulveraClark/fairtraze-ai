import { isEmailEnabled } from "./emailConfig.js";
import { sendMail } from "./mail.js";

export async function sendPasswordResetEmail(to: string, name: string, resetLink: string): Promise<void> {
  if (!isEmailEnabled()) return;
  const text = `Hi ${name},

We received a request to reset the password for your FAIR TRAZE AI account (${to}).

Reset your password:
${resetLink}

This link expires in 30 minutes. If you didn't request this, you can safely ignore this email — your password will not be changed.

— FAIR TRAZE AI`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; color: #1e293b;">
      <h2 style="font-size: 18px; font-weight: 700; margin-bottom: 16px;">Reset your password</h2>
      <p style="font-size: 14px; line-height: 1.6; margin-bottom: 20px;">
        Hi ${name},<br /><br />
        We received a request to reset the password for your FAIR TRAZE AI account (${to}).
      </p>
      <p style="margin-bottom: 24px;">
        <a href="${resetLink}" style="display: inline-block; background-color: #4f46e5; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 600; padding: 10px 20px; border-radius: 8px;">
          Reset password
        </a>
      </p>
      <p style="font-size: 12px; line-height: 1.6; color: #64748b;">
        This link expires in 30 minutes. If you didn't request this, you can safely ignore this email — your password will not be changed.
      </p>
      <p style="font-size: 12px; color: #94a3b8; margin-top: 24px;">— FAIR TRAZE AI</p>
    </div>
  `;

  await sendMail({
    to,
    toName: name,
    subject: "Reset your FAIR TRAZE AI password",
    text,
    html,
  });
}

/** Resolves true when the message was handed to the provider, false when mail is off or not configured. */
export async function sendVerificationEmail(to: string, name: string, verifyLink: string): Promise<boolean> {
  if (!isEmailEnabled()) return false;
  const text = `Hi ${name},

Welcome to FAIR TRAZE AI! Please verify your email address (${to}) to unlock full access.

Verify your email:
${verifyLink}

This link expires in 24 hours. If you didn't create this account, you can safely ignore this email.

— FAIR TRAZE AI`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; color: #1e293b;">
      <h2 style="font-size: 18px; font-weight: 700; margin-bottom: 16px;">Verify your email</h2>
      <p style="font-size: 14px; line-height: 1.6; margin-bottom: 20px;">
        Hi ${name},<br /><br />
        Welcome to FAIR TRAZE AI! Please verify your email address (${to}) to unlock full access.
      </p>
      <p style="margin-bottom: 24px;">
        <a href="${verifyLink}" style="display: inline-block; background-color: #4f46e5; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 600; padding: 10px 20px; border-radius: 8px;">
          Verify email
        </a>
      </p>
      <p style="font-size: 12px; line-height: 1.6; color: #64748b;">
        This link expires in 24 hours. If you didn't create this account, you can safely ignore this email.
      </p>
      <p style="font-size: 12px; color: #94a3b8; margin-top: 24px;">— FAIR TRAZE AI</p>
    </div>
  `;

  return sendMail({
    to,
    toName: name,
    subject: "Verify your FAIR TRAZE AI email",
    text,
    html,
  });
}
