const LIST_LINE_RE = /^\s*(?:[-*]|\u2022|\u00b7|\d+[.)]|[\u2460-\u2473])\s+/;
const SPEAKER_LINE_RE = /^\s*[\uAC00-\uD7A3A-Za-z][\uAC00-\uD7A3A-Za-z0-9 _-]{1,18}\s*[:\uFF1A]/;
const DIALOGUE_RE = /(["\u201C\u2018\u300C\u300E][^"\u201C\u201D\u2018\u2019\u300C\u300D\u300E\u300F]{2,320}["\u201D\u2019\u300D\u300F][.!?\u2026\u3002\uFF01\uFF1F]*)/g;
const SENTENCE_SPLIT_RE = /(?<=[.!?\u2026\u3002\uFF01\uFF1F]["\u201D\u2019\u300D\u300F)]?)\s+/;
const SOFT_BREAK_RE =
  /(?=\s+(?:\uADF8\uB7EC\uB098|\uD558\uC9C0\uB9CC|\uADF8\uB7F0\uB370|\uADF8\uB7EC\uC790|\uADF8\uB54C|\uC774\uC735\uACE0|\uC7A0\uC2DC|\uACE7|\uB098\uB294|\uADF8\uB294|\uADF8\uB140\uB294|\uADF8\uB9AC\uACE0|\uADF8\uB798\uB3C4)(?:\s|$))/;
const PARAGRAPH_TARGET_CHARS = 220;
const PARAGRAPH_MAX_SENTENCES = 2;

const PROOFREAD_RULES: Array<[RegExp, string]> = [
  [/\uC5B4\uB5BB\uD574/g, "\uC5B4\uB5BB\uAC8C"],
  [/\uC65C\uB9CC/g, "\uC6EC\uB9CC"],
  [/\uBA87\uC77C/g, "\uBA70\uCE60"],
  [/\uBD48\uC694/g, "\uBD10\uC694"],
  [/\uAE08\uC0C8/g, "\uAE08\uC138"],
  [/\uC5ED\uD65C/g, "\uC5ED\uD560"],
  [/\uC124\uB808\uC784/g, "\uC124\uB818"],
  [/\uBC14\uB7A8/g, "\uBC14\uB78C"],
  [/\uB418\uC694/g, "\uB3FC\uC694"],
  [/\uB418\uC11C/g, "\uB3FC\uC11C"],
  [/\uB418\uC57C/g, "\uB3FC\uC57C"],
  [/\uC548\s*\uB418\uC694/g, "\uC548 \uB3FC\uC694"],
  [/\uC548\s*\uB418([.!?\u2026]|$)/g, "\uC548 \uB3FC$1"],
];

function normalizeLine(value: string) {
  return value.replace(/[ \t]+/g, " ").trim();
}

function applyProofreadingRules(value: string) {
  let next = value;
  for (const [pattern, replacement] of PROOFREAD_RULES) {
    next = next.replace(pattern, replacement);
  }
  return next.replace(
    /([\uAC00-\uD7A3A-Za-z0-9])\s+(\uC5D0\uC11C|\uC5D0\uAC8C|\uAE4C\uC9C0|\uBD80\uD130|\uCC98\uB7FC|\uBCF4\uB2E4|\uC73C\uB85C|\uC740|\uB294|\uC774|\uAC00|\uC744|\uB97C|\uC5D0|\uC640|\uACFC|\uB85C|\uC758|\uB3C4|\uB9CC)(?=[\s,.;:!?%\]\)}\u2026\u3002\u3001\uFF0C\uFF01\uFF1F\u201D\u2019\u300D\u300F]|$)/g,
    "$1$2",
  );
}

function normalizeInlineSpacing(value: string) {
  const spaced = value
    .replace(/[ \t]+/g, " ")
    .replace(/\s+([,.;:!?%\]\)}\u2026\u3002\u3001\uFF0C\uFF01\uFF1F\u201D\u2019\u300D\u300F])/g, "$1")
    .replace(/([\[\({\u201C\u2018\u300C\u300E])\s+/g, "$1")
    .replace(/([.!?\u2026\u3002\uFF01\uFF1F])(["\u201D\u2019\u300D\u300F)]?)([^\s"'\u201D\u2019\u300D\u300F)\]}])/g, "$1$2 $3")
    .replace(/\s{2,}/g, " ");
  return applyProofreadingRules(spaced).replace(/\s{2,}/g, " ").trim();
}

function pushProseChunk(out: string[], lines: string[]) {
  if (!lines.length) return;
  const joined = normalizeInlineSpacing(lines.join(" "));
  if (!joined) return;
  out.push(...splitReadableParagraphs(joined));
  lines.length = 0;
}

function splitDialogueParts(value: string) {
  return normalizeInlineSpacing(value)
    .replace(DIALOGUE_RE, "\n$1\n")
    .split("\n")
    .map(normalizeInlineSpacing)
    .filter(Boolean);
}

function isDialoguePart(value: string) {
  return /^["\u201C\u2018\u300C\u300E]/.test(value) && /["\u201D\u2019\u300D\u300F][.!?\u2026\u3002\uFF01\uFF1F]*$/.test(value);
}

function splitSentences(value: string) {
  return value
    .split(SENTENCE_SPLIT_RE)
    .map(normalizeInlineSpacing)
    .filter(Boolean);
}

function splitLongSentence(value: string) {
  if (value.length <= PARAGRAPH_TARGET_CHARS * 1.4) return [value];

  const parts = value
    .split(SOFT_BREAK_RE)
    .map(normalizeInlineSpacing)
    .filter(Boolean);

  if (parts.length <= 1) return [value];

  const out: string[] = [];
  let current = "";
  for (const part of parts) {
    const next = normalizeInlineSpacing([current, part].filter(Boolean).join(" "));
    if (current && next.length > PARAGRAPH_TARGET_CHARS) {
      out.push(current);
      current = part;
    } else {
      current = next;
    }
  }
  if (current) out.push(current);
  return out;
}

function splitProsePart(value: string) {
  const sentences = splitSentences(value).flatMap(splitLongSentence);
  if (!sentences.length) return [];

  const out: string[] = [];
  let current: string[] = [];

  for (const sentence of sentences) {
    const candidate = normalizeInlineSpacing([...current, sentence].join(" "));
    if (
      current.length &&
      (candidate.length > PARAGRAPH_TARGET_CHARS || current.length >= PARAGRAPH_MAX_SENTENCES)
    ) {
      out.push(normalizeInlineSpacing(current.join(" ")));
      current = [sentence];
    } else {
      current.push(sentence);
    }
  }

  if (current.length) out.push(normalizeInlineSpacing(current.join(" ")));
  return out;
}

function splitReadableParagraphs(value: string) {
  const out: string[] = [];
  for (const part of splitDialogueParts(value)) {
    if (isDialoguePart(part)) {
      out.push(part);
    } else {
      out.push(...splitProsePart(part));
    }
  }
  return out.filter(Boolean);
}

function normalizeParagraphBlock(block: string) {
  const out: string[] = [];
  const proseLines: string[] = [];

  for (const rawLine of block.split("\n")) {
    const line = normalizeLine(rawLine);
    if (!line) continue;

    if (LIST_LINE_RE.test(line) || SPEAKER_LINE_RE.test(line)) {
      pushProseChunk(out, proseLines);
      out.push(normalizeInlineSpacing(line));
      continue;
    }

    proseLines.push(line);
  }

  pushProseChunk(out, proseLines);
  return out;
}

export function normalizeProseLineBreaks(value: string) {
  const normalized = String(value ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return normalized
    .split(/\n[ \t]*\n+/)
    .flatMap(normalizeParagraphBlock)
    .map(normalizeInlineSpacing)
    .filter(Boolean)
    .join("\n\n");
}

export function mapNormalizedProseOffset(value: string, offset: number) {
  const source = String(value ?? "");
  const safeOffset = Math.max(0, Math.min(source.length, Math.floor(Number(offset) || 0)));
  return normalizeProseLineBreaks(source.slice(0, safeOffset)).length;
}
