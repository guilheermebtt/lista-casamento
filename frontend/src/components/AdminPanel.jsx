import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  adminCheck,
  adminGetConfig,
  adminGetGifts,
  adminGetRegistry,
  adminPutConfig,
  adminPutGifts,
  getAdminToken,
  setAdminToken,
} from '../api';
import { formatBRL } from '../format';

/** Soma dos valores em presentes já pagos (tabela Presentes pagos). */
function totalSoldListItems(registry) {
  const sg = registry?.soldGifts;
  if (!sg || typeof sg !== 'object') return 0;
  let s = 0;
  for (const row of Object.values(sg)) {
    const a = Number(row?.amount);
    if (Number.isFinite(a)) s += a;
  }
  return Math.round(s * 100) / 100;
}

/**
 * Soma dos valores das reservas ativas (checkout em andamento):
 * cada reserva aponta para um paymentId em pending com tipo gift.
 */
function totalReservedGifts(registry) {
  const gr = registry?.giftReservations;
  const pending = registry?.pendingByPaymentId;
  if (!gr || typeof gr !== 'object' || !pending || typeof pending !== 'object') return 0;
  let s = 0;
  for (const r of Object.values(gr)) {
    const pid = r?.paymentId != null ? String(r.paymentId) : '';
    if (!pid) continue;
    const row = pending[pid];
    if (row?.type === 'gift' && Number.isFinite(Number(row.amount))) {
      s += Number(row.amount);
    }
  }
  return Math.round(s * 100) / 100;
}

function mapConfigToForm(c) {
  return {
    coupleNames: String(c.coupleNames ?? ''),
    heroTitleMode: c.heroTitleMode === 'logo' ? 'logo' : 'names',
    coupleLogoUrl: String(c.coupleLogoUrl ?? ''),
    coupleLogoAlt: String(c.coupleLogoAlt ?? ''),
    weddingDate: String(c.weddingDate ?? ''),
    weddingDateIso: String(c.weddingDateIso ?? ''),
    welcomeText: String(c.welcomeText ?? ''),
    bannerImage: String(c.bannerImage ?? ''),
    metaLuaDeMel: String(c.metaLuaDeMel ?? 0),
    valorArrecadado: String(c.valorArrecadado ?? 0),
    metaLabel: String(c.metaLabel ?? 'Meta da lua de mel'),
    luaDeMelImage: String(c.luaDeMelImage ?? ''),
  };
}

export default function AdminPanel({ onExit }) {
  const [tab, setTab] = useState('registry');
  const [secretInput, setSecretInput] = useState('');
  const [authError, setAuthError] = useState('');
  const [authed, setAuthed] = useState(false);
  const [loading, setLoading] = useState(() => Boolean(getAdminToken()));

  const [registry, setRegistry] = useState(null);
  const [gifts, setGifts] = useState([]);
  const [giftsDirty, setGiftsDirty] = useState(false);
  const [siteForm, setSiteForm] = useState(null);
  const [siteDirty, setSiteDirty] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [configMsg, setConfigMsg] = useState('');
  const [loadErr, setLoadErr] = useState('');

  const tryAuth = useCallback(async () => {
    setAuthError('');
    const token = secretInput.trim() || getAdminToken();
    if (!token) {
      setAuthError('Informe a chave do painel (ADMIN_SECRET no .env do backend).');
      return;
    }
    setAdminToken(token);
    try {
      await adminCheck();
      setAuthed(true);
    } catch (e) {
      setAuthed(false);
      setAdminToken('');
      setAuthError(e.message || 'Chave inválida ou API indisponível.');
    }
  }, [secretInput]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!getAdminToken()) {
        setLoading(false);
        return;
      }
      try {
        await adminCheck();
        if (!cancelled) setAuthed(true);
      } catch {
        if (!cancelled) {
          setAuthed(false);
          setAdminToken('');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadData = useCallback(async () => {
    setLoadErr('');
    try {
      const [reg, gs, cfg] = await Promise.all([
        adminGetRegistry(),
        adminGetGifts(),
        adminGetConfig(),
      ]);
      setRegistry(reg);
      setGifts(Array.isArray(gs) ? gs : []);
      setGiftsDirty(false);
      setSiteForm(mapConfigToForm(cfg));
      setSiteDirty(false);
      setConfigMsg('');
    } catch (e) {
      setLoadErr(e.message || 'Falha ao carregar');
    }
  }, []);

  useEffect(() => {
    if (authed) loadData();
  }, [authed, loadData]);

  function logout() {
    setAdminToken('');
    setAuthed(false);
    setRegistry(null);
    setGifts([]);
    setSiteForm(null);
    onExit?.();
  }

  function updateSite(field, value) {
    setSiteForm((prev) => (prev ? { ...prev, [field]: value } : prev));
    setSiteDirty(true);
    setConfigMsg('');
  }

  async function saveSite() {
    if (!siteForm) return;
    setConfigMsg('');
    const brNum = (raw) => {
      const t = String(raw ?? '').trim();
      if (t === '') return 0;
      return Number(t.replace(/\./g, '').replace(',', '.'));
    };
    const metaVal = brNum(siteForm.metaLuaDeMel);
    const fallbackVal = brNum(siteForm.valorArrecadado);
    if (!Number.isFinite(metaVal) || metaVal < 0) {
      setConfigMsg('Meta da lua de mel inválida.');
      return;
    }
    if (!Number.isFinite(fallbackVal) || fallbackVal < 0) {
      setConfigMsg('Valor arrecadado (fallback) inválido.');
      return;
    }
    const payload = {
      coupleNames: siteForm.coupleNames.trim(),
      heroTitleMode: siteForm.heroTitleMode === 'logo' ? 'logo' : 'names',
      coupleLogoUrl: String(siteForm.coupleLogoUrl ?? '').trim(),
      coupleLogoAlt: String(siteForm.coupleLogoAlt ?? '').trim(),
      weddingDate: siteForm.weddingDate.trim(),
      weddingDateIso: String(siteForm.weddingDateIso ?? '').trim(),
      welcomeText: siteForm.welcomeText.trim(),
      bannerImage: siteForm.bannerImage.trim(),
      metaLuaDeMel: metaVal,
      valorArrecadado: fallbackVal,
      metaLabel: siteForm.metaLabel.trim() || 'Meta da lua de mel',
      luaDeMelImage: String(siteForm.luaDeMelImage ?? '').trim(),
    };
    try {
      const r = await adminPutConfig(payload);
      setSiteForm(mapConfigToForm(r.config || payload));
      setSiteDirty(false);
      setConfigMsg('Configuração salva. Atualize a página inicial para ver textos e meta.');
    } catch (e) {
      setConfigMsg(e.message || 'Erro ao salvar');
    }
  }

  function updateGift(i, field, value) {
    setGifts((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], [field]: value };
      return next;
    });
    setGiftsDirty(true);
    setSaveMsg('');
  }

  function addGift() {
    setGifts((prev) => [
      ...prev,
      { id: '', name: '', description: '', amount: '', image: '' },
    ]);
    setGiftsDirty(true);
    setSaveMsg('');
  }

  function removeGift(i) {
    setGifts((prev) => prev.filter((_, j) => j !== i));
    setGiftsDirty(true);
    setSaveMsg('');
  }

  const soldListTotal = useMemo(
    () => (registry ? totalSoldListItems(registry) : 0),
    [registry]
  );
  const reservedGiftsTotal = useMemo(
    () => (registry ? totalReservedGifts(registry) : 0),
    [registry]
  );

  async function saveGifts() {
    setSaveMsg('');
    const payload = gifts.map((g) => ({
      id: String(g.id || '').trim(),
      name: String(g.name || '').trim(),
      description: String(g.description || '').trim(),
      amount: Number(String(g.amount).replace(',', '.')),
      image: String(g.image || '').trim(),
    }));
    try {
      const r = await adminPutGifts(payload);
      setGifts(r.gifts || payload);
      setGiftsDirty(false);
      setSaveMsg('Salvo com sucesso. Atualize a página do site para ver as mudanças.');
    } catch (e) {
      setSaveMsg(e.message || 'Erro ao salvar');
    }
  }

  if (loading) {
    return (
      <div className="admin-wrap">
        <p className="admin-muted">Carregando…</p>
      </div>
    );
  }

  if (!authed) {
    return (
      <div className="admin-wrap">
        <div className="admin-card">
          <h1 className="admin-title">Painel administrativo</h1>
          <p className="admin-muted">
            Defina <code>ADMIN_SECRET</code> no <code>backend/.env</code> e use o mesmo valor aqui.
          </p>
          <label className="admin-label" htmlFor="admin-secret">
            Chave do painel
          </label>
          <input
            id="admin-secret"
            type="password"
            className="admin-input"
            autoComplete="off"
            value={secretInput}
            onChange={(e) => setSecretInput(e.target.value)}
            placeholder="Cole a chave secreta"
          />
          {authError && <p className="admin-error">{authError}</p>}
          <div className="admin-actions">
            <button type="button" className="btn btn-primary" onClick={tryAuth}>
              Entrar
            </button>
            <button type="button" className="btn btn-ghost" onClick={onExit}>
              Voltar ao site
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-wrap">
      <header className="admin-header">
        <h1 className="admin-title">Painel</h1>
        <div className="admin-header-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={loadData}>
            Atualizar dados
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={logout}>
            Sair
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onExit}>
            Voltar ao site
          </button>
        </div>
      </header>

      <nav className="admin-tabs" aria-label="Seções">
        <button
          type="button"
          className={`admin-tab ${tab === 'registry' ? 'admin-tab--active' : ''}`}
          onClick={() => setTab('registry')}
        >
          Registro de compras
        </button>
        <button
          type="button"
          className={`admin-tab ${tab === 'gifts' ? 'admin-tab--active' : ''}`}
          onClick={() => setTab('gifts')}
        >
          Presentes e preços
        </button>
        <button
          type="button"
          className={`admin-tab ${tab === 'site' ? 'admin-tab--active' : ''}`}
          onClick={() => setTab('site')}
        >
          Site e meta lua de mel
        </button>
      </nav>

      {loadErr && <p className="admin-error">{loadErr}</p>}

      {tab === 'registry' && registry && (
        <div className="admin-section">
          <div className="admin-kpi">
            <div className="admin-kpi-card">
              <span className="admin-kpi-label">Lua de mel (total)</span>
              <strong className="admin-kpi-value">{formatBRL(registry.luaDeMelTotal ?? 0)}</strong>
            </div>
            <div className="admin-kpi-card">
              <span className="admin-kpi-label">Lista de presentes (pagos)</span>
              <strong className="admin-kpi-value">{formatBRL(soldListTotal)}</strong>
            </div>
            <div className="admin-kpi-card">
              <span className="admin-kpi-label">Reservas ativas (valor)</span>
              <strong className="admin-kpi-value">{formatBRL(reservedGiftsTotal)}</strong>
            </div>
          </div>

          <h2 className="admin-h2">Presentes pagos</h2>
          {Object.keys(registry.soldGifts || {}).length === 0 ? (
            <p className="admin-muted">Nenhum presente concluído ainda.</p>
          ) : (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>ID presente</th>
                    <th>Comprador</th>
                    <th>E-mail</th>
                    <th>Valor</th>
                    <th>Forma de pagamento</th>
                    <th>Recado</th>
                    <th>Pagamento MP</th>
                    <th>Data</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(registry.soldGifts).map(([giftId, row]) => (
                    <tr key={giftId}>
                      <td>
                        <code>{giftId}</code>
                      </td>
                      <td>{row.buyerName}</td>
                      <td>{row.buyerEmail}</td>
                      <td>{formatBRL(row.amount)}</td>
                      <td>{row.paymentMethod || '—'}</td>
                      <td className="admin-table-recado">
                        {row.guestMessage ? row.guestMessage : '—'}
                      </td>
                      <td>
                        <code>{row.paymentId}</code>
                      </td>
                      <td>{row.paidAt ? new Date(row.paidAt).toLocaleString('pt-BR') : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h2 className="admin-h2">Pagamentos pendentes</h2>
          {Object.keys(registry.pendingByPaymentId || {}).length === 0 ? (
            <p className="admin-muted">Nenhum pendente.</p>
          ) : (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>ID MP</th>
                    <th>Tipo</th>
                    <th>Presente / detalhe</th>
                    <th>Nome</th>
                    <th>E-mail</th>
                    <th>Valor</th>
                    <th>Forma de pagamento</th>
                    <th>Recado</th>
                    <th>Criado</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(registry.pendingByPaymentId).map(([pid, row]) => (
                    <tr key={pid}>
                      <td>
                        <code>{pid}</code>
                      </td>
                      <td>{row.type}</td>
                      <td>
                        {row.type === 'gift' ? (
                          <code>{row.giftId}</code>
                        ) : (
                          'lua de mel'
                        )}
                      </td>
                      <td>{row.buyerName || '—'}</td>
                      <td>{row.buyerEmail}</td>
                      <td>{formatBRL(row.amount)}</td>
                      <td>{row.paymentMethod || '—'}</td>
                      <td className="admin-table-recado">{row.guestMessage ? row.guestMessage : '—'}</td>
                      <td>
                        {row.createdAt ? new Date(row.createdAt).toLocaleString('pt-BR') : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h2 className="admin-h2">Recados — lua de mel (aprovados)</h2>
          {Array.isArray(registry.luaDeMelNotes) && registry.luaDeMelNotes.length > 0 ? (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Valor</th>
                    <th>E-mail</th>
                    <th>Forma de pagamento</th>
                    <th>Recado</th>
                    <th>Pagamento MP</th>
                    <th>Data</th>
                  </tr>
                </thead>
                <tbody>
                  {[...registry.luaDeMelNotes]
                    .slice()
                    .reverse()
                    .map((row, i) => (
                      <tr key={`${row.paymentId}-${i}`}>
                        <td>{formatBRL(row.amount)}</td>
                        <td>{row.buyerEmail || '—'}</td>
                        <td>{row.paymentMethod || '—'}</td>
                        <td className="admin-table-recado">
                          {row.guestMessage ? row.guestMessage : '—'}
                        </td>
                        <td>
                          <code>{row.paymentId}</code>
                        </td>
                        <td>{row.paidAt ? new Date(row.paidAt).toLocaleString('pt-BR') : '—'}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="admin-muted">Nenhum recado registrado em contribuições de lua de mel aprovadas.</p>
          )}

          <h2 className="admin-h2">Reservas ativas (checkout em andamento)</h2>
          {Object.keys(registry.giftReservations || {}).length === 0 ? (
            <p className="admin-muted">Nenhuma reserva.</p>
          ) : (
            <ul className="admin-list">
              {Object.entries(registry.giftReservations).map(([gid, r]) => (
                <li key={gid}>
                  <code>{gid}</code> — pagamento <code>{r.paymentId}</code> —{' '}
                  {r.reservedAt ? new Date(r.reservedAt).toLocaleString('pt-BR') : ''}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === 'gifts' && (
        <div className="admin-section">
          <p className="admin-muted">
            Os ids devem ser únicos e estáveis (não altere ids de presentes já vendidos). A lista é a
            mesma exibida no site via <code>/api/gifts</code>.
          </p>
          <div className="admin-gift-actions">
            <button type="button" className="btn btn-secondary" onClick={addGift}>
              + Adicionar presente
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={saveGifts}
              disabled={!giftsDirty}
            >
              Salvar alterações
            </button>
          </div>
          {saveMsg && (
            <p className={saveMsg.includes('sucesso') ? 'admin-success' : 'admin-error'}>{saveMsg}</p>
          )}

          <div className="admin-table-wrap admin-table-wrap--wide">
            <table className="admin-table admin-table--edit">
              <thead>
                <tr>
                  <th>Id (slug)</th>
                  <th>Nome</th>
                  <th>Descrição</th>
                  <th>Preço (R$)</th>
                  <th>URL da imagem</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {gifts.map((g, i) => (
                  <tr key={`${g.id || 'new'}-${i}`}>
                    <td>
                      <input
                        className="admin-input admin-input--table"
                        value={g.id}
                        onChange={(e) => updateGift(i, 'id', e.target.value)}
                        placeholder="ex.: jantar"
                      />
                    </td>
                    <td>
                      <input
                        className="admin-input admin-input--table"
                        value={g.name}
                        onChange={(e) => updateGift(i, 'name', e.target.value)}
                      />
                    </td>
                    <td>
                      <textarea
                        className="admin-textarea"
                        rows={2}
                        value={g.description || ''}
                        onChange={(e) => updateGift(i, 'description', e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        className="admin-input admin-input--table"
                        type="text"
                        inputMode="decimal"
                        value={g.amount}
                        onChange={(e) => updateGift(i, 'amount', e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        className="admin-input admin-input--table"
                        value={g.image || ''}
                        onChange={(e) => updateGift(i, 'image', e.target.value)}
                        placeholder="https://..."
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => removeGift(i)}
                      >
                        Remover
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'site' && siteForm && (
        <div className="admin-section">
          <p className="admin-muted">
            Define textos da capa, imagem do banner e a <strong>meta em reais</strong> da lua de mel. O valor
            arrecadado exibido na barra vem do Mercado Pago quando a API está no ar; o campo
            &quot;Fallback&quot; só aparece se o site não conseguir buscar o total.
          </p>
          <div className="admin-site-grid">
            <div className="admin-field admin-field--full">
              <span className="admin-label">Título na capa (hero)</span>
              <div className="admin-radio-row" role="group" aria-label="Tipo de título na capa">
                <label className="admin-radio">
                  <input
                    type="radio"
                    name="heroTitleMode"
                    checked={siteForm.heroTitleMode !== 'logo'}
                    onChange={() => updateSite('heroTitleMode', 'names')}
                  />
                  Nomes em texto
                </label>
                <label className="admin-radio">
                  <input
                    type="radio"
                    name="heroTitleMode"
                    checked={siteForm.heroTitleMode === 'logo'}
                    onChange={() => updateSite('heroTitleMode', 'logo')}
                  />
                  Logomarca (imagem)
                </label>
              </div>
              <span className="admin-hint">
                No modo texto, use a fonte script. No modo logomarca, envie uma imagem PNG/SVG com fundo
                transparente de preferência.
              </span>
            </div>
            {siteForm.heroTitleMode !== 'logo' ? (
              <label className="admin-field admin-field--full">
                <span className="admin-label">Nomes do casal</span>
                <input
                  className="admin-input"
                  value={siteForm.coupleNames}
                  onChange={(e) => updateSite('coupleNames', e.target.value)}
                />
              </label>
            ) : (
              <>
                <label className="admin-field admin-field--full">
                  <span className="admin-label">URL da logomarca</span>
                  <input
                    className="admin-input"
                    type="url"
                    value={siteForm.coupleLogoUrl}
                    onChange={(e) => updateSite('coupleLogoUrl', e.target.value)}
                    placeholder="https://…"
                  />
                </label>
                <label className="admin-field admin-field--full">
                  <span className="admin-label">Texto alternativo da imagem (acessibilidade)</span>
                  <input
                    className="admin-input"
                    value={siteForm.coupleLogoAlt}
                    onChange={(e) => updateSite('coupleLogoAlt', e.target.value)}
                    placeholder="Ex.: Maria Laura e Guilherme — monograma"
                  />
                  <span className="admin-hint">
                    Se vazio, usamos o campo &quot;Nomes do casal&quot; abaixo só como texto alternativo
                    (preencha os nomes mesmo no modo logo).
                  </span>
                </label>
                <label className="admin-field admin-field--full">
                  <span className="admin-label">Nomes do casal (para alt / SEO)</span>
                  <input
                    className="admin-input"
                    value={siteForm.coupleNames}
                    onChange={(e) => updateSite('coupleNames', e.target.value)}
                  />
                </label>
              </>
            )}
            <label className="admin-field">
              <span className="admin-label">Data do casamento (texto livre)</span>
              <input
                className="admin-input"
                value={siteForm.weddingDate}
                onChange={(e) => updateSite('weddingDate', e.target.value)}
                placeholder="ex.: 17 de abril de 2027"
              />
            </label>
            <label className="admin-field">
              <span className="admin-label">Data do casamento (contagem regressiva)</span>
              <input
                className="admin-input"
                type="date"
                value={siteForm.weddingDateIso || ''}
                onChange={(e) => updateSite('weddingDateIso', e.target.value)}
              />
              <span className="admin-hint">
                Opcional. Formato AAAA-MM-DD; usado na capa e no fim da lista. O texto ao lado continua
                sendo o que aparece escrito (&quot;17 de abril…&quot;).
              </span>
            </label>
            <label className="admin-field admin-field--full">
              <span className="admin-label">Texto de boas-vindas (hero)</span>
              <textarea
                className="admin-textarea admin-textarea--large"
                rows={4}
                value={siteForm.welcomeText}
                onChange={(e) => updateSite('welcomeText', e.target.value)}
              />
            </label>
            <label className="admin-field admin-field--full">
              <span className="admin-label">URL da imagem de fundo (banner)</span>
              <input
                className="admin-input"
                value={siteForm.bannerImage}
                onChange={(e) => updateSite('bannerImage', e.target.value)}
                placeholder="https://..."
              />
            </label>
            <label className="admin-field admin-field--full">
              <span className="admin-label">Imagem do bloco lua de mel (lista)</span>
              <input
                className="admin-input"
                type="url"
                value={siteForm.luaDeMelImage}
                onChange={(e) => updateSite('luaDeMelImage', e.target.value)}
                placeholder="https://… (vazio = imagem padrão)"
              />
              <span className="admin-hint">
                Foto ao lado do botão &quot;Contribuir para a lua de mel&quot;. Deixe em branco para usar a
                imagem padrão do site.
              </span>
            </label>
            <label className="admin-field">
              <span className="admin-label">Meta da lua de mel (R$)</span>
              <input
                className="admin-input"
                type="text"
                inputMode="decimal"
                value={siteForm.metaLuaDeMel}
                onChange={(e) => updateSite('metaLuaDeMel', e.target.value)}
                placeholder="ex.: 15000 ou 15.000"
              />
            </label>
            <label className="admin-field">
              <span className="admin-label">Rótulo da barra de meta</span>
              <input
                className="admin-input"
                value={siteForm.metaLabel}
                onChange={(e) => updateSite('metaLabel', e.target.value)}
                placeholder="Meta da lua de mel"
              />
            </label>
            <label className="admin-field">
              <span className="admin-label">Valor arrecadado (fallback, R$)</span>
              <input
                className="admin-input"
                type="text"
                inputMode="decimal"
                value={siteForm.valorArrecadado}
                onChange={(e) => updateSite('valorArrecadado', e.target.value)}
              />
            </label>
          </div>
          <div className="admin-gift-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={saveSite}
              disabled={!siteDirty}
            >
              Salvar configuração
            </button>
          </div>
          {configMsg && (
            <p className={configMsg.includes('salva') ? 'admin-success' : 'admin-error'}>{configMsg}</p>
          )}
        </div>
      )}
    </div>
  );
}
