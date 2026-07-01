# BIAgent — Business Intelligence Assistant 🤖

> **Bilingual (English | עברית) BI bot for Microsoft Teams — with a zero-setup browser demo anyone can run right now**

---

## Run it in under a minute (no Azure account, no Teams, no `.env` needed)

```bash
git clone https://github.com/your-org/teams-bi-agent
cd teams-bi-agent
npm install
npm run dev
```

Open **http://localhost:3978** in your browser and start chatting.

The app boots in **demo mode** — it uses built-in mock data for Sales, Inventory, and Procurement, so you can explore every feature immediately with no credentials.

### Try these queries in the chat window

| English | Hebrew |
|---|---|
| `show me the sales pipeline` | `מה ערך הפייפליין הרבעוני?` |
| `what is our win rate for the last 90 days?` | `מה שיעור הניצחון ב-90 ימים האחרונים?` |
| `what items are below minimum stock?` | `אילו פריטים מתחת לרמת מלאי מינימלית?` |
| `show inventory for SKU-0042` | `הצג מלאי ל-SKU-0042` |
| `what is the status of PO-20250618?` | `מה הסטטוס של הזמנת רכש PO-20250618?` |
| `which POs are awaiting approval?` | `אילו הזמנות ממתינות לאישור?` |
| `help` | `עזרה` |

Click **Preview Alerts** in the chat to see what a proactive stock or PO alert would look like when pushed to a real Teams channel.

---

## What this is

**BIAgent** is an enterprise-grade bilingual Business Intelligence bot that gives users a single natural-language interface to query live data across Sales (CRM), Inventory, and Procurement (ERP) systems — either in **Microsoft Teams** or directly in a **browser**.

### Key features

| Feature | Status |
|---|---|
| Sales pipeline, performance & deal lookup | ✅ |
| Inventory levels, alerts & SKU lookup | ✅ |
| Procurement PO status, approvals & supplier info | ✅ |
| Natural language — English + Hebrew (RTL-aware) | ✅ |
| Adaptive Card responses (Teams and browser) | ✅ |
| Proactive channel alerts every 30 min (Azure Function) | ✅ |
| Azure AD RBAC (demo mode grants full access) | ✅ |
| Application Insights audit logging | ✅ |
| Azure Key Vault secrets | ✅ |
| **Browser demo — zero setup, zero credentials** | ✅ NEW |

---

## Architecture

The codebase is split into a **channel-agnostic core engine** and thin **channel adapters**:

```
Browser (Web Chat)          Microsoft Teams
      │                           │
      │  POST /api/chat           │  POST /api/messages
      ▼                           ▼
src/channels/web/          src/channels/teams/
webChatRouter.ts           biAgent.ts
      │                           │
      └──────────┬────────────────┘
                 ▼
          src/core/  (shared engine)
          ├── nlp/           NLP: intent + language + entities
          │   ├── intentParser.ts   (Azure CLU + keyword fallback)
          │   ├── languageDetector.ts
          │   └── entities.ts
          ├── auth/          RBAC: Azure AD groups → roles
          ├── handlers/      Domain logic (Sales / Inventory / Procurement)
          ├── connectors/    CRM / ERP / Inventory (with mock fallback)
          ├── cards/         Adaptive Card builders (RTL-aware)
          ├── alerts/        Proactive alert engine + formatter
          ├── i18n/          String bundles (en.json, he.json)
          └── utils/         Config, logger, formatter

functions/alertScheduler/   Azure Function timer trigger (every 30 min)
```

Both channels run the **identical** NLP → RBAC → handler → Adaptive Card pipeline. Business logic lives in exactly one place.

---

## Project structure

```
teams-bi-agent/
├── src/
│   ├── server.ts                    ← Express entry point (Teams + Web Chat)
│   ├── core/                        ← Channel-agnostic engine
│   │   ├── engine.ts                ← Single intent-routing entry point
│   │   ├── nlp/
│   │   │   ├── intentParser.ts      ← Azure CLU + keyword fallback
│   │   │   ├── languageDetector.ts  ← EN/HE detection
│   │   │   └── entities.ts          ← PO, SKU, date, amount extraction
│   │   ├── connectors/
│   │   │   ├── baseConnector.ts     ← HTTP client with retry + TLS
│   │   │   ├── crmConnector.ts      ← CRM adapter (mock or live)
│   │   │   ├── erpConnector.ts      ← ERP adapter (mock or live)
│   │   │   └── inventoryConnector.ts
│   │   ├── handlers/
│   │   │   ├── salesHandler.ts
│   │   │   ├── inventoryHandler.ts
│   │   │   ├── procurementHandler.ts
│   │   │   └── helpHandler.ts
│   │   ├── alerts/
│   │   │   ├── alertEngine.ts       ← Threshold detection + deduplication
│   │   │   └── alertFormatter.ts    ← Alert → Adaptive Card
│   │   ├── auth/
│   │   │   ├── rbac.ts              ← Role-based access (ADMIN in demo mode)
│   │   │   └── aadAuth.ts           ← AAD identity extraction
│   │   ├── cards/
│   │   │   └── adaptiveCards.ts     ← All 10 Adaptive Card builders
│   │   ├── i18n/
│   │   │   ├── en.json
│   │   │   └── he.json
│   │   └── utils/
│   │       ├── config.ts            ← Key Vault + env config (demo defaults)
│   │       ├── logger.ts            ← App Insights wrapper
│   │       └── formatter.ts         ← Currency, date, number formatting
│   └── channels/
│       ├── teams/                   ← Microsoft Teams (Bot Framework)
│       │   ├── biAgent.ts           ← ActivityHandler subclass
│       │   ├── conversationState.ts
│       │   └── teamsNotifier.ts     ← Proactive channel posting
│       └── web/                     ← Browser demo channel
│           ├── webChatRouter.ts     ← POST /api/chat, GET /api/alerts/preview
│           ├── webSession.ts        ← In-memory session store
│           └── public/              ← Static Web Chat UI (no build step)
│               ├── index.html
│               ├── app.js           ← Vanilla-JS Adaptive Card renderer
│               └── style.css
├── functions/
│   └── alertScheduler/
│       ├── index.ts                 ← Azure Function timer trigger
│       └── function.json            ← Schedule: every 30 minutes
├── tests/
│   ├── setup.ts
│   ├── bot.test.ts
│   ├── nlp.test.ts
│   ├── connectors.test.ts
│   ├── alerts.test.ts
│   └── webChat.test.ts              ← Demo mode + /api/chat endpoint tests
├── scripts/
│   └── copyAssets.js                ← Copies web/public → dist after tsc
├── deployment/
│   └── teams-manifest/
│       ├── manifest.json
│       ├── color.png
│       └── outline.png
├── .env.example
├── jest.config.ts
├── tsconfig.json
└── package.json
```

---

## Development scripts

```bash
npm run dev          # Start dev server with ts-node (http://localhost:3978)
npm test             # Run all Jest tests (88 tests, ~15 s)
npm run typecheck    # TypeScript type check (no emit)
npm run lint         # ESLint — zero-warning policy
npm run lint:fix     # Auto-fix lint issues
npm run build        # tsc + copy static assets → dist/
npm start            # Start compiled production build
npm run format       # Prettier format all files
npm run audit:ci     # npm audit (CI security check)
```

---

## Demo mode vs. production mode

| | Demo mode (default) | Production (`NODE_ENV=production`) |
|---|---|---|
| Trigger | Any `NODE_ENV` other than `"production"` | `NODE_ENV=production` |
| Credentials required | **None** | All credentials in `.env.example` |
| Data source | Built-in mock data | Live CRM / ERP / Inventory APIs |
| RBAC | Full access for all users | Azure AD group membership |
| Application Insights | Disabled (console logging) | Required |
| Bot Framework auth | Skipped locally | Required |
| Web Chat demo (`/`) | ✅ Always available | ✅ Always available |

In demo mode the app auto-fills all missing env vars with safe local defaults (empty strings for credentials, `mock://` URLs for systems). No `.env` file is needed at all.

---

## Production Deployment

### Prerequisites

- Node.js 18+
- Azure subscription (Bot Service, App Service, Key Vault, AI Language)
- Microsoft 365 tenant with Teams admin access
- API credentials for your CRM, ERP, and Inventory systems

### Step 1 — Register the Bot

```bash
az bot create \
  --resource-group <your-rg> \
  --name TeamsBI-Agent \
  --kind registration \
  --sku F0 \
  --appid <YOUR_APP_ID>
```

### Step 2 — Create Azure Resources

```bash
# App Service
az webapp create \
  --name teams-bi-agent \
  --resource-group <your-rg> \
  --runtime "NODE:18-lts"

# Key Vault
az keyvault create \
  --name teams-bi-kv \
  --resource-group <your-rg>

# Application Insights
az monitor app-insights component create \
  --app teams-bi-insights \
  --resource-group <your-rg>
```

### Step 3 — Add Secrets to Key Vault

```bash
az keyvault secret set --vault-name teams-bi-kv --name "Microsoft-App-Password" --value "<password>"
az keyvault secret set --vault-name teams-bi-kv --name "Crm-Api-Key" --value "<crm-key>"
az keyvault secret set --vault-name teams-bi-kv --name "Erp-Api-Key" --value "<erp-key>"
# ... (see .env.example for all secrets)
```

### Step 4 — Set App Service Environment Variables

```bash
az webapp config appsettings set \
  --name teams-bi-agent \
  --resource-group <your-rg> \
  --settings \
    NODE_ENV="production" \
    KEY_VAULT_URL="https://teams-bi-kv.vault.azure.net/" \
    MICROSOFT_APP_ID="<app-id>" \
    CRM_API_URL="https://your-crm.com/api" \
    AAD_TENANT_ID="<tenant-id>"
    # ... (see .env.example for full list)
```

### Step 5 — Build and Deploy

```bash
npm run build
az webapp up \
  --name teams-bi-agent \
  --resource-group <your-rg> \
  --runtime "NODE:18-lts"
```

### Step 6 — Enable Teams Channel

1. Azure Portal → Your Bot → Channels → **Microsoft Teams**
2. Accept terms and save
3. Click **Open in Teams** to test

### Step 7 — Sideload the Teams App

1. Zip the `deployment/teams-manifest/` folder:
   ```bash
   cd deployment/teams-manifest
   zip -r biagent-manifest.zip manifest.json color.png outline.png
   ```
2. Teams Admin Center → **Manage Apps** → **Upload custom app**
3. Upload `biagent-manifest.zip`
4. Assign to relevant teams and channels

---

## Access Control (RBAC)

Roles are mapped from **Azure AD group membership** — no separate user management.

| Role | Access |
|---|---|
| `VIEWER` | HELP and language switching only |
| `SALES_USER` | All `SALES_*` intents |
| `INVENTORY_USER` | All `INVENTORY_*` intents |
| `PROCUREMENT_USER` | All `PROCUREMENT_*` intents |
| `MANAGER` | All modules |
| `ADMIN` | Full access |

In **demo mode** every user is automatically granted `ADMIN` access so all features are explorable without any Azure AD setup.

Configure group Object IDs in `.env` (production only):
```
AAD_ROLE_GROUP_SALES=<azure-ad-group-object-id>
AAD_ROLE_GROUP_INVENTORY=<azure-ad-group-object-id>
# ... (see .env.example)
```

---

## Alert System

The Azure Function scheduler (`functions/alertScheduler/`) runs **every 30 minutes** and posts Adaptive Card alerts to the configured Teams channel when:

- 🔴 **CRITICAL_STOCK** — any SKU has `onHand ≤ CRITICAL_STOCK_THRESHOLD` (default: 10)
- 🟡 **LOW_STOCK** — any SKU has `onHand < LOW_STOCK_THRESHOLD` (default: 50)
- ⚠️ **PO_OVERDUE** — any PO is past its expected delivery date

Alerts are **deduplicated** — the same alert is never resent within the 30-minute interval.

You can preview what these look like without a real Teams channel by clicking **Preview Alerts** in the browser demo or calling `GET /api/alerts/preview`.

---

## Available Intents

| Intent | English triggers | Hebrew triggers |
|---|---|---|
| `SALES_PIPELINE` | pipeline, forecast, deals | פייפליין, תחזית, עסקאות |
| `SALES_PERFORMANCE` | performance, quota, win rate | ביצועים, מכסה, שיעור ניצחון |
| `SALES_DEAL_DETAIL` | deal status, specific deal | סטטוס עסקה |
| `INVENTORY_LEVELS` | stock, inventory, on hand | מלאי, יחידות, כמות |
| `INVENTORY_ALERTS` | low stock, shortage, critical | מלאי נמוך, מחסור, קריטי |
| `INVENTORY_SKU` | SKU-XXXX, product code | קוד מוצר, SKU |
| `PROCUREMENT_PO_STATUS` | PO-XXXXXXXX, purchase order | הזמנת רכש, סטטוס הזמנה |
| `PROCUREMENT_APPROVALS` | pending approval | ממתין לאישור |
| `PROCUREMENT_SUPPLIER` | supplier, vendor | ספק |
| `HELP` | help, what can you do | עזרה |
| `LANG_SWITCH` | `/lang en` / `/lang he` | `/lang he` / `/lang en` |

---

## Security

- **No secrets in code** — all credentials via Key Vault or environment variables
- **No business data stored** — all data is fetched live per query
- **TLS enforced** — `rejectUnauthorized: true` on all outbound HTTP connections
- **Input sanitisation** — HTML and control characters stripped from all user input
- **RBAC enforced** — every query checked before handler execution
- **Audit logging** — every query logged to Application Insights via `logQuery()`
- **Bot Framework token validation** — never bypassed on `/api/messages`

---

## Performance

| Metric | Target |
|---|---|
| Query response time | < 30 seconds |
| Connector timeout | 20 seconds |
| Retry attempts | 3 (500 ms, 1 s, 2 s backoff) |
| Alert delivery latency | < 2 minutes |

---

*BIAgent v1.0 — run it in your browser in under a minute, deploy to Teams when you're ready*
