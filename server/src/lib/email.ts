import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_ADDRESS = process.env.RESEND_FROM_EMAIL ?? "FairTraze AI <onboarding@resend.dev>";

export async function sendPasswordResetEmail(to: string, name: string, resetLink: string): Promise<void> {
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

  await resend.emails.send({
    from: FROM_ADDRESS,
    to,
    subject: "Reset your FAIR TRAZE AI password",
    text,
    html,
  });
}
