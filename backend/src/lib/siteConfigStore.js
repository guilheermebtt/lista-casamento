/**
 * Configuração do site (hero, textos, meta lua de mel).
 * Arquivo: backend/data/site-config.json
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '../../data');
const CONFIG_FILE = join(DATA_DIR, 'site-config.json');

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const DEFAULT_CONFIG = {
  coupleNames: 'Maria Laura & Guilherme',
  /** 'names' | 'logo' */
  heroTitleMode: 'names',
  coupleLogoUrl: '',
  coupleLogoAlt: '',
  weddingDate: '',
  /** YYYY-MM-DD — base da contagem regressiva (opcional; texto da data continua em weddingDate) */
  weddingDateIso: '',
  welcomeText: '',
  bannerImage:
    'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&w=1600&q=80',
  metaLuaDeMel: 0,
  valorArrecadado: 0,
  metaLabel: 'Meta da lua de mel',
  /** URL da imagem do bloco “lua de mel” na lista (vazio = padrão do front) */
  luaDeMelImage: '',
};

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function normalize(raw) {
  const d = { ...DEFAULT_CONFIG };
  if (!raw || typeof raw !== 'object') return d;
  if (typeof raw.coupleNames === 'string') d.coupleNames = raw.coupleNames.trim();
  d.heroTitleMode = raw.heroTitleMode === 'logo' ? 'logo' : 'names';
  if (typeof raw.coupleLogoUrl === 'string') d.coupleLogoUrl = raw.coupleLogoUrl.trim();
  if (typeof raw.coupleLogoAlt === 'string') d.coupleLogoAlt = raw.coupleLogoAlt.trim();
  if (typeof raw.weddingDate === 'string') d.weddingDate = raw.weddingDate.trim();
  if (typeof raw.weddingDateIso === 'string') {
    const iso = raw.weddingDateIso.trim();
    d.weddingDateIso = ISO_DATE_RE.test(iso) ? iso : '';
  }
  if (typeof raw.welcomeText === 'string') d.welcomeText = raw.welcomeText.trim();
  if (typeof raw.bannerImage === 'string') d.bannerImage = raw.bannerImage.trim();
  if (typeof raw.metaLabel === 'string') d.metaLabel = raw.metaLabel.trim() || DEFAULT_CONFIG.metaLabel;
  const meta = Number(raw.metaLuaDeMel);
  d.metaLuaDeMel = Number.isFinite(meta) && meta >= 0 ? meta : 0;
  const val = Number(raw.valorArrecadado);
  d.valorArrecadado = Number.isFinite(val) && val >= 0 ? val : 0;
  if (typeof raw.luaDeMelImage === 'string') d.luaDeMelImage = raw.luaDeMelImage.trim();
  return d;
}

export function readSiteConfig() {
  ensureDataDir();
  if (!existsSync(CONFIG_FILE)) {
    writeFileSync(CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf8');
    return { ...DEFAULT_CONFIG };
  }
  try {
    const raw = JSON.parse(readFileSync(CONFIG_FILE, 'utf8'));
    return normalize(raw);
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

/**
 * @returns {string|null}
 */
export function validateSiteConfigPayload(body) {
  if (!body || typeof body !== 'object') return 'Envie um objeto JSON.';
  const meta = Number(body.metaLuaDeMel);
  if (!Number.isFinite(meta) || meta < 0) return 'Meta da lua de mel deve ser um número ≥ 0.';
  const val = Number(body.valorArrecadado);
  if (body.valorArrecadado != null && body.valorArrecadado !== '' && (!Number.isFinite(val) || val < 0)) {
    return 'Valor arrecadado (fallback) deve ser ≥ 0.';
  }
  if (body.weddingDateIso != null && body.weddingDateIso !== '') {
    const s = String(body.weddingDateIso).trim();
    if (!ISO_DATE_RE.test(s)) return 'Data do casamento (ISO) deve estar no formato AAAA-MM-DD.';
    const [y, m, d] = s.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) {
      return 'Data do casamento (ISO) inválida.';
    }
  }
  if (body.heroTitleMode === 'logo') {
    const u = String(body.coupleLogoUrl || '').trim();
    if (!u) return 'No modo logomarca, informe a URL da imagem (https://…).';
    if (!/^https:\/\//i.test(u) && !/^http:\/\//i.test(u)) {
      return 'URL da logomarca deve começar com http:// ou https://';
    }
  }
  const luaImg = String(body.luaDeMelImage ?? '').trim();
  if (luaImg && !/^https?:\/\//i.test(luaImg)) {
    return 'Imagem da lua de mel: URL deve começar com http:// ou https://';
  }
  return null;
}

export function writeSiteConfigFromPayload(body) {
  const err = validateSiteConfigPayload(body);
  if (err) throw new Error(err);
  const next = normalize(body);
  ensureDataDir();
  writeFileSync(CONFIG_FILE, JSON.stringify(next, null, 2), 'utf8');
  return next;
}
