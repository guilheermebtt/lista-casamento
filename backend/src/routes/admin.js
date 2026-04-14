/**
 * Painel admin: registro completo + edição de presentes (Bearer ADMIN_SECRET)
 */
import { Router } from 'express';
import { readRegistry } from '../lib/registryStore.js';
import { readGifts, writeGiftsFromPayload } from '../lib/giftsStore.js';
import { readSiteConfig, writeSiteConfigFromPayload } from '../lib/siteConfigStore.js';

export const adminRouter = Router();

function requireAdmin(req, res, next) {
  const secret = process.env.ADMIN_SECRET?.trim();
  if (!secret) {
    return res.status(503).json({
      error:
        'Painel desabilitado: defina ADMIN_SECRET no .env do backend e reinicie a API.',
    });
  }
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (token !== secret) {
    return res.status(401).json({ error: 'Não autorizado' });
  }
  next();
}

adminRouter.get('/admin/check', requireAdmin, (_req, res) => {
  res.json({ ok: true });
});

adminRouter.get('/admin/registry', requireAdmin, (_req, res) => {
  try {
    return res.json(readRegistry());
  } catch (e) {
    console.error('admin registry', e);
    return res.status(500).json({ error: 'Falha ao ler registro' });
  }
});

adminRouter.get('/admin/gifts', requireAdmin, (_req, res) => {
  try {
    return res.json(readGifts());
  } catch (e) {
    console.error('admin gifts get', e);
    return res.status(500).json({ error: 'Falha ao ler presentes' });
  }
});

adminRouter.put('/admin/gifts', requireAdmin, (req, res) => {
  try {
    const gifts = writeGiftsFromPayload(req.body);
    return res.json({ ok: true, gifts });
  } catch (e) {
    const msg = e?.message || 'Falha ao gravar presentes';
    return res.status(400).json({ error: msg });
  }
});

adminRouter.get('/admin/config', requireAdmin, (_req, res) => {
  try {
    return res.json(readSiteConfig());
  } catch (e) {
    console.error('admin config get', e);
    return res.status(500).json({ error: 'Falha ao ler configuração' });
  }
});

adminRouter.put('/admin/config', requireAdmin, (req, res) => {
  try {
    const config = writeSiteConfigFromPayload(req.body);
    return res.json({ ok: true, config });
  } catch (e) {
    const msg = e?.message || 'Falha ao gravar configuração';
    return res.status(400).json({ error: msg });
  }
});
