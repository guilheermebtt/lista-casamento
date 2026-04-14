<<<<<<< HEAD
# listacasamento
=======
# Lista de casamento — presentes simbólicos + PIX (Mercado Pago)

Site em tons de azul para **lista de casamento** (itens únicos, ex.: mobília) e **contribuição à parte** para a **lua de mel**. Pagamentos via **PIX** (Mercado Pago). A **meta da lua de mel** só soma doações feitas pelo botão dedicado; compras de itens da lista não entram nessa meta. Cada item da lista só pode ser comprado **uma vez**; nome e e-mail do comprador ficam em `backend/data/registry.json`.

## Estrutura do projeto

```
Lista Casamento/
├── backend/                 # API Node.js (Express)
│   ├── .env.example
│   ├── data/
│   │   └── registry.json    # Total lua de mel + vendas (quem comprou o quê)
│   ├── package.json
│   └── src/
│       ├── index.js
│       ├── lib/
│       │   └── registryStore.js
│       └── routes/
│           └── payment.js   # PIX, registro, webhook
├── frontend/                # React + Vite
│   ├── .env.example
│   ├── index.html
│   ├── public/
│   │   ├── config.json      # Nomes, data, banner, meta da lua de mel
│   │   └── gifts.json       # Lista editável de presentes
│   ├── package.json
│   ├── vite.config.js
│   └── src/
│       ├── App.jsx
│       ├── App.css
│       ├── api.js
│       └── components/
└── README.md
```

## Requisitos

- **Node.js 18+**
- Conta **Mercado Pago** com [credenciais](https://www.mercadopago.com.br/developers/panel/credentials) (produção ou teste)

## Como rodar localmente

### 1. Backend

```bash
cd backend
copy .env.example .env
```

Edite `.env` e cole seu `MERCADOPAGO_ACCESS_TOKEN` (nunca commite o `.env`).

```bash
npm install
npm run dev
```

A API sobe em `http://localhost:3001`. Teste: `GET http://localhost:3001/health`.

### 2. Frontend

Em outro terminal:

```bash
cd frontend
npm install
npm run dev
```

Abra `http://localhost:5173`. O Vite está configurado para **proxy** de `/api` → `http://localhost:3001`, então não precisa de `VITE_API_URL` em dev.

### 3. Mercado Pago — o que configurar

1. Acesse [Suas integrações](https://www.mercadopago.com.br/developers/panel/app) e crie ou selecione uma aplicação.
2. Em **Credenciais**, copie o **Access Token** (use o de **teste** para simular pagamentos sem dinheiro real).
3. Cole no `backend/.env` como `MERCADOPAGO_ACCESS_TOKEN`.
4. Copie também a **Public Key** (mesmo painel) e coloque no **frontend** como `VITE_MERCADOPAGO_PUBLIC_KEY` no arquivo `frontend/.env` (ou variável no host de deploy). Ela é necessária para o **Card Payment Brick** (cartão com parcelas); sem ela, só o PIX aparece no checkout.

Para **PIX de teste**, use usuários de teste do Mercado Pago e carteira/conta de teste conforme a [documentação oficial](https://www.mercadopago.com.br/developers/pt/docs/checkout-api/integration-test/test-cards).

### Webhook (opcional)

Para o Mercado Pago notificar seu servidor quando o PIX for pago:

1. Deploy do backend com URL pública (ex.: Railway, Render, Fly.io).
2. Defina no `.env`:

   - `PUBLIC_URL=https://sua-api.exemplo.com`

3. No painel do MP, cadastre a URL de notificação se necessário (alguns fluxos usam `notification_url` no próprio pagamento — já enviamos quando `PUBLIC_URL` existe).

Em desenvolvimento local, use [ngrok](https://ngrok.com/) (ou similar) para expor a porta 3001 e apontar `PUBLIC_URL` para o túnel.

## Personalização

| Arquivo | Conteúdo |
|--------|-----------|
| `frontend/public/config.json` | Nome do casal, data, texto de boas-vindas, imagem do banner, meta da lua de mel (`metaLuaDeMel`, `valorArrecadado`) |
| `frontend/public/gifts.json` | Lista de presentes: `id`, `name`, `description`, `amount` (número em reais) |

A frase fixa *"Os presentes são simbólicos..."* aparece na home, na lista e no rodapé.

## Deploy sugerido

| Parte | Opção típica |
|--------|----------------|
| **Frontend** | [Vercel](https://vercel.com/) ou [Netlify](https://www.netlify.com/) — build: `cd frontend && npm run build`, pasta de saída: `dist` |
| **Backend** | [Railway](https://railway.app/), [Render](https://render.com/) ou [Fly.io](https://fly.io/) — comando `npm start`, variável `MERCADOPAGO_ACCESS_TOKEN` e `PORT` fornecida pelo host |

No frontend em produção, crie `frontend/.env.production` (ou variáveis no painel do host):

```env
VITE_API_URL=https://sua-api-publica.com
```

`VITE_*` é embutido no build; apontar para a URL **HTTPS** da API.

## Endpoints da API

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/health` | Saúde do serviço |
| `GET` | `/api/registry` | Total da lua de mel + IDs dos presentes já vendidos |
| `GET` | `/api/contributions` | Só o total arrecadado para a lua de mel |
| `POST` | `/api/payments/pix` | Cria PIX (`buyerName` obrigatório para itens da lista; não para `lua-de-mel`) |
| `POST` | `/api/payments/card` | Cartão (token do Card Brick + parcelas + `payer` com documento) |
| `GET` | `/api/payments/:id` | Status do pagamento (polling) |
| `POST` | `/api/contributions/apply` | Confirma pagamento aprovado e atualiza `registry.json` |
| `POST` | `/api/webhooks/mercadopago` | Webhook Mercado Pago |

## Segurança

- O **Access Token** fica apenas no **backend** (variável de ambiente).
- O frontend chama só a sua API; não use chaves do Mercado Pago no React.

## Licença

Uso livre para o seu casamento e projetos pessoais.
>>>>>>> 7b7cd1c (Projeto inicial)
