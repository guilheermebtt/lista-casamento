/**
 * Catálogo público: presentes + configuração do site
 */
import { Router } from 'express';
import { readGifts } from '../lib/giftsStore.js';
import { LUA_DE_MEL_REF } from '../lib/registryStore.js';
import { readSiteConfig } from '../lib/siteConfigStore.js';

export const catalogRouter = Router();

catalogRouter.get('/config', (_req, res) => {
  try {
    return res.json(readSiteConfig());
  } catch (e) {
    console.error('config get error', e);
    return res.status(500).json({ error: 'Falha ao ler configuração' });
  }
});

catalogRouter.get('/gifts', (_req, res) => {
  try {
    const list = readGifts().filter((g) => g && g.id !== LUA_DE_MEL_REF);
    return res.json(list);
  } catch (e) {
    console.error('gifts get error', e);
    return res.status(500).json({ error: 'Falha ao ler presentes' });
  }
});
