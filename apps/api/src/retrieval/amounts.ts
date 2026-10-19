/* ============================================================================
 * FILE MAP
 * FILE    : apps/api/src/retrieval/amounts.ts
 * PURPOSE : Detect dollar amounts in free text in any number format ($18,995,
 *           18.995 USD, Arabic digits). Used by the exact amount search and by
 *           the test suite.
 * PARTS   : (in the code, search for the text PART n with Ctrl+F)
 *    1. Number normalisation (Arabic and Persian digits, thousands separators)
 *    2. Get dollar amounts from the text
 *    3. How amounts are written on the page (1000 and 1,000)
 *    4. Check whether the text contains a given amount
 * ============================================================================ */

// ===== PART 1: Number normalisation (Arabic and Persian digits, thousands separators) =====
/**
 * Dollar amounts written in free text, in any number format. Shared by the exact-match lookup (what the visitor wrote)
 * and by the test suite (what the answer wrote).
 */
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

/** Digits in any script become 0-9; a separator followed by exactly three digits (a thousands separator) is removed. */
export function normalizeNumbers(text: string): string {
  const ascii = text.replace(/[٠-٩۰-۹]/g, (d) => String(Math.max(ARABIC_DIGITS.indexOf(d), PERSIAN_DIGITS.indexOf(d))));
  return ascii.replace(/(?<=\d)[.,٫٬   ](?=\d{3}(?!\d))/g, "");
}

// ===== PART 2: Get dollar amounts from the text =====
/** Dollar amounts written in the text, as digit strings: "$18,995", "$ 18.995", "18995 USD", "USD 30,000", "50 dolares". */
export function dollarAmounts(text: string): string[] {
  const t = normalizeNumbers(text);
  const out: string[] = [];
  for (const m of t.matchAll(/\$\s?(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s?(?:USD|US\$|dollars?|dolar|dólares|دولار)|USD\s?(\d+(?:\.\d+)?)/gi)) {
    out.push(m[1] ?? m[2] ?? m[3] ?? "");
  }
  return out.filter(Boolean);
}

// ===== PART 3: How amounts are written on the page (1000 and 1,000) =====
/** The ways an amount is written in the page text: "1000" and "1,000". */
export function writtenForms(amount: string): string[] {
  const n = Number(amount);
  const forms = [amount];
  if (Number.isInteger(n) && n >= 1000) forms.push(n.toLocaleString("en-US"));
  return forms;
}

// ===== PART 4: Check whether the text contains a given amount =====
/** True when the text contains the amount written with a dollar sign, as a whole number ("$50" yes, "$500" and "$50,000" no). */
export function mentionsDollarAmount(text: string, amount: string): boolean {
  return writtenForms(amount).some((form) => new RegExp(`\\$\\s?${form.replace(/[.,]/g, (c) => `\\${c}`)}(?!\\d|,\\d)`).test(text));
}
