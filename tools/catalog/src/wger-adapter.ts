import { exerciseSchema, type Exercise } from "@mechastudio/domain";

const WGER_ORIGIN = "https://wger.de";
const firstPage = `${WGER_ORIGIN}/api/v2/exerciseinfo/?limit=100`;
const MAX_PAGES = 100;

interface WgerPage {
  readonly next?: string | null;
  readonly results?: readonly WgerExercise[];
}

interface WgerExercise {
  readonly id?: number;
  readonly uuid?: string;
  readonly last_update?: string;
  readonly license_author?: string;
  readonly translations?: readonly WgerTranslation[];
}

interface WgerTranslation {
  readonly language?: number | string | { readonly short_name?: string };
  readonly name?: string;
  readonly description?: string;
  readonly license?: { readonly title?: string; readonly url?: string } | string;
  readonly license_title?: string;
  readonly license_object_url?: string;
}

export async function fetchWgerCatalog(fetcher: typeof fetch = fetch): Promise<WgerPage> {
  const results: WgerExercise[] = [];
  let next: string | null = firstPage;
  for (let page = 0; next && page < MAX_PAGES; page += 1) {
    const url = allowlistedWgerUrl(next);
    const response = await fetcher(url, {
      headers: { Accept: "application/json", "User-Agent": "PlanAndTrainCatalog/1.0" },
      redirect: "error",
    });
    if (!response.ok) throw new Error(`wger request failed with status ${response.status}`);
    const data = (await response.json()) as WgerPage;
    if (!Array.isArray(data.results)) throw new Error("wger returned an invalid results page");
    results.push(...data.results);
    next = data.next ?? null;
  }
  if (next) throw new Error(`wger catalog exceeded the ${MAX_PAGES}-page safety limit`);
  return { next: null, results };
}

export function normalizeWgerCatalog(raw: unknown): Exercise[] {
  if (!raw || typeof raw !== "object" || !Array.isArray((raw as WgerPage).results))
    throw new Error("Invalid wger catalog payload");
  const now = new Date().toISOString();
  const exercises: Exercise[] = [];
  for (const record of (raw as WgerPage).results ?? []) {
    const translation = record.translations?.find((item) => isEnglish(item.language));
    const name = translation?.name?.trim();
    const externalId = record.uuid?.trim() || (record.id === undefined ? "" : String(record.id));
    if (!name || !externalId) continue;
    const description = plainText(translation?.description ?? "");
    const license =
      typeof translation?.license === "string"
        ? translation.license
        : (translation?.license?.title ?? translation?.license_title);
    const licenseUrl =
      typeof translation?.license === "object" ? translation.license.url : translation?.license_object_url;
    exercises.push(
      exerciseSchema.parse({
        id: `catalog-wger-${externalId}`,
        name,
        ...(description ? { description } : {}),
        origin: "catalog",
        provider: "wger",
        externalId,
        locale: "en",
        ...(record.last_update ? { sourceUpdatedAt: new Date(record.last_update).toISOString() } : {}),
        ...(record.license_author ? { author: record.license_author.trim() } : {}),
        ...(license ? { license } : {}),
        ...(licenseUrl && isHttpUrl(licenseUrl) ? { licenseUrl } : {}),
        sourceUrl: `${WGER_ORIGIN}/exercise/${encodeURIComponent(externalId)}/view`,
        archived: false,
        createdAt: now,
        updatedAt: now,
      }),
    );
  }
  return exercises.sort((left, right) => left.name.localeCompare(right.name));
}

function allowlistedWgerUrl(value: string): string {
  const url = new URL(value, WGER_ORIGIN);
  if (url.protocol !== "https:" || url.origin !== WGER_ORIGIN || !url.pathname.startsWith("/api/v2/exerciseinfo/")) {
    throw new Error("wger pagination returned a URL outside the allowlist");
  }
  return url.toString();
}

function isEnglish(language: WgerTranslation["language"]): boolean {
  return language === 2 || language === "en" || (typeof language === "object" && language?.short_name === "en");
}

function plainText(value: string): string {
  return value
    .replace(/<\s*br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .replace(/\s+([.,;:!?])/g, "$1")
    .trim()
    .slice(0, 500);
}

function isHttpUrl(value: string): boolean {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}
