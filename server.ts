import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Set higher request body limit to accommodate PDF base64 payloads
  app.use(express.json({ limit: '15mb' }));
  app.use(express.urlencoded({ limit: '15mb', extended: true }));

  // API Health Check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // API: Send Email with PDF attachment
  app.post('/api/send-email', async (req: any, res: any) => {
    const { to, subject, body, pdfBase64, filename } = req.body;

    if (!to || !subject || !body) {
      return res.status(400).json({ error: 'Missing required email fields (to, subject, body)' });
    }

    try {
      console.log(`[Email Backend] Attempting to send email to ${to} with subject: "${subject}"`);
      
      const smtpHost = process.env.SMTP_HOST;
      const smtpPort = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT) : 587;
      const smtpUser = process.env.SMTP_USER;
      const smtpPass = process.env.SMTP_PASS;
      const smtpFrom = process.env.SMTP_FROM || 'no-reply@pharmaflow.com';

      let transporter;
      let isLocalFallback = false;
      
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
        console.log('[Email Backend] No SMTP credentials found. Initializing automated test/Ethereal mailer account...');
        const testAccount = await nodemailer.createTestAccount();
        console.log(`[Email Backend] Automated Ethereal test account created: ${testAccount.user}`);
        transporter = nodemailer.createTransport({
          host: 'smtp.ethereal.email',
          port: 587,
          secure: false,
          auth: {
            user: testAccount.user,
            pass: testAccount.pass,
          },
        });
        isLocalFallback = true;
      }

      const attachments = [];
      if (pdfBase64) {
        console.log(`[Email Backend] Attaching PDF file: ${filename || 'invoice.pdf'}`);
        attachments.push({
          filename: filename || 'invoice.pdf',
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
      console.log('[Email Backend] Email sent successfully! MessageID:', info.messageId);

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
      return res.status(500).json({ error: 'Failed to send email: ' + (err.message || String(err)) });
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
