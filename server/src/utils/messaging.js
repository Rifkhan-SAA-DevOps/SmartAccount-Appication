import nodemailer from 'nodemailer';
import { prisma } from '../lib/prisma.js';

function smtpConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function makeTransport() {
  if (!smtpConfigured()) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || 'false') === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
}

export function buildWhatsAppLink(phone, message) {
  const cleaned = String(phone || '').replace(/[^0-9]/g, '');
  const text = encodeURIComponent(message || '');
  if (!cleaned) return null;
  return `https://wa.me/${cleaned}?text=${text}`;
}

async function logCommunication({ tenantId, channel, recipient, subject, message, status, provider, providerRef, error, entityType, entityId, createdById, sentAt }) {
  return prisma.communicationLog.create({
    data: {
      tenantId,
      channel,
      recipient,
      subject: subject || null,
      message,
      status,
      provider: provider || null,
      providerRef: providerRef || null,
      error: error || null,
      entityType: entityType || null,
      entityId: entityId || null,
      createdById: createdById || null,
      sentAt: sentAt || null
    }
  });
}

export async function sendEmailMessage({ tenantId, to, subject, message, entityType, entityId, createdById }) {
  if (!to) throw new Error('Recipient email is required');
  const transport = makeTransport();
  if (!transport) {
    return logCommunication({
      tenantId,
      channel: 'EMAIL',
      recipient: to,
      subject,
      message,
      status: 'LOGGED',
      provider: 'SMTP_NOT_CONFIGURED',
      entityType,
      entityId,
      createdById
    });
  }

  try {
    const info = await transport.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject,
      text: message,
      html: `<div style="font-family:Arial,sans-serif;line-height:1.6;white-space:pre-line">${String(message).replace(/[<>&]/g, (m) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[m]))}</div>`
    });
    return logCommunication({
      tenantId,
      channel: 'EMAIL',
      recipient: to,
      subject,
      message,
      status: 'SENT',
      provider: 'SMTP',
      providerRef: info.messageId,
      entityType,
      entityId,
      createdById,
      sentAt: new Date()
    });
  } catch (error) {
    return logCommunication({
      tenantId,
      channel: 'EMAIL',
      recipient: to,
      subject,
      message,
      status: 'FAILED',
      provider: 'SMTP',
      error: error.message,
      entityType,
      entityId,
      createdById
    });
  }
}

export async function logWhatsAppMessage({ tenantId, to, message, entityType, entityId, createdById }) {
  if (!to) throw new Error('Recipient WhatsApp phone is required');
  const link = buildWhatsAppLink(to, message);
  const log = await logCommunication({
    tenantId,
    channel: 'WHATSAPP',
    recipient: to,
    message,
    status: 'LINK_READY',
    provider: 'WA_ME_LINK',
    providerRef: link,
    entityType,
    entityId,
    createdById
  });
  return { ...log, whatsappLink: link };
}
