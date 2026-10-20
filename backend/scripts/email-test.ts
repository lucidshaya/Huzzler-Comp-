// Checks the SMTP login and sends one test email to the sending account itself.
//   npm run email:test
import nodemailer from "nodemailer";
import { env } from "../src/config/env.js";
import { emailLayout } from "../src/lib/notify.js";

if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) {
  console.log("SMTP_HOST / SMTP_USER / SMTP_PASS are not set in .env");
  process.exit(1);
}
const t = nodemailer.createTransport({ host: env.SMTP_HOST, port: env.SMTP_PORT, secure: env.SMTP_PORT === 465, auth: { user: env.SMTP_USER, pass: env.SMTP_PASS } });
try {
  await t.verify();
  console.log(`✓ SMTP login accepted for ${env.SMTP_USER}`);
  const info = await t.sendMail({
    from: env.EMAIL_FROM,
    to: env.SMTP_USER,
    subject: "Huzzler email is working ✅",
    html: emailLayout("Huzzler can send email", "<p>This test confirms the platform can send receipts, guardian approvals and support replies from this Gmail account.</p>"),
  });
  console.log(`✓ Test email sent to ${env.SMTP_USER} (${info.response.slice(0, 30)})`);
} catch (e) {
  console.log("✗ SMTP failed:", String(e).slice(0, 300));
  process.exit(1);
}
