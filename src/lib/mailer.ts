import nodemailer from "nodemailer";

// Почта через SMTP из env (SMTP_HOST/PORT/USER/PASS/FROM). Пока ящик на
// домене не настроен — isMailerConfigured() = false, и флоу, которым
// нужна почта (сброс пароля), честно сообщают о недоступности.

export function isMailerConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM);
}

// Дедлайны SMTP-сессии: по умолчанию у nodemailer они минутные-двух-
// минутные, и недоступный сервер держал бы вызвавший код всё это время.
const SMTP_TIMEOUT_MS = 10000;

export async function sendMail(to: string, subject: string, text: string): Promise<void> {
  if (!isMailerConfigured()) throw new Error("SMTP не настроен");
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: Number(process.env.SMTP_PORT ?? 587) === 465,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
    connectionTimeout: SMTP_TIMEOUT_MS,
    greetingTimeout: SMTP_TIMEOUT_MS,
    socketTimeout: SMTP_TIMEOUT_MS,
  });
  await transport.sendMail({ from: process.env.SMTP_FROM, to, subject, text });
}
