/**
 * @file adaptiveCards.ts
 * @description Adaptive Card JSON template builders for all Teams BI Agent response types.
 * All cards use Adaptive Cards schema version 1.5 with RTL support for Hebrew content.
 *
 * Colour scheme:
 *   Header:   #0078D4 (Microsoft blue)
 *   Critical: #D13438 (red)
 *   Warning:  #FFB900 (amber)
 *   Good:     #107C10 (green)
 *   Neutral:  #605E5C (grey)
 */

import enStrings from '../i18n/en.json';
import heStrings from '../i18n/he.json';
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatPercent,
  formatNumber,
  getStockSeverity,
  daysBetween,
} from '../utils/formatter';
import { PipelineSummary, Deal, SalesPerformance, DealDetail } from '../connectors/crmConnector';
import { StockItem } from '../connectors/inventoryConnector';
import { PurchaseOrder, Supplier } from '../connectors/erpConnector';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

type Strings = typeof enStrings;
type Lang = 'en' | 'he';

/** Generic Adaptive Card container (loosely typed for flexibility) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdaptiveCard = Record<string, any>;

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function t(lang: Lang): Strings {
  return lang === 'he' ? (heStrings as unknown as Strings) : enStrings;
}

/**
 * Build the standard card footer column set.
 *
 * @param dataSource - Name of the data source
 * @param lang - Display language
 * @returns Adaptive Card ColumnSet element
 */
function buildFooter(dataSource: string, lang: Lang): AdaptiveCard {
  const strings = t(lang);
  return {
    type: 'ColumnSet',
    separator: true,
    columns: [
      {
        type: 'Column',
        width: 'stretch',
        items: [
          {
            type: 'TextBlock',
            text: `${strings.alerts.data_source}: **${dataSource}** · ${strings.alerts.generated_at}: ${formatDateTime(new Date(), lang)}`,
            size: 'Small',
            color: 'Default',
            isSubtle: true,
            wrap: true,
            ...(lang === 'he' ? { rtl: true } : {}),
          },
        ],
      },
    ],
  };
}

/**
 * Build a standard card header with the BIAgent logo colour band.
 *
 * @param title - Card title text
 * @param lang - Display language
 * @returns Adaptive Card Container element
 */
function buildHeader(title: string, lang: Lang): AdaptiveCard {
  return {
    type: 'Container',
    style: 'emphasis',
    bleed: true,
    items: [
      {
        type: 'TextBlock',
        text: title,
        size: 'Large',
        weight: 'Bolder',
        color: 'Default',
        wrap: true,
        ...(lang === 'he' ? { rtl: true } : {}),
      },
    ],
  };
}

/** Status badge map for PO status */
const STATUS_BADGE: Record<string, string> = {
  OPEN: '📂',
  APPROVED: '✅',
  IN_TRANSIT: '🚚',
  DELIVERED: '✅',
  OVERDUE: '🔴',
  CANCELLED: '❌',
  PENDING_APPROVAL: '⏳',
};

// ─────────────────────────────────────────────
// Card builders
// ─────────────────────────────────────────────

/**
 * Build the welcome card shown when a new user joins.
 * Contains bilingual description and quick-action buttons.
 *
 * @param lang - Display language for primary text
 * @returns Adaptive Card JSON object
 */
export function buildWelcomeCard(lang: Lang): AdaptiveCard {
  return {
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    type: 'AdaptiveCard',
    version: '1.5',
    body: [
      {
        type: 'Container',
        style: 'emphasis',
        bleed: true,
        items: [
          {
            type: 'TextBlock',
            text: '👋 BIAgent',
            size: 'ExtraLarge',
            weight: 'Bolder',
            color: 'Default',
          },
          {
            type: 'TextBlock',
            text: 'Business Intelligence Assistant | עוזר מודיעין עסקי',
            size: 'Medium',
            isSubtle: true,
            wrap: true,
          },
        ],
      },
      {
        type: 'TextBlock',
        text: lang === 'he' ? heStrings.welcome.description : enStrings.welcome.description,
        wrap: true,
        spacing: 'Medium',
        ...(lang === 'he' ? { rtl: true } : {}),
      },
      {
        type: 'TextBlock',
        text: lang === 'he' ? heStrings.welcome.prompt : enStrings.welcome.prompt,
        wrap: true,
        weight: 'Bolder',
        ...(lang === 'he' ? { rtl: true } : {}),
      },
    ],
    actions: [
      {
        type: 'Action.Submit',
        title: 'Sales Report | דוח מכירות',
        data: { action: 'quick_query', query: 'show me the sales pipeline' },
      },
      {
        type: 'Action.Submit',
        title: 'Inventory Status | מצב מלאי',
        data: { action: 'quick_query', query: 'show inventory status' },
      },
      {
        type: 'Action.Submit',
        title: 'Procurement | רכש',
        data: { action: 'quick_query', query: 'show open purchase orders' },
      },
      {
        type: 'Action.Submit',
        title: 'Help | עזרה',
        data: { action: 'quick_query', query: 'help' },
      },
    ],
  };
}

/**
 * Build a sales pipeline summary card with key KPIs.
 *
 * @param data - Pipeline summary data
 * @param lang - Display language
 * @returns Adaptive Card JSON object
 */
export function buildPipelineCard(data: PipelineSummary, lang: Lang): AdaptiveCard {
  const s = t(lang);
  return {
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    type: 'AdaptiveCard',
    version: '1.5',
    body: [
      buildHeader(`${s.sales.pipeline.title}${data.quarter ? ` — ${data.quarter}` : ''}`, lang),
      {
        type: 'FactSet',
        facts: [
          {
            title: s.sales.pipeline.total_value,
            value: formatCurrency(data.totalPipelineValue, 'USD', lang),
          },
          {
            title: s.sales.pipeline.deals_closing,
            value: formatNumber(data.dealsClosingThisMonth, lang),
          },
          {
            title: s.sales.pipeline.weighted_forecast,
            value: formatCurrency(data.weightedForecast, 'USD', lang),
          },
          { title: s.sales.pipeline.win_rate, value: formatPercent(data.winRate, lang) },
          { title: s.sales.pipeline.top_rep, value: data.topRep },
          { title: s.sales.pipeline.at_risk, value: `⚠️ ${formatNumber(data.dealsAtRisk, lang)}` },
        ],
        ...(lang === 'he' ? { rtl: true } : {}),
      },
      buildFooter('CRM', lang),
    ],
  };
}

/**
 * Build a deal list table card showing multiple deals with status badges.
 *
 * @param deals - Array of deal records
 * @param lang - Display language
 * @returns Adaptive Card JSON object
 */
export function buildDealListCard(deals: Deal[], lang: Lang): AdaptiveCard {
  const s = t(lang);
  const rows = deals.map((deal) => ({
    type: 'ColumnSet',
    separator: true,
    columns: [
      {
        type: 'Column',
        width: 'stretch',
        items: [
          {
            type: 'TextBlock',
            text: deal.name,
            weight: 'Bolder',
            wrap: true,
            ...(lang === 'he' ? { rtl: true } : {}),
          },
          {
            type: 'TextBlock',
            text: `${deal.accountName} · ${deal.ownerName}`,
            isSubtle: true,
            size: 'Small',
            ...(lang === 'he' ? { rtl: true } : {}),
          },
        ],
      },
      {
        type: 'Column',
        width: 'auto',
        items: [
          {
            type: 'TextBlock',
            text: formatCurrency(deal.value, 'USD', lang),
            weight: 'Bolder',
            color: 'Good',
          },
          {
            type: 'TextBlock',
            text: deal.isAtRisk ? '⚠️ At Risk' : deal.stage,
            color: deal.isAtRisk ? 'Attention' : 'Default',
            size: 'Small',
          },
        ],
      },
    ],
  }));

  return {
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    type: 'AdaptiveCard',
    version: '1.5',
    body: [
      buildHeader(s.sales.pipeline.title, lang),
      deals.length === 0
        ? { type: 'TextBlock', text: s.sales.pipeline.no_deals, isSubtle: true, wrap: true }
        : { type: 'Container', items: rows },
      buildFooter('CRM', lang),
    ],
  };
}

/**
 * Build a sales performance leaderboard card.
 *
 * @param performance - Array of sales performance records
 * @param lang - Display language
 * @returns Adaptive Card JSON object
 */
export function buildPerformanceCard(performance: SalesPerformance[], lang: Lang): AdaptiveCard {
  const s = t(lang);
  const ranks = ['🥇', '🥈', '🥉'];
  const rows = performance.map((rep, idx) => ({
    type: 'ColumnSet',
    separator: true,
    columns: [
      {
        type: 'Column',
        width: 'auto',
        items: [{ type: 'TextBlock', text: ranks[idx] ?? `${idx + 1}.`, size: 'Medium' }],
      },
      {
        type: 'Column',
        width: 'stretch',
        items: [
          { type: 'TextBlock', text: rep.repName, weight: 'Bolder' },
          {
            type: 'TextBlock',
            text: `${formatCurrency(rep.revenue, 'USD', lang)} / ${formatCurrency(rep.quota, 'USD', lang)}`,
            isSubtle: true,
            size: 'Small',
          },
        ],
      },
      {
        type: 'Column',
        width: 'auto',
        items: [
          {
            type: 'TextBlock',
            text: formatPercent(rep.attainment, lang),
            color: rep.attainment >= 1 ? 'Good' : rep.attainment >= 0.8 ? 'Warning' : 'Attention',
            weight: 'Bolder',
          },
        ],
      },
    ],
  }));

  return {
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    type: 'AdaptiveCard',
    version: '1.5',
    body: [
      buildHeader(s.sales.performance.title, lang),
      performance.length === 0
        ? { type: 'TextBlock', text: s.sales.performance.no_data, isSubtle: true }
        : { type: 'Container', items: rows },
      buildFooter('CRM', lang),
    ],
  };
}

/**
 * Build a deal detail card for a single deal.
 *
 * @param deal - The detailed deal record
 * @param lang - Display language
 * @returns Adaptive Card JSON object
 */
export function buildDealDetailCard(deal: DealDetail, lang: Lang): AdaptiveCard {
  const s = t(lang);
  return {
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    type: 'AdaptiveCard',
    version: '1.5',
    body: [
      buildHeader(s.sales.deal.title, lang),
      {
        type: 'TextBlock',
        text: deal.name,
        size: 'Large',
        weight: 'Bolder',
        wrap: true,
        ...(lang === 'he' ? { rtl: true } : {}),
      },
      {
        type: 'FactSet',
        facts: [
          { title: s.sales.deal.account, value: deal.accountName },
          { title: s.sales.deal.owner, value: deal.ownerName },
          { title: s.sales.deal.value, value: formatCurrency(deal.value, 'USD', lang) },
          { title: s.sales.deal.stage, value: deal.stage },
          { title: s.sales.deal.close_date, value: formatDate(deal.closeDate, lang) },
          { title: s.sales.deal.status, value: deal.isAtRisk ? '⚠️ At Risk' : '✅ On Track' },
          ...(deal.nextStep ? [{ title: 'Next Step', value: deal.nextStep }] : []),
        ],
        ...(lang === 'he' ? { rtl: true } : {}),
      },
      buildFooter('CRM', lang),
    ],
  };
}

/**
 * Build an inventory alert card showing stock levels with severity indicators.
 *
 * @param items - Array of stock items to display
 * @param lang - Display language
 * @param criticalThreshold - Below this is CRITICAL (default: 10)
 * @returns Adaptive Card JSON object
 */
export function buildInventoryAlertCard(
  items: StockItem[],
  lang: Lang,
  criticalThreshold: number = 10,
): AdaptiveCard {
  const s = t(lang);
  const hasCritical = items.some((i) => i.onHand <= criticalThreshold);

  const rows = items.map((item) => {
    const severity = getStockSeverity(item.onHand, item.minimumLevel, criticalThreshold);
    const emoji = severity === 'critical' ? '🔴' : severity === 'low' ? '🟡' : '🟢';
    const color = severity === 'critical' ? 'Attention' : severity === 'low' ? 'Warning' : 'Good';

    return {
      type: 'ColumnSet',
      separator: true,
      columns: [
        {
          type: 'Column',
          width: 'auto',
          items: [{ type: 'TextBlock', text: emoji, size: 'Medium' }],
        },
        {
          type: 'Column',
          width: 'stretch',
          items: [
            {
              type: 'TextBlock',
              text: `**${item.skuCode}** — ${item.productName}`,
              wrap: true,
              ...(lang === 'he' ? { rtl: true } : {}),
            },
            {
              type: 'TextBlock',
              text: `${s.inventory.on_hand}: ${formatNumber(item.onHand, lang)} · ${s.inventory.minimum_level}: ${formatNumber(item.minimumLevel, lang)}`,
              isSubtle: true,
              size: 'Small',
              color,
              ...(lang === 'he' ? { rtl: true } : {}),
            },
            ...(item.daysToStockout
              ? [
                  {
                    type: 'TextBlock',
                    text: `${s.inventory.days_to_stockout}: ${item.daysToStockout}`,
                    color,
                    size: 'Small',
                    weight: 'Bolder',
                  },
                ]
              : []),
          ],
        },
      ],
    };
  });

  return {
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    type: 'AdaptiveCard',
    version: '1.5',
    body: [
      buildHeader(hasCritical ? s.alerts.critical_stock.title : s.alerts.low_stock.title, lang),
      items.length === 0
        ? { type: 'TextBlock', text: s.inventory.no_low_stock, color: 'Good', wrap: true }
        : { type: 'Container', items: rows },
      buildFooter('Inventory', lang),
    ],
  };
}

/**
 * Build a single SKU stock detail card.
 *
 * @param item - The stock item to display
 * @param lang - Display language
 * @returns Adaptive Card JSON object
 */
export function buildStockDetailCard(item: StockItem, lang: Lang): AdaptiveCard {
  const s = t(lang);
  const severity = getStockSeverity(item.onHand, item.minimumLevel);
  const emoji = severity === 'critical' ? '🔴' : severity === 'low' ? '🟡' : '🟢';

  return {
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    type: 'AdaptiveCard',
    version: '1.5',
    body: [
      buildHeader(`${emoji} ${s.inventory.title}`, lang),
      {
        type: 'TextBlock',
        text: `**${item.skuCode}** — ${item.productName}`,
        size: 'Large',
        weight: 'Bolder',
        wrap: true,
        ...(lang === 'he' ? { rtl: true } : {}),
      },
      {
        type: 'FactSet',
        facts: [
          { title: s.inventory.sku, value: item.skuCode },
          { title: s.inventory.on_hand, value: `${formatNumber(item.onHand, lang)} units` },
          {
            title: s.inventory.minimum_level,
            value: `${formatNumber(item.minimumLevel, lang)} units`,
          },
          ...(item.warehouseName
            ? [{ title: s.inventory.warehouse, value: item.warehouseName }]
            : []),
          ...(item.daysToStockout
            ? [{ title: s.inventory.days_to_stockout, value: String(item.daysToStockout) }]
            : []),
          ...(item.lastMovementDate
            ? [{ title: 'Last Movement', value: formatDate(item.lastMovementDate, lang) }]
            : []),
        ],
        ...(lang === 'he' ? { rtl: true } : {}),
      },
      buildFooter('Inventory', lang),
    ],
  };
}

/**
 * Build a purchase order status detail card.
 *
 * @param po - The purchase order record
 * @param lang - Display language
 * @returns Adaptive Card JSON object
 */
export function buildPOStatusCard(po: PurchaseOrder, lang: Lang): AdaptiveCard {
  const s = t(lang);
  const badge = STATUS_BADGE[po.status] ?? '📋';
  const isOverdue = po.isOverdue;

  return {
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    type: 'AdaptiveCard',
    version: '1.5',
    body: [
      buildHeader(s.procurement.po_status.title, lang),
      {
        type: 'TextBlock',
        text: `**${po.poNumber}**`,
        size: 'Large',
        weight: 'Bolder',
      },
      ...(isOverdue
        ? [
            {
              type: 'TextBlock',
              text: s.procurement.po_status.overdue_warning,
              color: 'Attention',
              weight: 'Bolder',
              ...(lang === 'he' ? { rtl: true } : {}),
            },
          ]
        : []),
      {
        type: 'FactSet',
        facts: [
          { title: s.procurement.po_status.supplier, value: po.supplier },
          {
            title: s.procurement.po_status.value,
            value: formatCurrency(po.value, po.currency, lang),
          },
          { title: 'Status', value: `${badge} ${po.status}` },
          {
            title: s.procurement.po_status.expected_date,
            value: formatDate(po.expectedDate, lang),
          },
          { title: s.procurement.po_status.line_items, value: String(po.lineItems) },
          ...(po.supplierContact
            ? [{ title: s.procurement.po_status.contact, value: po.supplierContact }]
            : []),
          ...(isOverdue && po.daysOverdue
            ? [{ title: 'Days Overdue', value: String(po.daysOverdue) }]
            : []),
        ],
        ...(lang === 'he' ? { rtl: true } : {}),
      },
      buildFooter('ERP', lang),
    ],
  };
}

/**
 * Build a pending approvals list card with action buttons.
 *
 * @param pos - Array of purchase orders pending approval
 * @param lang - Display language
 * @returns Adaptive Card JSON object
 */
export function buildApprovalListCard(pos: PurchaseOrder[], lang: Lang): AdaptiveCard {
  const s = t(lang);

  const rows = pos.map((po) => ({
    type: 'Container',
    style: 'emphasis',
    separator: true,
    items: [
      {
        type: 'ColumnSet',
        columns: [
          {
            type: 'Column',
            width: 'stretch',
            items: [
              { type: 'TextBlock', text: `**${po.poNumber}**`, weight: 'Bolder' },
              {
                type: 'TextBlock',
                text: `${po.supplier} · ${formatCurrency(po.value, po.currency, lang)}`,
                isSubtle: true,
                size: 'Small',
              },
            ],
          },
          {
            type: 'Column',
            width: 'auto',
            items: [{ type: 'TextBlock', text: formatDate(po.expectedDate, lang), size: 'Small' }],
          },
        ],
      },
      {
        type: 'TextBlock',
        text: s.procurement.approvals.approve_action,
        isSubtle: true,
        size: 'Small',
        wrap: true,
        ...(lang === 'he' ? { rtl: true } : {}),
      },
    ],
  }));

  return {
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    type: 'AdaptiveCard',
    version: '1.5',
    body: [
      buildHeader(s.procurement.approvals.title, lang),
      pos.length === 0
        ? {
            type: 'TextBlock',
            text: s.procurement.approvals.none_pending,
            color: 'Good',
            wrap: true,
          }
        : {
            type: 'Container',
            items: [
              {
                type: 'TextBlock',
                text: `${formatNumber(pos.length, lang)} ${s.procurement.approvals.count}`,
                color: 'Warning',
                weight: 'Bolder',
              },
              ...rows,
            ],
          },
      buildFooter('ERP', lang),
    ],
  };
}

/**
 * Build a supplier list card.
 *
 * @param suppliers - Array of supplier records
 * @param lang - Display language
 * @returns Adaptive Card JSON object
 */
export function buildSupplierCard(suppliers: Supplier[], lang: Lang): AdaptiveCard {
  const s = t(lang);

  const rows = suppliers.map((sup) => ({
    type: 'ColumnSet',
    separator: true,
    columns: [
      {
        type: 'Column',
        width: 'stretch',
        items: [
          { type: 'TextBlock', text: `**${sup.name}**`, weight: 'Bolder', wrap: true },
          {
            type: 'TextBlock',
            text: `${sup.category}${sup.country ? ` · ${sup.country}` : ''}`,
            isSubtle: true,
            size: 'Small',
          },
          ...(sup.email
            ? [{ type: 'TextBlock', text: `📧 ${sup.email}`, size: 'Small', wrap: true }]
            : []),
          ...(sup.phone ? [{ type: 'TextBlock', text: `📞 ${sup.phone}`, size: 'Small' }] : []),
        ],
      },
      ...(sup.rating
        ? [
            {
              type: 'Column',
              width: 'auto',
              items: [
                {
                  type: 'TextBlock',
                  text: `⭐ ${sup.rating.toFixed(1)}`,
                  weight: 'Bolder',
                  color: 'Good',
                },
              ],
            },
          ]
        : []),
    ],
  }));

  return {
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    type: 'AdaptiveCard',
    version: '1.5',
    body: [
      buildHeader(s.procurement.supplier.title, lang),
      suppliers.length === 0
        ? { type: 'TextBlock', text: s.procurement.supplier.no_suppliers, isSubtle: true }
        : { type: 'Container', items: rows },
      buildFooter('ERP', lang),
    ],
  };
}

/**
 * Build a friendly error card.
 *
 * @param errorMessage - Human-readable error description
 * @param lang - Display language
 * @returns Adaptive Card JSON object
 */
export function buildErrorCard(errorMessage: string, lang: Lang): AdaptiveCard {
  return {
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    type: 'AdaptiveCard',
    version: '1.5',
    body: [
      {
        type: 'Container',
        style: 'attention',
        bleed: true,
        items: [
          {
            type: 'TextBlock',
            text: '⚠️ Error',
            size: 'Large',
            weight: 'Bolder',
            color: 'Attention',
          },
        ],
      },
      {
        type: 'TextBlock',
        text: errorMessage,
        wrap: true,
        spacing: 'Medium',
        ...(lang === 'he' ? { rtl: true } : {}),
      },
      {
        type: 'TextBlock',
        text: lang === 'he' ? heStrings.common.unknown_command : enStrings.common.unknown_command,
        wrap: true,
        isSubtle: true,
        ...(lang === 'he' ? { rtl: true } : {}),
      },
    ],
    actions: [
      {
        type: 'Action.Submit',
        title: lang === 'he' ? 'עזרה' : 'Help',
        data: { action: 'quick_query', query: 'help' },
      },
    ],
  };
}

/**
 * Build a bilingual help card listing all available commands.
 *
 * @param lang - Display language
 * @returns Adaptive Card JSON object
 */
export function buildHelpCard(lang: Lang): AdaptiveCard {
  const s = t(lang);
  const isHe = lang === 'he';

  const commandSections = [
    {
      title: isHe ? '📊 מודיעין מכירות' : '📊 Sales Intelligence',
      commands: isHe
        ? ['מה ערך הפייפליין הרבעוני?', 'הצג לי עסקאות הנסגרות החודש', 'מי נציג המכירות המוביל?']
        : [
            'What is the total pipeline value for Q3?',
            'Show me deals closing this month',
            'Which rep has the highest revenue?',
          ],
    },
    {
      title: isHe ? '🏭 ניהול מלאי' : '🏭 Inventory Management',
      commands: isHe
        ? ['אילו פריטים מתחת לרמת מלאי מינימלית?', 'הצג מלאי ל-SKU-0042', 'כמה יחידות יש לנו?']
        : [
            'What items are below minimum stock?',
            'Show inventory for SKU-0042',
            'How many units do we have?',
          ],
    },
    {
      title: isHe ? '📦 תמיכה ברכש' : '📦 Procurement Support',
      commands: isHe
        ? ['מה הסטטוס של PO-20250618?', 'אילו הזמנות ממתינות לאישור?', 'רשימת ספקים לאלקטרוניקה']
        : [
            'What is the status of PO-20250618?',
            'Which POs need my approval?',
            'List suppliers for electronics',
          ],
    },
    {
      title: isHe ? '🌐 הגדרות שפה' : '🌐 Language Settings',
      commands: ['/lang en — English', '/lang he — עברית'],
    },
  ];

  const sectionItems = commandSections.flatMap((section) => [
    {
      type: 'TextBlock',
      text: section.title,
      weight: 'Bolder',
      spacing: 'Medium',
      ...(isHe ? { rtl: true } : {}),
    },
    ...section.commands.map((cmd) => ({
      type: 'TextBlock',
      text: `• ${cmd}`,
      isSubtle: true,
      wrap: true,
      ...(isHe ? { rtl: true } : {}),
    })),
  ]);

  return {
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    type: 'AdaptiveCard',
    version: '1.5',
    body: [
      buildHeader(s.help.title, lang),
      {
        type: 'TextBlock',
        text: s.help.commands,
        wrap: true,
        ...(isHe ? { rtl: true } : {}),
      },
      { type: 'Container', items: sectionItems },
      buildFooter('BIAgent', lang),
    ],
    actions: [
      {
        type: 'Action.Submit',
        title: isHe ? 'דוח מכירות' : 'Sales Report',
        data: { action: 'quick_query', query: 'show me the sales pipeline' },
      },
      {
        type: 'Action.Submit',
        title: isHe ? 'מצב מלאי' : 'Inventory Status',
        data: { action: 'quick_query', query: 'show inventory status' },
      },
    ],
  };
}

// Export daysBetween for use in handlers
export { daysBetween };
