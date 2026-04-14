/**
 * Lista de presentes editável pelo painel admin.
 * Arquivo: backend/data/gifts.json
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '../../data');
const GIFTS_FILE = join(DATA_DIR, 'gifts.json');

const DEFAULT_GIFTS = [
  {
    id: 'jantar',
    name: 'Jantar romântico',
    description: 'Uma noite especial para celebrar o sim com muito sabor.',
    amount: 100,
    image:
      'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&w=800&q=80',
  },
];

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

export function readGifts() {
  ensureDataDir();
  if (!existsSync(GIFTS_FILE)) {
    writeFileSync(GIFTS_FILE, JSON.stringify(DEFAULT_GIFTS, null, 2), 'utf8');
    return [...DEFAULT_GIFTS];
  }
  try {
    const raw = readFileSync(GIFTS_FILE, 'utf8');
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [...DEFAULT_GIFTS];
  } catch {
    return [...DEFAULT_GIFTS];
  }
}

/**
 * @param {unknown} body
 * @returns {string|null} erro ou null
 */
export function validateGiftsPayload(body) {
  if (!Array.isArray(body)) return 'Envie um array JSON de presentes.';
  const seen = new Set();
  for (let i = 0; i < body.length; i++) {
    const g = body[i];
    if (!g || typeof g !== 'object') return `Item ${i + 1}: objeto inválido.`;
    const id = typeof g.id === 'string' ? g.id.trim() : '';
    const name = typeof g.name === 'string' ? g.name.trim() : '';
    const amount = Number(g.amount);
    if (!id || id.length > 64) return `Item ${i + 1}: id obrigatório (texto curto).`;
    if (id === 'lua-de-mel') {
      return `Item ${i + 1}: o id "lua-de-mel" é reservado às doações à lua de mel e não pode constar na lista de presentes.`;
    }
    if (seen.has(id)) return `Id duplicado: ${id}`;
    seen.add(id);
    if (!name) return `Item ${i + 1}: nome obrigatório.`;
    if (!Number.isFinite(amount) || amount < 1) return `Item ${i + 1}: preço inválido (mín. 1).`;
    if (g.description != null && typeof g.description !== 'string')
      return `Item ${i + 1}: descrição deve ser texto.`;
    if (g.image != null && typeof g.image !== 'string')
      return `Item ${i + 1}: imagem deve ser URL (texto).`;
  }
  return null;
}

function normalizeGift(g) {
  return {
    id: String(g.id).trim(),
    name: String(g.name).trim(),
    description:
      g.description != null && String(g.description).trim()
        ? String(g.description).trim()
        : '',
    amount: Math.round(Number(g.amount) * 100) / 100,
    image: g.image != null ? String(g.image).trim() : '',
  };
}

export function writeGiftsFromPayload(body) {
  const err = validateGiftsPayload(body);
  if (err) throw new Error(err);
  const normalized = body.map(normalizeGift);
  ensureDataDir();
  writeFileSync(GIFTS_FILE, JSON.stringify(normalized, null, 2), 'utf8');
  return normalized;
}
