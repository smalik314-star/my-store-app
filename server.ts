import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

// Load environment variables
dotenv.config();

async function startServer() {
  if (!getApps().length) initializeApp({ credential: applicationDefault() });
  const adminDb = getFirestore();
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;
  const emailAttempts = new Map<string, { count: number; resetAt: number }>();

  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    const allowedOrigin = process.env.ALLOWED_ORIGIN;
    if (allowedOrigin && req.headers.origin === allowedOrigin) {
      res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
      res.setHeader('Vary', 'Origin');
    }
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
      return res.sendStatus(204);
    }
    next();
  });

  // Set higher request body limit to accommodate PDF base64 payloads
  app.use(express.json({ limit: '15mb' }));
  app.use(express.urlencoded({ limit: '15mb', extended: true }));

  // API Health Check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // API: Send Email with PDF attachment
  app.post('/api/send-email', async (req: any, res: any) => {
    const authHeader = String(req.headers.authorization || '');
    if (!authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'Authentication required.' });
    let uid = '';
    try { uid = (await getAuth().verifyIdToken(authHeader.slice(7))).uid; }
    catch { return res.status(401).json({ error: 'Invalid or expired session.' }); }

    const rate = emailAttempts.get(uid);
    const now = Date.now();
    if (rate && rate.resetAt > now && rate.count >= 10) return res.status(429).json({ error: 'Email limit reached. Try again later.' });
    emailAttempts.set(uid, rate && rate.resetAt > now ? { ...rate, count: rate.count + 1 } : { count: 1, resetAt: now + 60 * 60 * 1000 });

    const { to, subject, body, pdfBase64, filename, invoiceId } = req.body;

    if (!to || !subject || !body || !invoiceId || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(to))) {
      return res.status(400).json({ error: 'Missing required email fields (to, subject, body)' });
    }
    if (String(subject).length > 200 || String(body).length > 10000 || String(pdfBase64 || '').length > 10_000_000) {
      return res.status(413).json({ error: 'Email content is too large.' });
    }
    if (pdfBase64 && !String(pdfBase64).startsWith('JVBERi0')) {
      return res.status(400).json({ error: 'Attachment must be a valid PDF.' });
    }

    try {
      const [userSnap, invoiceSnap] = await Promise.all([
        adminDb.doc(`users/${uid}`).get(), adminDb.doc(`invoices/${invoiceId}`).get()
      ]);
      if (!userSnap.exists || !invoiceSnap.exists || userSnap.data()?.status !== 'active' ||
          userSnap.data()?.tenantId !== invoiceSnap.data()?.tenantId) {
        return res.status(403).json({ error: 'Invoice access denied.' });
      }
      
      const smtpHost = process.env.SMTP_HOST;
      const smtpPort = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT) : 587;
      const smtpUser = process.env.SMTP_USER;
      const smtpPass = process.env.SMTP_PASS;
      const smtpFrom = process.env.SMTP_FROM || 'no-reply@pharmaflow.com';

      let transporter;
      if (smtpHost && smtpUser && smtpPass) {
        console.log(`[Email Backend] Using SMTP server: ${smtpHost}:${smtpPort}`);
        transporter = nodemailer.createTransport({
          host: smtpHost,
          port: smtpPort,
          secure: smtpPort === 465,
          auth: {
            user: smtpUser,
            pass: smtpPass,
          },
        });
      } else {
        if (process.env.NODE_ENV === 'production') return res.status(503).json({ error: 'Email service is not configured.' });
        const testAccount = await nodemailer.createTestAccount();
        transporter = nodemailer.createTransport({
          host: 'smtp.ethereal.email',
          port: 587,
          secure: false,
          auth: {
            user: testAccount.user,
            pass: testAccount.pass,
          },
        });
      }

      const attachments = [];
      if (pdfBase64) {
        console.log(`[Email Backend] Attaching PDF file: ${filename || 'invoice.pdf'}`);
        attachments.push({
          filename: String(filename || 'invoice.pdf').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120),
          content: Buffer.from(pdfBase64, 'base64'),
          contentType: 'application/pdf',
        });
      }

      const mailOptions = {
        from: smtpHost ? smtpFrom : '"PharmaFlow Billing" <no-reply@pharmaflow.com>',
        to,
        subject,
        text: body,
        attachments,
      };

      const info = await transporter.sendMail(mailOptions);
      const previewUrl = nodemailer.getTestMessageUrl(info);
      if (previewUrl) {
        console.log('[Email Backend] Test Email Preview URL:', previewUrl);
        return res.json({ 
          success: true, 
          message: 'Email sent via fallback Ethereal server successfully.', 
          previewUrl,
          isLocalFallback: true
        });
      }

      return res.json({ success: true, message: 'Email sent successfully.' });
    } catch (err: any) {
      console.error('[Email Backend] Failed to send email:', err);
      return res.status(500).json({ error: 'Email could not be sent.' });
    }
  });

  // Vite integration
  if (process.env.NODE_ENV !== 'production') {
    console.log('[Server] Mounting Vite middleware in development mode...');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    console.log('[Server] Serving production static assets...');
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] Running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[Server] Fatal crash during boot:', err);
});
