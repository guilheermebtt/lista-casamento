import React from 'react';
import ReactDOM from 'react-dom/client';
import { initMercadoPago } from '@mercadopago/sdk-react';
import App from './App.jsx';
import './index.css';

const mpPk = import.meta.env.VITE_MERCADOPAGO_PUBLIC_KEY?.trim();
if (mpPk) {
  initMercadoPago(mpPk, { locale: 'pt-BR' });
  if (import.meta.env.DEV) {
    const okPrefix = mpPk.startsWith('TEST-') || mpPk.startsWith('APP_USR-');
    if (!okPrefix || mpPk.length < 25) {
      console.warn(
        '[Mercado Pago] Verifique se VITE_MERCADOPAGO_PUBLIC_KEY é a Chave pública do painel (aba Credenciais). ' +
          'Não use o Access Token do backend — isso causa 404 / "site ID" no console e o Brick não carrega.'
      );
    }
  }
}

/* StrictMode desliga o Brick do MP (montagem dupla quebra iframes do cartão) */
ReactDOM.createRoot(document.getElementById('root')).render(<App />);
