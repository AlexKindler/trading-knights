// Resend email integration for Trading Knights (CONTRACT §6)
// Uses the 'resend' package directly with env config. If RESEND_API_KEY is
// unset we log a warning and return false — never throw/crash. Callers already
// tolerate a false return value.
import { Resend } from "resend";

function getFromEmail(): string {
  return process.env.EMAIL_FROM || "Trading Knights <onboarding@resend.dev>";
}

function getBaseUrl(): string {
  return (
    process.env.APP_BASE_URL ||
    process.env.PUBLIC_BASE_URL ||
    `http://localhost:${process.env.PORT || "5000"}`
  );
}

function getClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn(
      "[email] RESEND_API_KEY is not set — skipping email send. Set RESEND_API_KEY to enable outbound email.",
    );
    return null;
  }
  return new Resend(apiKey);
}

export async function sendVerificationEmail(
  toEmail: string,
  verificationToken: string,
): Promise<boolean> {
  const client = getClient();
  if (!client) return false;

  try {
    const verificationLink = `${getBaseUrl()}/verify-email?token=${verificationToken}`;

    await client.emails.send({
      from: getFromEmail(),
      to: toEmail,
      subject: "Verify your Trading Knights account",
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #7c3aed; margin: 0;">Trading Knights</h1>
            <p style="color: #666; margin-top: 5px;">Menlo School Edition</p>
          </div>

          <div style="background: #f8fafc; border-radius: 8px; padding: 30px; margin-bottom: 20px;">
            <h2 style="margin-top: 0;">Welcome to Trading Knights!</h2>
            <p>Thank you for signing up. Please verify your email address to activate your account and receive your starting balance of $1,000 in play money.</p>

            <div style="text-align: center; margin: 30px 0;">
              <a href="${verificationLink}" style="background: #7c3aed; color: white; padding: 12px 30px; border-radius: 6px; text-decoration: none; font-weight: 600; display: inline-block;">Verify Email Address</a>
            </div>

            <p style="font-size: 14px; color: #666;">If the button doesn't work, copy and paste this link into your browser:</p>
            <p style="font-size: 12px; word-break: break-all; color: #7c3aed;">${verificationLink}</p>
          </div>

          <div style="text-align: center; font-size: 12px; color: #999;">
            <p>This link expires in 24 hours.</p>
            <p style="margin-top: 20px;">
              <strong>Reminder:</strong> Trading Knights uses fake money only for educational purposes.<br>
              No real gambling, prizes, or cash-outs.
            </p>
          </div>
        </body>
        </html>
      `,
    });

    return true;
  } catch (error: any) {
    console.error("[email] Error sending verification email:", error?.message || error);
    return false;
  }
}

export async function sendPasswordResetEmail(
  toEmail: string,
  resetToken: string,
): Promise<boolean> {
  const client = getClient();
  if (!client) return false;

  try {
    const resetLink = `${getBaseUrl()}/reset-password?token=${resetToken}`;

    await client.emails.send({
      from: getFromEmail(),
      to: toEmail,
      subject: "Reset your Trading Knights password",
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #7c3aed;">Trading Knights</h1>
          <p>You requested a password reset. Click the link below to set a new password:</p>
          <p><a href="${resetLink}" style="background: #7c3aed; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; display: inline-block;">Reset Password</a></p>
          <p style="font-size: 12px; color: #666;">This link expires in 1 hour. If you didn't request this, you can ignore this email.</p>
        </body>
        </html>
      `,
    });

    return true;
  } catch (error: any) {
    console.error("[email] Error sending password reset email:", error?.message || error);
    return false;
  }
}
