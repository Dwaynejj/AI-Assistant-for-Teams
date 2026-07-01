/**
 * @file intentParser.ts
 * @description Classify incoming messages into intent categories.
 * Uses Azure AI Language CLU as the primary classifier (via dynamic import),
 * with a keyword-based fallback for resilience when CLU is unavailable.
 *
 * Supported intents span Sales, Inventory, and Procurement domains in both EN and HE.
 */

import { detectLanguage } from './languageDetector';
import { extractEntities, Entities } from './entities';
import { getConfig } from '../utils/config';

/** All supported intent identifiers */
export type IntentKey =
  | 'SALES_PIPELINE'
  | 'SALES_PERFORMANCE'
  | 'SALES_DEAL_DETAIL'
  | 'INVENTORY_LEVELS'
  | 'INVENTORY_ALERTS'
  | 'INVENTORY_SKU'
  | 'PROCUREMENT_PO_STATUS'
  | 'PROCUREMENT_APPROVALS'
  | 'PROCUREMENT_SUPPLIER'
  | 'HELP'
  | 'LANG_SWITCH'
  | 'UNKNOWN';

/** The result of intent parsing, including extracted entities */
export interface ParsedIntent {
  intent: IntentKey;
  confidence: number;
  entities: Entities;
  rawText: string;
  detectedLanguage: 'en' | 'he';
}

/**
 * Keyword mappings for fallback intent classification.
 * Each entry contains English and Hebrew keyword arrays.
 */
const INTENT_KEYWORDS: Record<IntentKey, { en: string[]; he: string[] }> = {
  SALES_PIPELINE: {
    en: ['pipeline', 'forecast', 'opportunities', 'funnel', 'deals closing', 'closing this month'],
    he: ['פייפליין', 'תחזית', 'הזדמנויות', 'עסקאות נסגרות'],
  },
  SALES_PERFORMANCE: {
    en: [
      'performance',
      'quota',
      'revenue',
      'rep',
      'win rate',
      'attainment',
      'leaderboard',
      'top rep',
    ],
    he: ['ביצועים', 'מכסה', 'הכנסות', 'נציג', 'שיעור ניצחון', 'דירוג'],
  },
  SALES_DEAL_DETAIL: {
    en: ['deal status', 'deal detail', 'specific deal', 'deal id', 'opportunity'],
    he: ['סטטוס עסקה', 'פרטי עסקה', 'לקוח ספציפי'],
  },
  INVENTORY_LEVELS: {
    en: ['stock', 'inventory', 'on hand', 'units', 'warehouse', 'stock level', 'available'],
    he: ['מלאי', 'יחידות', 'כמות', 'מחסן', 'רמת מלאי'],
  },
  INVENTORY_ALERTS: {
    en: ['low stock', 'shortage', 'critical', 'stockout', 'below minimum', 'running low'],
    he: ['מלאי נמוך', 'מחסור', 'קריטי', 'אזל', 'מתחת למינימום', 'מלאי מינימלי', 'ירידת מלאי'],
  },
  INVENTORY_SKU: {
    en: ['sku', 'product code', 'item number', 'product id'],
    he: ['קוד מוצר', 'פריט', 'מקט', 'מספר פריט'],
  },
  PROCUREMENT_PO_STATUS: {
    en: ['purchase order', 'po status', 'po-', 'order status', 'delivery', 'grn'],
    he: ['הזמנת רכש', 'סטטוס הזמנה', 'אספקה', 'קבלת סחורה'],
  },
  PROCUREMENT_APPROVALS: {
    en: ['approval', 'pending', 'awaiting', 'approve', 'my approvals', 'pending approval'],
    he: ['אישור', 'ממתין', 'לאישור', 'אישורים שלי', 'ממתין לאישור'],
  },
  PROCUREMENT_SUPPLIER: {
    en: ['supplier', 'vendor', 'contact', 'supplier list', 'vendor info'],
    he: ['ספק', 'ליצור קשר', 'רשימת ספקים', 'פרטי ספק'],
  },
  HELP: {
    en: ['help', 'what can you do', 'commands', 'how to', 'guide', 'instructions'],
    he: ['עזרה', 'מה אתה יכול', 'פקודות', 'הוראות', 'מדריך'],
  },
  LANG_SWITCH: {
    en: ['/lang en', '/lang he'],
    he: ['/lang en', '/lang he'],
  },
  UNKNOWN: { en: [], he: [] },
};

/**
 * Classify text using keyword matching as a fallback.
 * Returns the best-matching intent and a heuristic confidence score.
 *
 * @param text - The sanitised input text
 * @param language - The detected language for keyword selection
 * @returns Intent key and confidence
 */
function keywordFallbackClassify(
  text: string,
  language: 'en' | 'he',
): { intent: IntentKey; confidence: number } {
  const lower = text.toLowerCase();
  let bestIntent: IntentKey = 'UNKNOWN';
  let bestScore = 0;

  for (const intentKey of Object.keys(INTENT_KEYWORDS) as IntentKey[]) {
    if (intentKey === 'UNKNOWN') continue;

    const { en, he } = INTENT_KEYWORDS[intentKey];
    const keywords = language === 'he' ? [...he, ...en] : en;
    let score = 0;
    for (const kw of keywords) {
      if (lower.includes(kw.toLowerCase())) score++;
    }

    if (score > bestScore) {
      bestScore = score;
      bestIntent = intentKey;
    }
  }

  // Normalise score to a 0-1 confidence range
  const confidence = bestScore > 0 ? Math.min(0.5 + bestScore * 0.1, 0.9) : 0.1;
  return { intent: bestIntent, confidence };
}

/**
 * CLU intent name → IntentKey mapping
 */
const CLU_INTENT_MAP: Record<string, IntentKey> = {
  SalesPipeline: 'SALES_PIPELINE',
  SalesPerformance: 'SALES_PERFORMANCE',
  SalesDealDetail: 'SALES_DEAL_DETAIL',
  InventoryLevels: 'INVENTORY_LEVELS',
  InventoryAlerts: 'INVENTORY_ALERTS',
  InventorySku: 'INVENTORY_SKU',
  ProcurementPoStatus: 'PROCUREMENT_PO_STATUS',
  ProcurementApprovals: 'PROCUREMENT_APPROVALS',
  ProcurementSupplier: 'PROCUREMENT_SUPPLIER',
  Help: 'HELP',
  LanguageSwitch: 'LANG_SWITCH',
};

/**
 * Attempt to classify intent using Azure AI Language CLU service.
 * Uses dynamic import to avoid compile-time dependency on the CLU SDK.
 *
 * @param text - The user message text
 * @param language - The detected language
 * @returns Intent and confidence from CLU, or undefined if CLU is unavailable
 */
async function cluClassify(
  text: string,
  language: 'en' | 'he',
): Promise<{ intent: IntentKey; confidence: number } | undefined> {
  const config = getConfig();

  if (
    !config.azureLanguageEndpoint ||
    !config.azureLanguageKey ||
    !config.azureCluProjectName ||
    !config.azureCluDeploymentName
  ) {
    return undefined;
  }

  /* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unnecessary-type-assertion */
  try {
    // Dynamic import: @azure/ai-language-conversations contains ConversationAnalysisClient
    // This package ships with newer versions of the Azure AI SDK
    const { ConversationAnalysisClient, AzureKeyCredential } =
      await import('@azure/ai-language-conversations');

    const client = new ConversationAnalysisClient(
      config.azureLanguageEndpoint,
      new AzureKeyCredential(config.azureLanguageKey),
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = await client.analyzeConversation({
      kind: 'Conversation',
      analysisInput: {
        conversationItem: {
          id: '1',
          participantId: 'user',
          text,
          language: language === 'he' ? 'he' : 'en-us',
        },
      },
      parameters: {
        projectName: config.azureCluProjectName,
        deploymentName: config.azureCluDeploymentName,
      },
    });

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const prediction = result.result?.prediction;
    if (!prediction) return undefined;

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const topIntent: string = prediction.topIntent ?? '';
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
    const intentObj = (prediction.intents as any[])?.find((i: any) => i.category === topIntent);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const confidence: number = intentObj?.confidenceScore ?? 0.5;

    const mappedIntent: IntentKey = CLU_INTENT_MAP[topIntent] ?? 'UNKNOWN';
    return { intent: mappedIntent, confidence };
  } catch {
    // CLU unavailable — caller will fall back to keyword matching
    return undefined;
  }
  /* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unnecessary-type-assertion */
}

/**
 * Parse a user message into a structured ParsedIntent object.
 * Uses CLU as the primary classifier, keyword matching as fallback.
 *
 * @param rawText - The raw user message from Teams
 * @param knownRepNames - Optional list of known rep names for entity extraction
 * @returns A fully-populated ParsedIntent object
 */
export async function parseIntent(
  rawText: string,
  knownRepNames: string[] = [],
): Promise<ParsedIntent> {
  const langResult = await detectLanguage(rawText);
  const language = langResult.language;
  const entities = extractEntities(rawText, knownRepNames);

  // Language switch command — short-circuit
  if (entities.language) {
    return {
      intent: 'LANG_SWITCH',
      confidence: 1.0,
      entities,
      rawText,
      detectedLanguage: language,
    };
  }

  // Try CLU first
  let classification = await cluClassify(rawText, language);

  // Fall back to keyword matching if CLU is unavailable or low-confidence
  if (!classification || classification.confidence < 0.6) {
    const fallback = keywordFallbackClassify(rawText, language);
    // Use fallback if CLU failed or scored lower
    if (!classification || fallback.confidence > classification.confidence) {
      classification = fallback;
    }
  }

  return {
    intent: classification.intent,
    confidence: classification.confidence,
    entities,
    rawText,
    detectedLanguage: language,
  };
}
