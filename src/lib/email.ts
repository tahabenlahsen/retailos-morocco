/**
 * Email transport. Uses SMTP via nodemailer when configured; otherwise logs to the
 * console in development and returns `false` so callers can degrade gracefully.
 *
 * We never claim an email was sent unless the transport is configured.
 */
import nodemailer from "nodemailer"

interface Mail {
  to: string
  subject: string
  text: string
  html?: string
}

export function isEmailConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_FROM)
}

let transporter: nodemailer.Transporter | null = null

function getTransporter() {
  if (transporter) return transporter
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
  })
  return transporter
}

export async function sendEmail(mail: Mail): Promise<boolean> {
  if (!isEmailConfigured()) {
    if (process.env.NODE_ENV !== "production") {
      console.info(`[email:dev] To: ${mail.to}\nSubject: ${mail.subject}\n${mail.text}`)
    }
    return false
  }
  await getTransporter().sendMail({ from: process.env.SMTP_FROM, ...mail })
  return true
}
