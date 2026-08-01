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
  const normalizeSearchTerm = (value: unknown) => String(value ?? '').trim();
  const dedupeById = <T extends { id: string }>(rows: T[]): T[] =>
    Array.from(new Map(rows.map(row => [row.id, row])).values());
  const getSearchVariants = (term: string): string[] => {
    const trimmed = normalizeSearchTerm(term);
    if (!trimmed) return [];
    const titleCase = trimmed.replace(/\b\w/g, char => char.toUpperCase());
    return Array.from(new Set([
      trimmed,
      trimmed.toLowerCase(),
      trimmed.toUpperCase(),
      titleCase,
    ]));
  };
  const authenticateRequest = async (req: any, res: any): Promise<{ uid: string; tenantId: string } | null> => {
    const authHeader = String(req.headers.authorization || '');
    if (!authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Authentication required.' });
      return null;
    }

    let uid = '';
    try {
      uid = (await getAuth().verifyIdToken(authHeader.slice(7))).uid;
    } catch {
      res.status(401).json({ error: 'Invalid or expired session.' });
      return null;
    }

    const userSnap = await adminDb.doc(`users/${uid}`).get();
    if (!userSnap.exists || userSnap.data()?.status !== 'active' || !userSnap.data()?.tenantId) {
      res.status(403).json({ error: 'User access is not active for this tenant.' });
      return null;
    }

    return {
      uid,
      tenantId: String(userSnap.data()?.tenantId),
    };
  };

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
    const session = await authenticateRequest(req, res);
    if (!session) return;
    const { uid, tenantId } = session;

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
      const invoiceSnap = await adminDb.doc(`invoices/${invoiceId}`).get();
      if (!invoiceSnap.exists || invoiceSnap.data()?.tenantId !== tenantId) {
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

  app.get('/api/global-search', async (req: any, res: any) => {
    const session = await authenticateRequest(req, res);
    if (!session) return;
    const { tenantId } = session;
    const searchTerm = normalizeSearchTerm(req.query.q);
    const numericOrCodeQuery = /^[A-Za-z0-9\-_/]+$/.test(searchTerm);

    if (searchTerm.length < 2) {
      return res.status(400).json({ error: 'Search term must contain at least 2 characters.' });
    }

    const prefixSearch = async <T extends { id: string }>(
      collectionName: string,
      fields: string[],
      variants: string[],
      pageSize: number,
      mapper: (row: Record<string, any>) => T | null
    ) => {
      const snapshots = await Promise.all(
        fields.flatMap(field =>
          variants.map(variant =>
            adminDb
              .collection(collectionName)
              .where('tenantId', '==', tenantId)
              .orderBy(field)
              .startAt(variant)
              .endAt(`${variant}\uf8ff`)
              .limit(pageSize)
              .get()
          )
        )
      );

      const rows = snapshots.flatMap(snapshot => snapshot.docs.map(doc => mapper({
        id: doc.id,
        ...doc.data(),
      })));

      return dedupeById(rows.filter((row): row is T => Boolean(row))).slice(0, pageSize);
    };

    try {
      const productFields = numericOrCodeQuery ? ['barcode', 'sku'] : ['name', 'sku', 'barcode'];
      const invoiceFields = numericOrCodeQuery ? ['invoiceNumber'] : ['invoiceNumber'];
      const customerFields = numericOrCodeQuery ? ['phone'] : ['name', 'phone'];
      const variants = getSearchVariants(searchTerm);

      const [products, invoices, customers] = await Promise.all([
        prefixSearch(
          'products',
          productFields,
          variants,
          5,
          row => row.recordStatus === 'inactive' ? null : {
            id: String(row.id),
            name: String(row.name || ''),
            sku: String(row.sku || ''),
            barcode: String(row.barcode || ''),
            brand: String(row.brand || ''),
            category: String(row.category || ''),
            stockQuantity: Number(row.stockQuantity) || 0,
            minimumStock: Number(row.minimumStock) || 0,
          }
        ),
        prefixSearch(
          'invoices',
          invoiceFields,
          variants,
          5,
          row => ({
            id: String(row.id),
            invoiceNumber: String(row.invoiceNumber || ''),
            customerName: String(row.customerName || ''),
            paymentStatus: String(row.paymentStatus || 'due'),
            grandTotal: Number(row.grandTotal) || 0,
          })
        ),
        prefixSearch(
          'customers',
          customerFields,
          variants,
          5,
          row => row.recordStatus === 'inactive' ? null : {
            id: String(row.id),
            name: String(row.name || ''),
            phone: String(row.phone || ''),
            email: String(row.email || ''),
            totalPurchases: Number(row.totalPurchases) || 0,
          }
        ),
      ]);

      return res.json({ products, invoices, customers });
    } catch (error) {
      console.error('[Global Search] Failed to search tenant records:', error);
      return res.status(500).json({ error: 'Global search could not be completed.' });
    }
  });

  app.get('/api/products/search', async (req: any, res: any) => {
    const session = await authenticateRequest(req, res);
    if (!session) return;
    const { tenantId } = session;
    const searchTerm = normalizeSearchTerm(req.query.q);
    const pageSize = Math.min(50, Math.max(5, Number(req.query.pageSize) || 10));
    const cursorId = normalizeSearchTerm(req.query.cursorId);
    const requestedMode = normalizeSearchTerm(req.query.mode).toLowerCase();
    const mode = ['name', 'sku', 'barcode'].includes(requestedMode)
      ? requestedMode
      : (/^\d+$/.test(searchTerm) ? 'barcode' : /^[A-Za-z0-9\-_/.]+$/.test(searchTerm) ? 'sku' : 'name');

    if (searchTerm.length < 2) {
      return res.status(400).json({ error: 'Search term must contain at least 2 characters.' });
    }

    try {
      let productQuery = adminDb
        .collection('products')
        .where('tenantId', '==', tenantId)
        .orderBy(mode)
        .startAt(searchTerm)
        .endAt(`${searchTerm}\uf8ff`)
        .limit(pageSize);

      if (cursorId) {
        const cursorSnap = await adminDb.doc(`products/${cursorId}`).get();
        if (cursorSnap.exists && cursorSnap.data()?.tenantId === tenantId) {
          productQuery = adminDb
            .collection('products')
            .where('tenantId', '==', tenantId)
            .orderBy(mode)
            .startAfter(cursorSnap)
            .endAt(`${searchTerm}\uf8ff`)
            .limit(pageSize);
        }
      }

      const snapshot = await productQuery.get();
      const products = snapshot.docs
        .map(doc => ({
          id: doc.id,
          ...doc.data(),
        }))
        .filter(row => (row as Record<string, any>).recordStatus !== 'inactive');
      const nextCursor = snapshot.docs.length === pageSize
        ? snapshot.docs[snapshot.docs.length - 1]?.id || null
        : null;

      return res.json({
        products,
        nextCursor,
        hasMore: snapshot.docs.length === pageSize,
      });
    } catch (error) {
      console.error('[Products Search] Failed to search tenant products:', error);
      return res.status(500).json({ error: 'Product search could not be completed.' });
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
