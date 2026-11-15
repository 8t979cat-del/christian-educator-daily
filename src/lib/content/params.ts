import { CATEGORY_SLUGS, GRADE_BAND_VALUES, STATUSES, type DevotionalStatus } from "./options";
import { isValidIsoDate } from "./dates";

type Raw = string | string[] | undefined;
const one = (value: Raw): string => (Array.isArray(value) ? (value[0] ?? "") : (value ?? ""));

/** Reads URL search parameters defensively: anything unrecognised becomes "not set". */
export function readSearchParams(sp: Record<string, Raw>) {
  const status = one(sp.status);
  const category = one(sp.category);
  const grade = one(sp.grade);
  const theme = one(sp.theme);
  const from = one(sp.from);
  const to = one(sp.to);
  const page = Number.parseInt(one(sp.page), 10);
  return {
    query: one(sp.q).trim().slice(0, 200),
    status: (STATUSES as readonly string[]).includes(status) ? (status as DevotionalStatus) : undefined,
    category: CATEGORY_SLUGS.includes(category) ? category : undefined,
    grade: GRADE_BAND_VALUES.includes(grade) ? grade : undefined,
    theme: /^[0-9a-f-]{36}$/i.test(theme) ? theme : undefined,
    from: isValidIsoDate(from) ? from : undefined,
    to: isValidIsoDate(to) ? to : undefined,
    page: Number.isFinite(page) && page > 0 && page < 10_000 ? page : 1,
  };
}

export const toQueryString = (params: Record<string, string | number | undefined>): string => {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "" && v !== 1) qs.set(k, String(v));
  const text = qs.toString();
  return text ? `?${text}` : "";
};
