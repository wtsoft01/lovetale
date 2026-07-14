const SINGLE_CHAR_KOREAN_SURNAMES = new Set(
  "김이박최정강조윤장임한오서신권황안송전홍유고문양손배백허남심노하곽성차주우구민류나진지엄채원천방공현함염여추도소석선설마길표명기반왕금옥육인맹제모탁국어은편용예봉경".split(""),
);

const COMPOUND_KOREAN_SURNAMES = ["남궁", "황보", "제갈", "사공", "선우", "서문", "독고", "동방"];

export function normalizeCharacterNameKey(name: string) {
  return String(name || "")
    .replace(/[“”"'‘’『』「」()[\]{}]/g, "")
    .replace(/\s+/g, "")
    .trim()
    .toLowerCase();
}

function splitKoreanFullNameKey(key: string) {
  if (!/^[가-힣]{3,6}$/.test(key)) return null;

  const compoundSurname = COMPOUND_KOREAN_SURNAMES.find((surname) => key.startsWith(surname));
  if (compoundSurname) {
    const given = key.slice(compoundSurname.length);
    return given.length >= 2 ? { surname: compoundSurname, given } : null;
  }

  const surname = key[0];
  if (!SINGLE_CHAR_KOREAN_SURNAMES.has(surname)) return null;
  const given = key.slice(1);
  return given.length >= 2 ? { surname, given } : null;
}

export function characterNameAliasKeys(name: string) {
  const key = normalizeCharacterNameKey(name);
  if (!key) return [];
  const parts = splitKoreanFullNameKey(key);
  return parts ? [key, parts.given] : [key];
}

export function characterNamesLikelySame(a: string, b: string) {
  const aKey = normalizeCharacterNameKey(a);
  const bKey = normalizeCharacterNameKey(b);
  if (!aKey || !bKey) return false;
  if (aKey === bKey) return true;

  const aParts = splitKoreanFullNameKey(aKey);
  const bParts = splitKoreanFullNameKey(bKey);
  if (aParts && aParts.given === bKey) return true;
  if (bParts && bParts.given === aKey) return true;
  return false;
}

export function preferredCharacterDisplayName(a: string, b: string) {
  const aName = String(a || "").trim();
  const bName = String(b || "").trim();
  if (!aName) return bName;
  if (!bName) return aName;
  if (!characterNamesLikelySame(aName, bName)) return aName;

  const aKey = normalizeCharacterNameKey(aName);
  const bKey = normalizeCharacterNameKey(bName);
  const aParts = splitKoreanFullNameKey(aKey);
  const bParts = splitKoreanFullNameKey(bKey);
  if (aParts && aParts.given === bKey) return aName;
  if (bParts && bParts.given === aKey) return bName;
  return aName.length >= bName.length ? aName : bName;
}
