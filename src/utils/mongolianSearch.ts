const normalizeSearchText = (value: string): string => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim();

const mongolianToLatin: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'j', з: 'z',
  и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', ө: 'o', п: 'p',
  р: 'r', с: 's', т: 't', у: 'u', ү: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch',
  ш: 'sh', щ: 'shch', ы: 'y', э: 'e', ю: 'yu', я: 'ya', ъ: '', ь: '',
};

const transliterateMongolian = (value: string): string => Array.from(value)
  .map((character) => mongolianToLatin[character] ?? character)
  .join('');

const hasAlternateMongolianSpelling = (value: string, query: string): boolean => {
  const variants = [value];
  for (const [source, alternatives] of [['ө', ['u']], ['ү', ['v']]] as const) {
    const currentVariants = [...variants];
    for (const variant of currentVariants) {
      if (variant.includes(source)) {
        for (const alternative of alternatives) {
          variants.push(variant.replaceAll(source, alternative));
        }
      }
    }
  }
  return variants.some((variant) => {
    const transliterated = normalizeSearchText(transliterateMongolian(variant));
    return transliterated.includes(query) || transliterated.replace(/kh/g, 'h').includes(query);
  });
};

export const matchesMongolianSearch = (value: unknown, query: string): boolean => {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return true;

  const normalizedValue = normalizeSearchText(String(value ?? ''));
  if (normalizedValue.includes(normalizedQuery)) return true;

  return hasAlternateMongolianSpelling(normalizedValue, normalizedQuery);
};