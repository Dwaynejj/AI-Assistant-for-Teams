# Teams BI Agent 🤖

> **Enterprise-grade bilingual Business Intelligence bot for Microsoft Teams**
> English | עברית

---

## Overview

**BIAgent** is a Microsoft Teams bot that serves as a single intelligent interface for querying live business data across Sales (CRM), Inventory, and Procurement (ERP) systems — without leaving the Teams environment.

Users interact in **natural language** (English or Hebrew) and receive structured, actionable Adaptive Card responses in under 30 seconds.

### Key Features

| Feature | Status |
|---|---|
| Sales Intelligence (Pipeline, Performance, Deals) | ✅ MVP |
| Inventory Management (Stock Levels, SKU Lookup, Alerts) | ✅ MVP |
| Procurement Support (PO Status, Approvals, Suppliers) | ✅ MVP |
| Hebrew + English NLP | ✅ MVP |
| Adaptive Card Responses (RTL-aware) | ✅ MVP |
| Proactive Channel Alerts (every 30 min) | ✅ MVP |
| Azure AD RBAC | ✅ MVP |
| Application Insights Audit Logging | ✅ MVP |
| Azure Key Vault Secrets | ✅ MVP |

---

## Architecture

```
Microsoft Teams
     │ HTTPS / Bot Framework SDK
     ▼
Express.js Server (Azure App Service)
├── POST /api/messages  ← Bot Framework activity endpoint
├── GET  /health        ← Health check
│
├── NLP Layer (Azure AI Language + keyword fallback)
│   ├── Language Detection (EN / HE)
│   ├── Intent Classification (11 intents)
│   └── Entity Extraction (PO, SKU, dates, amounts)
│
├── RBAC (Azure AD Groups → Roles)
│
├── Handlers
│   ├── salesHandler.ts     → CRM Connector
│   ├── inventoryHandler.ts → Inventory Connector
│   ├── procurementHandler.ts → ERP Connector
│   └── helpHandler.ts
│
└── Adaptive Cards (schema 1.5, RTL-aware)

Azure Functions (Alert Scheduler — every 30 min)
└── alertEngine.ts → teamsNotifier.ts
```

---

## Prerequisites

- Node.js 18+
- npm 9+
- Azure subscription (Bot Service, App Service, Key Vault, AI Language)
- Microsoft 365 tenant with Teams admin access
- API credentials for your CRM, ERP, and Inventory systems

---

## Local Development Setup

### 1. Clone the repository

```bash
git clone https://github.com/your-org/teams-bi-agent
cd teams-bi-agent
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

```bash
cp .env.example .env
# Edit .env and fill in all required values
```

For local development without real backends, the bot will automatically use **mock data** when the API URLs contain `mock` or `example.com`.

### 4. Start the development server

```bash
npm run dev
# Server starts on http://localhost:3978
# Health check: http://localhost:3978/health
# Bot endpoint: http://localhost:3978/api/messages
```

### 5. Test with Bot Framework Emulator

1. Download [Bot Framework Emulator](https://github.com/microsoft/BotFramework-Emulator)
2. Connect to `http://localhost:3978/api/messages`
3. Leave App ID and Password blank for local testing

---

## Azure Deployment

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
    KEY_VAULT_URL="https://teams-bi-kv.vault.azure.net/" \
    MICROSOFT_APP_ID="<app-id>" \
    CRM_API_URL="https://your-crm.com/api" \
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

## Usage

### English Queries

```
@BIAgent show me the sales pipeline for Q3
@BIAgent what is our win rate for the last 90 days?
@BIAgent show inventory for SKU-0042
@BIAgent what items are below minimum stock level?
@BIAgent what is the status of PO-20250618?
@BIAgent which POs are awaiting my approval?
@BIAgent list suppliers for electronics
@BIAgent help
```

### Hebrew Queries (שאילתות בעברית)

```
@BIAgent מה ערך הפייפליין הרבעוני?
@BIAgent הצג לי עסקאות הנסגרות החודש
@BIAgent אילו פריטים מתחת לרמת מלאי מינימלית?
@BIAgent הצג מלאי ל-SKU-0042
@BIAgent מה הסטטוס של הזמנת רכש PO-20250618?
@BIAgent עזרה
```

### Language Switching

```
/lang en   → Switch to English
/lang he   → עבור לעברית
```

---

## Available Commands / Intents

| Intent | English Triggers | Hebrew Triggers |
|---|---|---|
| `SALES_PIPELINE` | pipeline, forecast, deals | פייפליין, תחזית, עסקאות |
| `SALES_PERFORMANCE` | performance, quota, win rate | ביצועים, מכסה, שיעור ניצחון |
| `SALES_DEAL_DETAIL` | deal status, specific deal | סטטוס עסקה, עסקה ספציפית |
| `INVENTORY_LEVELS` | stock, inventory, on hand | מלאי, יחידות, כמות |
| `INVENTORY_ALERTS` | low stock, shortage, critical | מלאי נמוך, מחסור, קריטי |
| `INVENTORY_SKU` | SKU-XXXX, product code | קוד מוצר, SKU |
| `PROCUREMENT_PO_STATUS` | PO-XXXXXXXX, purchase order | הזמנת רכש, סטטוס הזמנה |
| `PROCUREMENT_APPROVALS` | pending approval, my approvals | ממתין לאישור, אישורים שלי |
| `PROCUREMENT_SUPPLIER` | supplier, vendor | ספק, רשימת ספקים |
| `HELP` | help, what can you do | עזרה, מה אתה יכול |

---

## Access Control

Roles are mapped to **Azure AD groups** (no separate user management needed):

| Role | Access |
|---|---|
| `VIEWER` | HELP and LANG_SWITCH only |
| `SALES_USER` | All SALES_* intents |
| `INVENTORY_USER` | All INVENTORY_* intents |
| `PROCUREMENT_USER` | All PROCUREMENT_* intents |
| `MANAGER` | All modules |
| `ADMIN` | Full access |

Configure role group IDs in environment variables:
```
AAD_ROLE_GROUP_SALES=<azure-ad-group-object-id>
AAD_ROLE_GROUP_INVENTORY=<azure-ad-group-object-id>
# ...
```

---

## Alert System

The alert scheduler (Azure Function) runs **every 30 minutes** and posts to the configured Teams channel when:

- 🔴 **CRITICAL_STOCK**: Any SKU has `onHand ≤ CRITICAL_STOCK_THRESHOLD` (default: 10)
- 🟡 **LOW_STOCK**: Any SKU has `onHand < LOW_STOCK_THRESHOLD` (default: 50)
- ⚠️ **PO_OVERDUE**: Any purchase order is past its expected delivery date

Alerts are **deduplicated** — the same alert is not resent within the 30-minute check interval.

---

## Development Scripts

```bash
npm run build        # TypeScript compile → dist/
npm run dev          # ts-node dev server (with hot reload)
npm test             # Run all Jest tests
npm run lint         # ESLint with zero-warning policy
npm run lint:fix     # Auto-fix lint issues
npm run format       # Prettier format
npm run typecheck    # TypeScript type check (no emit)
npm run audit:ci     # npm audit (CI security check)
```

---

## Project Structure

```
teams-bi-agent/
├── src/
│   ├── bot/
│   │   ├── biAgent.ts           ← Main bot class (ActivityHandler)
│   │   ├── adaptiveCards.ts     ← All 10 Adaptive Card builders
│   │   └── conversationState.ts ← State management
│   ├── nlp/
│   │   ├── intentParser.ts      ← CLU + keyword fallback
│   │   ├── languageDetector.ts  ← EN/HE detection
│   │   └── entities.ts          ← Entity extraction
│   ├── connectors/
│   │   ├── baseConnector.ts     ← HTTP client + retry logic
│   │   ├── crmConnector.ts      ← CRM API adapter
│   │   ├── erpConnector.ts      ← ERP API adapter
│   │   └── inventoryConnector.ts← Inventory adapter
│   ├── handlers/
│   │   ├── salesHandler.ts
│   │   ├── inventoryHandler.ts
│   │   ├── procurementHandler.ts
│   │   └── helpHandler.ts
│   ├── alerts/
│   │   ├── alertEngine.ts       ← Threshold detection + dedup
│   │   ├── alertFormatter.ts    ← Alert → Adaptive Card
│   │   └── teamsNotifier.ts     ← Proactive channel posting
│   ├── auth/
│   │   ├── aadAuth.ts           ← AAD identity extraction
│   │   └── rbac.ts              ← Role-based access control
│   ├── i18n/
│   │   ├── en.json              ← English strings
│   │   └── he.json              ← Hebrew strings (RTL)
│   ├── utils/
│   │   ├── config.ts            ← Key Vault + env config
│   │   ├── logger.ts            ← Application Insights wrapper
│   │   └── formatter.ts         ← Formatting utilities
│   └── index.ts                 ← Express entry point
├── functions/
│   └── alertScheduler/
│       ├── index.ts             ← Azure Function timer trigger
│       └── function.json        ← Function binding (every 30 min)
├── tests/
│   ├── setup.ts                 ← Jest global setup
│   ├── bot.test.ts
│   ├── nlp.test.ts
│   ├── connectors.test.ts
│   └── alerts.test.ts
├── deployment/
│   └── teams-manifest/
│       ├── manifest.json        ← Teams App Manifest v1.16
│       ├── color.png            ← 192×192 app icon
│       └── outline.png          ← 32×32 outline icon
├── .env.example
├── .eslintrc.json
├── .prettierrc
├── jest.config.ts
├── tsconfig.json
└── package.json
```

---

## Security

- **No secrets in code** — all credentials via Key Vault or env vars
- **No business data stored** — all data retrieved live per query
- **TLS enforced** — `rejectUnauthorized: true` on all outbound HTTP
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
| Retry attempts | 3 (500ms, 1s, 2s backoff) |
| Bot uptime | > 99.5% |
| Alert delivery latency | < 2 minutes |

---

## Support

| Issue | Action |
|---|---|
| Bot not responding | Check Azure App Service status; run `GET /health` |
| Wrong data returned | Log an issue with the query text and expected result |
| Access denied | Request role assignment from IT/HR |
| Hebrew language issues | Submit example to NLP improvement backlog |
| Security concern | Escalate directly to CISO — do not log publicly |

---

*Teams BI Agent v1.0 — Built to spec by BIAgent Builder*
