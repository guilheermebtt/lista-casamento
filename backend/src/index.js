/**
 * API Express — PIX via Mercado Pago (lista de casamento simbólica)
 */
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { paymentRouter } from './routes/payment.js';
import { catalogRouter } from './routes/catalog.js';
import { adminRouter } from './routes/admin.js';

const app = express();
const PORT = Number(process.env.PORT) || 3001;

// Webhook precisa do body bruto em alguns casos; rota específica usa json
app.use(
  cors({
    origin: true,
    credentials: true,
  })
);
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'lista-casamento-api' });
});

app.use('/api', catalogRouter);
app.use('/api', adminRouter);
app.use('/api', paymentRouter);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({
    error: 'Erro interno',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

app.listen(PORT, () => {
  console.log(`API rodando em http://localhost:${PORT}`);
});
