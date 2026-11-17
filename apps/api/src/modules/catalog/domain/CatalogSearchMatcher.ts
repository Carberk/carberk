









export const MIN_TYPO_LENGTH = 4;

const SCORE_EXACT = 100;
const SCORE_PREFIX = 75;
const SCORE_ONE_EDIT = 50;






export function normalizeSearchText(input: string): string {
  return input
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^0-9a-zа-я]+/g, " ")
    .trim();
}

const CYRILLIC_TO_LATIN: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ж: "zh",
  з: "z",
  и: "i",
  й: "j",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "h",
  ц: "c",
  ч: "ch",
  ш: "sh",
  щ: "sh",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
};


export function cyrillicToLatin(input: string): string {
  return input
    .split("")
    .map((ch) => CYRILLIC_TO_LATIN[ch] ?? ch)
    .join("");
}


const LATIN_TO_CYRILLIC: Array<[string, string]> = [
  ["sch", "щ"],
  ["sh", "ш"],
  ["ch", "ч"],
  ["zh", "ж"],
  ["kh", "х"],
  ["ts", "ц"],
  ["yu", "ю"],
  ["ya", "я"],
  ["a", "а"],
  ["b", "б"],
  ["c", "к"],
  ["d", "д"],
  ["e", "е"],
  ["f", "ф"],
  ["g", "г"],
  ["h", "х"],
  ["i", "и"],
  ["j", "й"],
  ["k", "к"],
  ["l", "л"],
  ["m", "м"],
  ["n", "н"],
  ["o", "о"],
  ["p", "п"],
  ["q", "к"],
  ["r", "р"],
  ["s", "с"],
  ["t", "т"],
  ["u", "у"],
  ["v", "в"],
  ["w", "в"],
  ["x", "кс"],
  ["y", "и"],
  ["z", "з"],
];


export function latinToCyrillic(input: string): string {
  let out = "";
  let i = 0;
  while (i < input.length) {
    let matched = false;
    for (const [latin, cyrillic] of LATIN_TO_CYRILLIC) {
      if (latin.length > 1 && input.startsWith(latin, i)) {
        out += cyrillic;
        i += latin.length;
        matched = true;
        break;
      }
    }
    if (matched) continue;
    const ch = input[i];
    if (ch === undefined) break;
    const single = LATIN_TO_CYRILLIC.find(
      ([latin]) => latin.length === 1 && latin === ch,
    );
    out += single ? single[1] : ch;
    i += 1;
  }
  return out;
}


export function editDistance(a: string, b: string, cap: number): number {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  let prev: number[] = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const curr: number[] = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min(
        (prev[j] ?? 0) + 1,
        (curr[j - 1] ?? 0) + 1,
        (prev[j - 1] ?? 0) + cost,
      );
      curr[j] = value;
      rowMin = Math.min(rowMin, value);
    }
    if (rowMin > cap) return cap + 1;
    prev = curr;
  }
  return prev[b.length] ?? 0;
}


function scorePair(query: string, name: string): number {
  if (query.length === 0 || name.length === 0) return 0;
  if (query === name) return SCORE_EXACT;
  if (name.startsWith(query)) return SCORE_PREFIX;
  if (
    Math.min(query.length, name.length) >= MIN_TYPO_LENGTH &&
    editDistance(query, name, 1) <= 1
  ) {
    return SCORE_ONE_EDIT;
  }
  return 0;
}

function tokens(text: string): string[] {
  return text.split(" ").filter((t) => t.length > 0);
}








export function scoreMatch(query: string, name: string): number {
  const full = scorePair(query, name);
  if (full === SCORE_EXACT) return full;

  const queryTokens = tokens(query);
  let tokenScore = 0;
  if (queryTokens.length > 1) {
    const nameTokens = tokens(name);
    let weakest = SCORE_EXACT;
    for (const qt of queryTokens) {
      let best = 0;
      for (const nt of nameTokens) {
        best = Math.max(best, scorePair(qt, nt));
        if (best === SCORE_EXACT) break;
      }
      if (best === 0) {
        weakest = 0;
        break;
      }
      weakest = Math.min(weakest, best);
    }
    tokenScore = weakest;
  }

  return Math.max(full, tokenScore);
}






export function bestNameScore(rawQuery: string, rawNames: string[]): number {
  const query = normalizeSearchText(rawQuery);
  if (query.length === 0) return 0;

  const queryVariants = new Set<string>([
    query,
    cyrillicToLatin(query),
    latinToCyrillic(query),
  ]);

  let best = 0;
  for (const rawName of rawNames) {
    const name = normalizeSearchText(rawName);
    if (name.length === 0) continue;



    best = Math.max(best, scoreMatch(query, latinToCyrillic(name)));
    if (best === SCORE_EXACT) return best;
    const nameVariants = new Set<string>([name, cyrillicToLatin(name)]);
    for (const q of queryVariants) {
      if (q.length === 0) continue;
      for (const n of nameVariants) {
        best = Math.max(best, scoreMatch(q, n));
        if (best === SCORE_EXACT) return best;
      }
    }
  }
  return best;
}
