const SINGLE_CHAR_KOREAN_SURNAMES = new Set(
  "김이박최정강조윤장임한오서신권황안송전홍유고문양손배백허남심노하곽성차주우구민류나진지엄채원천방공현함염여추도소석선설마길표명기반왕금옥육인맹제모탁국어은편용예봉경".split(""),
);

const COMPOUND_KOREAN_SURNAMES = ["남궁", "황보", "제갈", "사공", "선우", "서문", "독고", "동방"];
const NAME_DECORATOR_PATTERN =
  /(대표님|대표|사장님|사장|회장님|회장|실장님|실장|팀장님|팀장|선배님|선배|오빠|형님|형|누나|언니|님|씨|군|양)$/;
const NAME_PARTICLE_PATTERN = /(에게는|에게|한테는|한테|께서는|께서|으로|로|와|과|은|는|이|가|을|를|의|도|만)$/;
type KoreanFullNameParts = { surname: string; given: string; key: string };

function stripTrailingKoreanNameNoise(value: string) {
  let current = value;
  for (let pass = 0; pass < 3; pass += 1) {
    const before = current;
    current = current.replace(NAME_DECORATOR_PATTERN, "");
    const particleStripped = current.replace(NAME_PARTICLE_PATTERN, "");
    if (particleStripped.length >= 2) current = particleStripped;
    if (current === before) break;
  }
  return current;
}

export function cleanCharacterDisplayName(name: string) {
  const text = String(name || "")
    .replace(/[“”"'‘’『』「」()[\]{}]/g, "")
    .trim()
    .replace(/\s+/g, " ");
  if (!/[가-힣]/.test(text)) return text;
  return stripTrailingKoreanNameNoise(text.replace(/\s+/g, ""));
}

export function normalizeCharacterNameKey(name: string) {
  return cleanCharacterDisplayName(name).toLowerCase();
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

function getFullNameParts(key: string): KoreanFullNameParts | null {
  const parts = splitKoreanFullNameKey(key);
  return parts ? { ...parts, key } : null;
}

function uniqueNameKeys(names: Iterable<string>) {
  return [...new Set([...names].map((name) => normalizeCharacterNameKey(name)).filter(Boolean))];
}

export function normalizedCharacterNameKeys(names: Iterable<string>) {
  return uniqueNameKeys(names);
}

function fullNamePartsFromKeys(keys: string[]) {
  return keys.map(getFullNameParts).filter((parts): parts is KoreanFullNameParts => Boolean(parts));
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
  const aName = cleanCharacterDisplayName(a);
  const bName = cleanCharacterDisplayName(b);
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

export function ambiguousKoreanGivenNameKeys(nameSets: Iterable<Iterable<string>>) {
  const fullKeysByGiven = new Map<string, Set<string>>();
  for (const names of nameSets) {
    for (const key of uniqueNameKeys(names)) {
      const parts = getFullNameParts(key);
      if (!parts) continue;
      const set = fullKeysByGiven.get(parts.given) ?? new Set<string>();
      set.add(parts.key);
      fullKeysByGiven.set(parts.given, set);
    }
  }
  return new Set(
    [...fullKeysByGiven.entries()]
      .filter(([, fullKeys]) => fullKeys.size > 1)
      .map(([given]) => given),
  );
}

function hasConflictingFullNames(aFullNames: KoreanFullNameParts[], bFullNames: KoreanFullNameParts[]) {
  return aFullNames.some((a) =>
    bFullNames.some((b) => a.given === b.given && a.key !== b.key),
  );
}

function namesMatchWithContext(aKey: string, bKey: string, blockedGivenKeys: ReadonlySet<string>) {
  if (aKey === bKey) return true;
  const aParts = getFullNameParts(aKey);
  const bParts = getFullNameParts(bKey);
  if (aParts && aParts.given === bKey) return !blockedGivenKeys.has(aParts.given);
  if (bParts && bParts.given === aKey) return !blockedGivenKeys.has(bParts.given);
  return false;
}

function nameKeysMarkedSeparate(
  aKeys: string[],
  bKeys: string[],
  aExcludedKeys: string[],
  bExcludedKeys: string[],
) {
  const aExcluded = new Set(aExcludedKeys);
  const bExcluded = new Set(bExcludedKeys);
  return aKeys.some((key) => bExcluded.has(key)) || bKeys.some((key) => aExcluded.has(key));
}

export function characterNameSetsMarkedSeparate(
  aNames: Iterable<string>,
  bNames: Iterable<string>,
  aExcludedNames: Iterable<string> = [],
  bExcludedNames: Iterable<string> = [],
) {
  return nameKeysMarkedSeparate(
    uniqueNameKeys(aNames),
    uniqueNameKeys(bNames),
    uniqueNameKeys(aExcludedNames),
    uniqueNameKeys(bExcludedNames),
  );
}

export function characterNameSetsLikelySame(
  aNames: Iterable<string>,
  bNames: Iterable<string>,
  options: {
    blockedGivenKeys?: ReadonlySet<string>;
    aExcludedNames?: Iterable<string>;
    bExcludedNames?: Iterable<string>;
  } = {},
) {
  const aKeys = uniqueNameKeys(aNames);
  const bKeys = uniqueNameKeys(bNames);
  if (!aKeys.length || !bKeys.length) return false;

  if (
    nameKeysMarkedSeparate(
      aKeys,
      bKeys,
      uniqueNameKeys(options.aExcludedNames ?? []),
      uniqueNameKeys(options.bExcludedNames ?? []),
    )
  ) {
    return false;
  }

  const aFullNames = fullNamePartsFromKeys(aKeys);
  const bFullNames = fullNamePartsFromKeys(bKeys);
  const conflictsByFullName = hasConflictingFullNames(aFullNames, bFullNames);
  const sharesSameFullName = aFullNames.some((a) => bFullNames.some((b) => a.key === b.key));

  if (conflictsByFullName && !sharesSameFullName) return false;

  const blockedGivenKeys = options.blockedGivenKeys ?? new Set<string>();
  return aKeys.some((aKey) => bKeys.some((bKey) => namesMatchWithContext(aKey, bKey, blockedGivenKeys)));
}
