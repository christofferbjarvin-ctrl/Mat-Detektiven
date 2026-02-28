import { CameraView, useCameraPermissions } from 'expo-camera';
import { Image } from 'expo-image';
import { useState, useCallback, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  Modal,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';

type Nutrition = {
  kcal: number | null;
  fat: number | null;
  protein: number | null;
  carbs: number | null;
};

type Product = {
  name: string;
  novaGroup: number | null;
  novaEstimated: boolean;
  ingredients: string;
  nutrition: Nutrition;
  categories: string[];
};

type KassalCategory = {
  id: number;
  name: string;
};

type Alternative = {
  name: string;
  novaGroup: number;
  imageUrl: string | null;
  ingredients: string;
};

type AlternativeResult = {
  alternatives: Alternative[];
  targetNova: number;
};

// NOVA 4 markers
const NOVA4_MARKERS = [
  'aspartam', 'sukralose', 'acesulfam', 'sakkarin', 'cyklamat',
  'glukose-fruktosesirup', 'high-fructose', 'isoglukose', 'maltodekstrin',
  'emulgator', 'lecitin', 'mono- og diglyserider', 'polysorbat',
  'karragenan', 'xantangummi', 'guargummi',
  'fargestoff', 'karamellfarve', 'titandioksid', 'e1', 'e4',
  'natriumbenzoat', 'kaliumsorbat', 'natriumnitritt', 'nitritt', 'nitrat',
  'sorbinsyre', 'benzosyre',
  'glutamat', 'smaksforsterker', 'natriumglutamat',
  'hydrogenert', 'interesterifisert',
  'proteinhydrolysat', 'proteinisolat', 'kaseinat', 'invertsukker',
  'modifisert stivelse', 'aroma',
];

const NOVA3_MARKERS = [
  'sukker', 'salt', 'olje', 'smør', 'eddik', 'sirup',
  'konservert', 'røkt', 'hermetisert',
];

function estimateNova(ingredients: string): number {
  const text = ingredients.toLowerCase();
  if (NOVA4_MARKERS.some((m) => text.includes(m))) return 4;
  const nova3Count = NOVA3_MARKERS.filter((m) => text.includes(m)).length;
  if (nova3Count >= 2) return 3;
  if (text.split(/,/).length <= 3) return 1;
  return 2;
}

const NOVA_COLORS: Record<number, string> = {
  1: '#4CAF50',
  2: '#4CAF50',
  3: '#FFC107',
  4: '#F44336',
};

const NOVA_LABELS: Record<number, string> = {
  1: 'Ubearbeidet',
  2: 'Lite bearbeidet',
  3: 'Bearbeidet',
  4: 'Ultrabearbeidet',
};

function highlightNova4Markers(text: string): { text: string; isMarker: boolean }[] {
  const lowerText = text.toLowerCase();
  const segments: { text: string; isMarker: boolean }[] = [];
  // Build a list of all marker matches with their positions
  const matches: { start: number; end: number }[] = [];

  for (const marker of NOVA4_MARKERS) {
    let searchFrom = 0;
    while (true) {
      const idx = lowerText.indexOf(marker, searchFrom);
      if (idx === -1) break;
      matches.push({ start: idx, end: idx + marker.length });
      searchFrom = idx + 1;
    }
  }

  if (matches.length === 0) {
    return [{ text, isMarker: false }];
  }

  // Sort by start position, then by longest match first
  matches.sort((a, b) => a.start - b.start || b.end - a.end);

  // Merge overlapping matches
  const merged: { start: number; end: number }[] = [matches[0]];
  for (let i = 1; i < matches.length; i++) {
    const last = merged[merged.length - 1];
    if (matches[i].start <= last.end) {
      last.end = Math.max(last.end, matches[i].end);
    } else {
      merged.push(matches[i]);
    }
  }

  // Build segments
  let cursor = 0;
  for (const m of merged) {
    if (cursor < m.start) {
      segments.push({ text: text.slice(cursor, m.start), isMarker: false });
    }
    segments.push({ text: text.slice(m.start, m.end), isMarker: true });
    cursor = m.end;
  }
  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), isMarker: false });
  }

  return segments;
}

function HighlightedIngredients({ text, isNova4 }: { text: string; isNova4: boolean }) {
  if (!isNova4) {
    return <Text style={styles.ingredients}>{text}</Text>;
  }

  const segments = highlightNova4Markers(text);
  const hasMarkers = segments.some((s) => s.isMarker);

  return (
    <View style={{ alignSelf: 'flex-start' as const }}>
      <Text style={styles.ingredients}>
        {segments.map((seg, i) =>
          seg.isMarker ? (
            <Text key={i} style={styles.markedIngredient}>{seg.text}</Text>
          ) : (
            <Text key={i}>{seg.text}</Text>
          )
        )}
      </Text>
      {hasMarkers && (
        <Text style={styles.markerHint}>
          Markerte ingredienser indikerer ultrabearbeidede tilsetningsstoffer
        </Text>
      )}
    </View>
  );
}

const KASSAL_API_KEY = 'g9NOjtCkK8kW9orWpl0XQva4D9Jow1BKTHsAVF4S';

async function fetchFromOpenFoodFacts(barcode: string): Promise<(Product & { _raw?: any }) | null> {
  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${barcode}.json`
    );
    const data = await res.json();
    if (data.status !== 1 || !data.product) return null;

    const p = data.product;
    const nova = typeof p.nova_group === 'number' ? p.nova_group
      : typeof p.nova_groups === 'number' ? p.nova_groups
      : null;
    const name = p.product_name || p.product_name_nb || p.product_name_no || '';
    const ingredients = p.ingredients_text || p.ingredients_text_nb || p.ingredients_text_no || '';
    if (!name) return null;

    const n = p.nutriments || {};
    const nutrition: Nutrition = {
      kcal: n['energy-kcal_100g'] ?? null,
      fat: n['fat_100g'] ?? null,
      protein: n['proteins_100g'] ?? null,
      carbs: n['carbohydrates_100g'] ?? null,
    };

    const categories: string[] = p.categories_tags || [];

    return {
      name,
      novaGroup: nova,
      novaEstimated: false,
      ingredients: ingredients || 'Ingen ingredienser tilgjengelig',
      nutrition,
      categories,
    };
  } catch {
    return null;
  }
}

async function fetchFromKassal(barcode: string): Promise<(Product & { kassalCategories: KassalCategory[] }) | null> {
  try {
    const res = await fetch(
      `https://kassal.app/api/v1/products/ean/${barcode}`,
      { headers: { Authorization: `Bearer ${KASSAL_API_KEY}` } }
    );
    const data = await res.json();
    const products = data?.data?.products;
    if (!products || products.length === 0) return null;

    const p = products[0];
    const kassalCategories: KassalCategory[] = (p.category || []).map((c: any) => ({
      id: c.id,
      name: c.name,
    }));

    return {
      name: p.name || 'Ukjent produkt',
      novaGroup: null,
      novaEstimated: false,
      ingredients: p.ingredients || 'Ingen ingredienser tilgjengelig',
      nutrition: { kcal: null, fat: null, protein: null, carbs: null },
      categories: [],
      kassalCategories,
    };
  } catch {
    return null;
  }
}

async function searchOffAlternatives(
  categories: string[],
  currentNova: number,
): Promise<AlternativeResult | null> {
  // Prøv ett nivå bedre først, deretter to
  const targetLevels = currentNova === 4 ? [3, 2] : currentNova === 3 ? [2, 1] : [1];
  const categoriesToTry = [...categories].reverse().slice(0, 3);

  const parseAlternatives = (products: any[], targetNova: number): Alternative[] => {
    const seen = new Set<string>();
    const alternatives: Alternative[] = [];
    for (const p of products) {
      const name = p.product_name?.trim();
      if (!name || seen.has(name.toLowerCase())) continue;
      seen.add(name.toLowerCase());
      alternatives.push({
        name,
        novaGroup: p.nova_group ?? targetNova,
        imageUrl: p.image_small_url || null,
        ingredients: p.ingredients_text || 'Ingen ingredienser tilgjengelig',
      });
      if (alternatives.length >= 3) break;
    }
    return alternatives;
  };

  for (const targetNova of targetLevels) {
    for (const category of categoriesToTry) {
      const catName = category.replace('en:', '');
      const base = `https://world.openfoodfacts.org/api/v2/search?categories_tags_en=${catName}&nova_groups_tags=${targetNova}&sort_by=unique_scans_n&page_size=10&fields=product_name,nova_group,image_small_url,ingredients_text`;

      // Kjør Norge-søk og fallback parallelt for å spare tid
      const [norwayRes, fallbackRes] = await Promise.all([
        fetch(`${base}&countries_tags_en=norway`).then(r => r.json()).catch(() => null),
        fetch(`${base}&lc=nb`).then(r => r.json()).catch(() => null),
      ]);

      // Prioriter norske resultater
      const norwayAlts = norwayRes?.products?.length > 0
        ? parseAlternatives(norwayRes.products, targetNova)
        : [];
      if (norwayAlts.length > 0) {
        return { alternatives: norwayAlts, targetNova };
      }

      const fallbackAlts = fallbackRes?.products?.length > 0
        ? parseAlternatives(fallbackRes.products, targetNova)
        : [];
      if (fallbackAlts.length > 0) {
        return { alternatives: fallbackAlts, targetNova };
      }
    }
  }
  return null;
}

async function searchKassalAlternatives(
  kassalCategories: KassalCategory[],
  currentNova: number,
  scannedName: string,
): Promise<AlternativeResult | null> {
  const category = kassalCategories[kassalCategories.length - 1];
  if (!category) return null;

  const targetNova = currentNova - 1;
  if (targetNova < 1) return null;

  const urls = [
    `https://kassal.app/api/v1/products?category_id=${category.id}&size=20`,
    `https://kassal.app/api/v1/products?search=${encodeURIComponent(category.name)}&size=20`,
  ];

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${KASSAL_API_KEY}` },
      });
      const data = await res.json();
      const products = data?.data;
      if (!products || products.length === 0) continue;

      const seen = new Set<string>();
      const alternatives: Alternative[] = [];

      for (const p of products) {
        if (!p.ingredients || !p.name) continue;
        if (p.name === scannedName) continue;
        if (seen.has(p.name.toLowerCase())) continue;

        const nova = estimateNova(p.ingredients);
        // Bare ett nivå bedre
        if (nova > targetNova) continue;

        seen.add(p.name.toLowerCase());
        alternatives.push({
          name: p.name,
          novaGroup: nova,
          imageUrl: p.image || null,
          ingredients: p.ingredients,
        });

        if (alternatives.length >= 3) break;
      }

      if (alternatives.length > 0) {
        return { alternatives, targetNova };
      }
    } catch {
      continue;
    }
  }

  return null;
}

async function searchBetterAlternatives(
  categories: string[],
  kassalCategories: KassalCategory[],
  currentNova: number,
  scannedName: string,
): Promise<AlternativeResult | null> {
  const [offResult, kassalResult] = await Promise.all([
    categories.length > 0 ? searchOffAlternatives(categories, currentNova) : null,
    kassalCategories.length > 0 ? searchKassalAlternatives(kassalCategories, currentNova, scannedName) : null,
  ]);

  // Slå sammen, Kassal først (norske varer)
  if (!kassalResult && !offResult) return null;

  const seen = new Set<string>();
  const merged: Alternative[] = [];
  const targetNova = kassalResult?.targetNova ?? offResult?.targetNova ?? currentNova - 1;

  for (const alt of [...(kassalResult?.alternatives || []), ...(offResult?.alternatives || [])]) {
    if (seen.has(alt.name.toLowerCase())) continue;
    seen.add(alt.name.toLowerCase());
    merged.push(alt);
    if (merged.length >= 3) break;
  }

  return merged.length > 0 ? { alternatives: merged, targetNova } : null;
}

type FetchResult = {
  product: Product;
  categories: string[];
  kassalCategories: KassalCategory[];
};

async function fetchProduct(barcode: string): Promise<FetchResult> {
  const [offResult, kassalResult] = await Promise.all([
    fetchFromOpenFoodFacts(barcode),
    fetchFromKassal(barcode),
  ]);

  if (!offResult && !kassalResult) {
    throw new Error('Produkt ikke funnet');
  }

  const name = offResult?.name || kassalResult?.name || 'Ukjent produkt';
  const novaFromApi = offResult?.novaGroup ?? kassalResult?.novaGroup ?? null;
  const ingredients =
    (offResult?.ingredients && offResult.ingredients !== 'Ingen ingredienser tilgjengelig'
      ? offResult.ingredients
      : kassalResult?.ingredients) || 'Ingen ingredienser tilgjengelig';

  const hasIngredients = ingredients !== 'Ingen ingredienser tilgjengelig';
  const novaGroup = novaFromApi ?? (hasIngredients ? estimateNova(ingredients) : null);
  const novaEstimated = novaFromApi === null && novaGroup !== null;

  const nutrition: Nutrition = {
    kcal: offResult?.nutrition.kcal ?? kassalResult?.nutrition.kcal ?? null,
    fat: offResult?.nutrition.fat ?? kassalResult?.nutrition.fat ?? null,
    protein: offResult?.nutrition.protein ?? kassalResult?.nutrition.protein ?? null,
    carbs: offResult?.nutrition.carbs ?? kassalResult?.nutrition.carbs ?? null,
  };

  const categories = offResult?.categories || [];
  const kassalCategories = kassalResult?.kassalCategories || [];

  const product: Product = { name, novaGroup, novaEstimated, ingredients, nutrition, categories };

  return { product, categories, kassalCategories };
}

export default function ScanScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [product, setProduct] = useState<Product | null>(null);
  const [alternatives, setAlternatives] = useState<Alternative[]>([]);
  const [noAltFound, setNoAltFound] = useState(false);
  const [expandedAlt, setExpandedAlt] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sheetVisible, setSheetVisible] = useState(false);
  const lastScannedRef = useRef<string | null>(null);

  const [altLoading, setAltLoading] = useState(false);

  const handleBarCodeScanned = useCallback(async (result: { data: string }) => {
    const barcode = result.data;
    if (lastScannedRef.current === barcode) return;
    lastScannedRef.current = barcode;

    setLoading(true);
    setError(null);
    setAlternatives([]);
    setNoAltFound(false);
    setExpandedAlt(null);
    setSheetVisible(true);

    try {
      const { product: prod, categories, kassalCategories } = await fetchProduct(barcode);
      setProduct(prod);
      setLoading(false);

      // Last alternativer i bakgrunnen
      const shouldSearch = prod.novaGroup !== null && prod.novaGroup >= 2 && (categories.length > 0 || kassalCategories.length > 0);
      if (shouldSearch) {
        setAltLoading(true);
        const altResult = await searchBetterAlternatives(categories, kassalCategories, prod.novaGroup!, prod.name);
        setAlternatives(altResult?.alternatives || []);
        setNoAltFound(!altResult);
        setAltLoading(false);
      }
    } catch {
      setError('Kunne ikke finne produktet. Prøv en annen strekkode.');
      setProduct(null);
      setLoading(false);
    }
  }, []);

  const closeSheet = () => {
    setSheetVisible(false);
    setProduct(null);
    setAlternatives([]);
    setNoAltFound(false);
    setExpandedAlt(null);
    setError(null);
    lastScannedRef.current = null;
  };

  if (!permission) {
    return <View style={styles.container} />;
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.message}>
          Vi trenger tilgang til kameraet for å skanne strekkoder
        </Text>
        <Pressable style={styles.permButton} onPress={requestPermission}>
          <Text style={styles.permButtonText}>Gi tilgang</Text>
        </Pressable>
      </View>
    );
  }

  const novaColor = product?.novaGroup
    ? NOVA_COLORS[product.novaGroup] ?? '#888'
    : '#888';

  return (
    <View style={styles.container}>
      <CameraView
        style={styles.camera}
        barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8'] }}
        onBarcodeScanned={sheetVisible ? undefined : handleBarCodeScanned}
      >
        <View style={styles.overlay}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>Tilbake</Text>
          </Pressable>

          <View style={styles.scanArea}>
            <View style={[styles.corner, styles.topLeft]} />
            <View style={[styles.corner, styles.topRight]} />
            <View style={[styles.corner, styles.bottomLeft]} />
            <View style={[styles.corner, styles.bottomRight]} />
          </View>
          <Text style={styles.hint}>Plasser strekkoden innenfor rammen</Text>
        </View>
      </CameraView>

      <Modal
        visible={sheetVisible}
        transparent
        animationType="slide"
        onRequestClose={closeSheet}
      >
        <Pressable style={styles.modalBackdrop} onPress={closeSheet} />
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />

          {loading && (
            <View style={styles.sheetContent}>
              <ActivityIndicator size="large" color="#4CAF50" />
              <Text style={styles.loadingText}>Henter produktinfo...</Text>
            </View>
          )}

          {error && (
            <View style={styles.sheetContent}>
              <Text style={styles.errorText}>{error}</Text>
              <Pressable style={styles.actionButton} onPress={closeSheet}>
                <Text style={styles.actionButtonText}>Prøv igjen</Text>
              </Pressable>
            </View>
          )}

          {product && !loading && (
            <ScrollView style={styles.sheetScroll} contentContainerStyle={styles.sheetContent}>
              <Text style={styles.productName}>{product.name}</Text>

              {product.novaGroup ? (
                <View style={[styles.novaBadge, { backgroundColor: novaColor }]}>
                  <Text style={styles.novaNumber}>NOVA {product.novaGroup}</Text>
                  <Text style={styles.novaLabel}>
                    {NOVA_LABELS[product.novaGroup]}
                    {product.novaEstimated ? ' (estimert)' : ''}
                  </Text>
                </View>
              ) : (
                <View style={[styles.novaBadge, { backgroundColor: '#888' }]}>
                  <Text style={styles.novaNumber}>NOVA ?</Text>
                  <Text style={styles.novaLabel}>Ikke tilgjengelig</Text>
                </View>
              )}

              {(product.nutrition.kcal !== null || product.nutrition.protein !== null) && (
                <View style={styles.nutritionCard}>
                  <Text style={styles.nutritionTitle}>Næringsinnhold per 100 g</Text>
                  <View style={styles.nutritionGrid}>
                    <View style={styles.nutritionItem}>
                      <Text style={styles.nutritionValue}>
                        {product.nutrition.kcal !== null ? Math.round(product.nutrition.kcal) : '—'}
                      </Text>
                      <Text style={styles.nutritionLabel}>kcal</Text>
                    </View>
                    <View style={styles.nutritionItem}>
                      <Text style={styles.nutritionValue}>
                        {product.nutrition.protein !== null ? `${product.nutrition.protein}g` : '—'}
                      </Text>
                      <Text style={styles.nutritionLabel}>Protein</Text>
                    </View>
                    <View style={styles.nutritionItem}>
                      <Text style={styles.nutritionValue}>
                        {product.nutrition.fat !== null ? `${product.nutrition.fat}g` : '—'}
                      </Text>
                      <Text style={styles.nutritionLabel}>Fett</Text>
                    </View>
                    <View style={styles.nutritionItem}>
                      <Text style={styles.nutritionValue}>
                        {product.nutrition.carbs !== null ? `${product.nutrition.carbs}g` : '—'}
                      </Text>
                      <Text style={styles.nutritionLabel}>Karbo</Text>
                    </View>
                  </View>
                </View>
              )}

              <Text style={styles.sectionTitle}>Ingredienser</Text>
              <HighlightedIngredients
                text={product.ingredients}
                isNova4={product.novaGroup === 4}
              />

              {/* Mat-Detektiven: byttet */}
              {altLoading && (
                <View style={styles.altLoadingRow}>
                  <ActivityIndicator size="small" color="#4CAF50" />
                  <Text style={styles.altLoadingText}>Søker etter bedre alternativer...</Text>
                </View>
              )}

              {noAltFound && (
                <View style={styles.noAltCard}>
                  <Text style={styles.noAltEmoji}>🤷</Text>
                  <Text style={styles.noAltText}>
                    Fant ingen bedre alternativer i denne kategorien. Alle lignende produkter har samme bearbeidingsgrad.
                  </Text>
                </View>
              )}

              {alternatives.length > 0 && (
                <View style={styles.altSection}>
                  <Text style={styles.altHeader}>Et hakk bedre valg</Text>
                  {alternatives.map((alt, index) => {
                    const color = NOVA_COLORS[alt.novaGroup] ?? '#888';
                    const isExpanded = expandedAlt === index;
                    return (
                      <View key={index} style={styles.altCard}>
                        <View style={styles.altBody}>
                          {alt.imageUrl && (
                            <Image source={{ uri: alt.imageUrl }} style={styles.altImage} />
                          )}
                          <View style={styles.altInfo}>
                            <Text style={styles.altName} numberOfLines={2}>{alt.name}</Text>
                            <View style={[styles.altNovaBadge, { backgroundColor: color }]}>
                              <Text style={styles.altNovaText}>
                                NOVA {alt.novaGroup} — {NOVA_LABELS[alt.novaGroup]}
                              </Text>
                            </View>
                          </View>
                        </View>

                        {isExpanded && (
                          <View style={styles.altDetails}>
                            <Text style={styles.altDetailsTitle}>Ingredienser</Text>
                            <Text style={styles.altDetailsText}>{alt.ingredients}</Text>
                          </View>
                        )}

                        <Pressable
                          style={styles.altToggle}
                          onPress={() => setExpandedAlt(isExpanded ? null : index)}
                        >
                          <Text style={styles.altToggleText}>
                            {isExpanded ? 'Skjul detaljer' : 'Se detaljer'}
                          </Text>
                        </Pressable>
                      </View>
                    );
                  })}
                </View>
              )}

              <Pressable style={[styles.actionButton, { marginTop: 20 }]} onPress={closeSheet}>
                <Text style={styles.actionButtonText}>Skann ny vare</Text>
              </Pressable>
            </ScrollView>
          )}
        </View>
      </Modal>
    </View>
  );
}

const CORNER_SIZE = 20;
const CORNER_WIDTH = 3;
const SCAN_AREA_SIZE = 250;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  message: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
    paddingHorizontal: 40,
  },
  permButton: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  permButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  camera: {
    flex: 1,
    width: '100%',
  },
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  backButton: {
    position: 'absolute',
    top: 56,
    left: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  backButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  scanArea: {
    width: SCAN_AREA_SIZE,
    height: SCAN_AREA_SIZE,
    backgroundColor: 'transparent',
    borderColor: 'transparent',
  },
  hint: {
    color: '#fff',
    fontSize: 14,
    marginTop: 20,
  },
  corner: {
    position: 'absolute',
    width: CORNER_SIZE,
    height: CORNER_SIZE,
  },
  topLeft: {
    top: 0,
    left: 0,
    borderTopWidth: CORNER_WIDTH,
    borderLeftWidth: CORNER_WIDTH,
    borderColor: '#fff',
  },
  topRight: {
    top: 0,
    right: 0,
    borderTopWidth: CORNER_WIDTH,
    borderRightWidth: CORNER_WIDTH,
    borderColor: '#fff',
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: CORNER_WIDTH,
    borderLeftWidth: CORNER_WIDTH,
    borderColor: '#fff',
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: CORNER_WIDTH,
    borderRightWidth: CORNER_WIDTH,
    borderColor: '#fff',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    minHeight: 300,
    maxHeight: '80%',
    paddingBottom: 40,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#ccc',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 10,
  },
  sheetScroll: {
    flex: 1,
  },
  sheetContent: {
    padding: 24,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  errorText: {
    fontSize: 16,
    color: '#F44336',
    textAlign: 'center',
    marginBottom: 16,
  },
  productName: {
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 16,
    color: '#1a1a1a',
  },
  novaBadge: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 20,
    width: '100%',
  },
  novaNumber: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '800',
  },
  novaLabel: {
    color: '#fff',
    fontSize: 14,
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  ingredients: {
    fontSize: 14,
    color: '#555',
    lineHeight: 20,
    alignSelf: 'flex-start',
  },
  markedIngredient: {
    backgroundColor: '#FFCDD2',
    color: '#C62828',
    fontWeight: '600',
    borderRadius: 2,
  },
  markerHint: {
    fontSize: 12,
    color: '#888',
    fontStyle: 'italic',
    marginTop: 6,
  },
  nutritionCard: {
    width: '100%',
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  nutritionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
    textAlign: 'center',
  },
  nutritionGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  nutritionItem: {
    alignItems: 'center',
  },
  nutritionValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  nutritionLabel: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  altLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    gap: 8,
  },
  altLoadingText: {
    fontSize: 14,
    color: '#666',
  },
  // Ingen alternativ funnet
  noAltCard: {
    width: '100%',
    backgroundColor: '#FFF3E0',
    borderRadius: 14,
    padding: 16,
    marginTop: 20,
    borderWidth: 1,
    borderColor: '#FFE0B2',
    alignItems: 'center',
  },
  noAltEmoji: {
    fontSize: 28,
    marginBottom: 8,
  },
  noAltText: {
    fontSize: 14,
    color: '#E65100',
    textAlign: 'center',
    lineHeight: 20,
  },
  // Mat-Detektiven: byttet
  altSection: {
    width: '100%',
    marginTop: 20,
  },
  altCard: {
    backgroundColor: '#E8F5E9',
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#C8E6C9',
  },
  altHeader: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2E7D32',
    marginBottom: 12,
    textAlign: 'center',
  },
  altBody: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  altImage: {
    width: 64,
    height: 64,
    borderRadius: 10,
    backgroundColor: '#fff',
    marginRight: 14,
  },
  altInfo: {
    flex: 1,
  },
  altName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 6,
  },
  altNovaBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  altNovaText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  altDetails: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#C8E6C9',
  },
  altDetailsTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  altDetailsText: {
    fontSize: 13,
    color: '#555',
    lineHeight: 19,
  },
  altToggle: {
    marginTop: 10,
    alignSelf: 'center',
  },
  altToggleText: {
    color: '#2E7D32',
    fontSize: 14,
    fontWeight: '600',
  },
  actionButton: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    alignSelf: 'center',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
