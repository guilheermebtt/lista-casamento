import { useCallback, useEffect, useRef, useState } from 'react';
import './App.css';
import HomeHero from './components/HomeHero.jsx';
import GiftGrid from './components/GiftGrid.jsx';
import PaymentModal from './components/PaymentModal.jsx';
import Disclaimer from './components/Disclaimer.jsx';
import AdminPanel from './components/AdminPanel.jsx';
import {
  fetchConfigWithFallback,
  fetchGiftsWithFallback,
  fetchSiteConfigFromApi,
  getContributionsTotal,
  getRegistry,
} from './api.js';

const defaultConfig = {
  coupleNames: 'Maria Laura & Guilherme',
  /** 'names' | 'logo' — capa: texto ou imagem */
  heroTitleMode: 'names',
  coupleLogoUrl: '',
  coupleLogoAlt: '',
  weddingDate: '',
  weddingDateIso: '',
  welcomeText: '',
  bannerImage:
    'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&w=1600&q=80',
  metaLuaDeMel: 0,
  valorArrecadado: 0,
  metaLabel: 'Meta da lua de mel',
  luaDeMelImage: '',
};

export default function App() {
  const [adminOpen, setAdminOpen] = useState(() => window.location.hash === '#admin');
  const [view, setView] = useState('home');
  const [config, setConfig] = useState(defaultConfig);
  const [gifts, setGifts] = useState([]);
  const [selectedGift, setSelectedGift] = useState(null);
  const [loadError, setLoadError] = useState('');
  /** Aprovado no MP + pendências de lua de mel (para a barra não parecer “travada”) */
  const [luaDeMelApproved, setLuaDeMelApproved] = useState(null);
  const [luaDeMelPending, setLuaDeMelPending] = useState(0);
  const [soldGiftIds, setSoldGiftIds] = useState([]);

  useEffect(() => {
    const onHash = () => setAdminOpen(window.location.hash === '#admin');
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const refreshSiteConfigFromApi = useCallback(async () => {
    const c = await fetchSiteConfigFromApi();
    if (c) setConfig((prev) => ({ ...defaultConfig, ...c }));
  }, []);

  const refreshRegistry = useCallback(async () => {
    try {
      const r = await getRegistry();
      setLuaDeMelApproved(
        r.luaDeMelTotal !== undefined && r.luaDeMelTotal !== null ? Number(r.luaDeMelTotal) : 0
      );
      setLuaDeMelPending(Number(r.luaDeMelPendingTotal) || 0);
      setSoldGiftIds(Array.isArray(r.soldGiftIds) ? r.soldGiftIds : []);
    } catch {
      try {
        const t = await getContributionsTotal();
        setLuaDeMelApproved(Number(t) || 0);
        setLuaDeMelPending(0);
      } catch {
        /* mantém últimos valores */
      }
    }
  }, []);

  useEffect(() => {
    refreshRegistry();
  }, [refreshRegistry]);

  useEffect(() => {
    if (adminOpen) return undefined;
    const id = setInterval(() => {
      void (async () => {
        await refreshRegistry();
        await refreshSiteConfigFromApi();
      })();
    }, 25000);
    return () => clearInterval(id);
  }, [adminOpen, refreshRegistry, refreshSiteConfigFromApi]);

  const wasAdminRef = useRef(false);
  useEffect(() => {
    if (wasAdminRef.current && !adminOpen) {
      void (async () => {
        try {
          const [c, g] = await Promise.all([fetchConfigWithFallback(), fetchGiftsWithFallback()]);
          setConfig({ ...defaultConfig, ...c });
          setGifts(
            Array.isArray(g) ? g.filter((item) => item && item.id !== 'lua-de-mel') : []
          );
        } catch {
          /* ignore */
        }
        await refreshRegistry();
      })();
    }
    wasAdminRef.current = adminOpen;
  }, [adminOpen, refreshRegistry]);

  const onPaymentSuccess = useCallback(() => {
    refreshRegistry();
  }, [refreshRegistry]);

  const raisedDisplay =
    luaDeMelApproved !== null && luaDeMelApproved !== undefined
      ? luaDeMelApproved + luaDeMelPending
      : (config.valorArrecadado ?? 0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [c, g] = await Promise.all([fetchConfigWithFallback(), fetchGiftsWithFallback()]);
        if (!cancelled) {
          setConfig({ ...defaultConfig, ...c });
          setGifts(
            Array.isArray(g) ? g.filter((item) => item && item.id !== 'lua-de-mel') : []
          );
        }
      } catch {
        if (!cancelled) setLoadError('Não foi possível carregar configuração ou lista de presentes.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== 'visible' || adminOpen) return;
      void refreshSiteConfigFromApi();
      void refreshRegistry();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [adminOpen, refreshRegistry, refreshSiteConfigFromApi]);

  if (adminOpen) {
    return (
      <AdminPanel
        onExit={() => {
          window.location.hash = '';
        }}
      />
    );
  }

  return (
    <div className="app">
      {loadError && (
        <div className="banner-error" role="alert">
          {loadError}
        </div>
      )}

      {view === 'home' && (
        <HomeHero
          config={config}
          onViewGifts={() => {
            setView('gifts');
            window.scrollTo(0, 0);
          }}
        />
      )}

      {view === 'gifts' && (
        <GiftGrid
          gifts={gifts}
          config={config}
          raisedDisplay={raisedDisplay}
          soldGiftIds={soldGiftIds}
          onPresentear={(g) => setSelectedGift(g)}
          onBack={() => {
            setView('home');
            window.scrollTo(0, 0);
          }}
        />
      )}

      {selectedGift && (
        <PaymentModal
          key={selectedGift.id}
          gift={selectedGift}
          onClose={() => setSelectedGift(null)}
          onPaymentSuccess={onPaymentSuccess}
        />
      )}

      <footer className="site-footer">
        <Disclaimer />
        <p className="footer-note">
          <button
            type="button"
            className="footer-admin-link"
            onClick={() => {
              window.location.hash = 'admin';
            }}
          >
            Painel admin
          </button>
          {' · '}
          Feito com carinho para celebrar o amor 💙
        </p>
      </footer>
    </div>
  );
}
