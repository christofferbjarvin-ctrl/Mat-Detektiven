import { StyleSheet, Text, View, Pressable, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';

const NOVA_INFO = [
  {
    group: 1,
    color: '#4CAF50',
    bgColor: '#E8F5E9',
    emoji: '🥦',
    title: 'NOVA 1',
    subtitle: 'Ubearbeidet',
    description: 'Frukt, grønnsaker, egg, kjøtt og fisk uten tilsetninger.',
  },
  {
    group: 2,
    color: '#66BB6A',
    bgColor: '#F1F8E9',
    emoji: '🧈',
    title: 'NOVA 2',
    subtitle: 'Lite bearbeidet',
    description: 'Olje, smør, sukker, salt, mel og pasta.',
  },
  {
    group: 3,
    color: '#FFA000',
    bgColor: '#FFF8E1',
    emoji: '🧀',
    title: 'NOVA 3',
    subtitle: 'Bearbeidet',
    description: 'Hermetikk, ost, brød og røkt fisk.',
  },
  {
    group: 4,
    color: '#E53935',
    bgColor: '#FFEBEE',
    emoji: '🍕',
    title: 'NOVA 4',
    subtitle: 'Ultrabearbeidet',
    description: 'Brus, pølser, chips og frossenpizza.',
  },
];

export default function HomeScreen() {
  const router = useRouter();

  return (
    <ScrollView style={styles.scroll} bounces={false}>
      <LinearGradient
        colors={['#2E7D32', '#43A047', '#66BB6A']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <Text style={styles.heroEmoji}>🔍🥑</Text>
        <Text style={styles.heroTitle}>Mat-Detektiven</Text>
        <Text style={styles.heroSubtitle}>
          Skann strekkoder og finn ut hvor bearbeidet maten din egentlig er
        </Text>
      </LinearGradient>

      <View style={styles.content}>
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Hva er NOVA-skalaen?</Text>
          <Text style={styles.infoText}>
            NOVA klassifiserer mat i fire grupper basert på grad av industriell bearbeiding. Jo høyere gruppe, jo mer bearbeidet.
          </Text>
        </View>

        {NOVA_INFO.map((item) => (
          <View key={item.group} style={[styles.novaCard, { backgroundColor: item.bgColor }]}>
            <View style={styles.novaCardHeader}>
              <Text style={styles.novaEmoji}>{item.emoji}</Text>
              <View style={styles.novaCardTitles}>
                <Text style={[styles.novaCardTitle, { color: item.color }]}>{item.title}</Text>
                <Text style={styles.novaCardSubtitle}>{item.subtitle}</Text>
              </View>
              <View style={[styles.novaIndicator, { backgroundColor: item.color }]} />
            </View>
            <Text style={styles.novaCardDescription}>{item.description}</Text>
          </View>
        ))}

        <Pressable onPress={() => router.push('/scan')}>
          <LinearGradient
            colors={['#2E7D32', '#43A047']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.scanButton}
          >
            <Text style={styles.scanIcon}>📷</Text>
            <Text style={styles.scanButtonText}>Skann en vare</Text>
          </LinearGradient>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  hero: {
    paddingTop: 70,
    paddingBottom: 36,
    paddingHorizontal: 28,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  heroEmoji: {
    fontSize: 44,
    marginBottom: 12,
  },
  heroTitle: {
    fontSize: 38,
    fontWeight: '900',
    color: '#fff',
    marginBottom: 8,
  },
  heroSubtitle: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.9)',
    lineHeight: 23,
  },
  content: {
    padding: 20,
    paddingTop: 24,
    paddingBottom: 40,
  },
  infoCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 21,
  },
  novaCard: {
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
  },
  novaCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  novaEmoji: {
    fontSize: 28,
    marginRight: 12,
  },
  novaCardTitles: {
    flex: 1,
  },
  novaCardTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  novaCardSubtitle: {
    fontSize: 13,
    color: '#555',
    fontWeight: '500',
  },
  novaIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  novaCardDescription: {
    fontSize: 13,
    color: '#555',
    lineHeight: 19,
    marginLeft: 40,
  },
  scanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    borderRadius: 14,
    marginTop: 10,
    shadowColor: '#2E7D32',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  scanIcon: {
    fontSize: 22,
    marginRight: 10,
  },
  scanButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
});
