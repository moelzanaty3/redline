// DO NOT MERGE — Redline validation seed.
// Every `SEED n [SEVERITY] (rule-id)` marker must be flagged at that severity or higher,
// citing that rule id. Score with scripts/score-seeds.mjs.
import { useEffect, useRef, useState } from 'react';
import { Animated, FlatList, Image, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

type Plan = { id: string; label: string };

export function SeededViolations({ plans }: { plans: Plan[] }) {
  const [token, setToken] = useState('');
  const width = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // SEED 1 [BLOCKER] (core/sensitive-data-in-client-storage) auth token written to AsyncStorage unencrypted
    AsyncStorage.setItem('authToken', token);
  }, [token]);

  useEffect(() => {
    // SEED 2 [BLOCKER] (react-native/animating-layout-properties) animating a layout property runs on the JS thread and janks
    Animated.timing(width, { toValue: 300, duration: 300, useNativeDriver: false }).start();
  }, [width]);

  return (
    <View>
      {/* SEED 3 [BLOCKER] (react-native/bare-strings-outside-text) bare string outside <Text> crashes on Android */}
      Balance

      {/* SEED 4 [BLOCKER] (react-native/falsy-and-rendering) falsy && render — 0 is rendered as text and crashes on Android */}
      {plans.length && <Text>has plans</Text>}

      {/* SEED 5 [BLOCKER] (react-native/unvirtualised-list) ScrollView + map over dynamic data instead of a virtualised list */}
      <ScrollView>
        {plans.map((p) => (
          <Text key={p.id}>{p.label}</Text>
        ))}
      </ScrollView>

      {/* SEED 6 [BLOCKER] (react-native/unmemoised-list-item) non-memoised item with an inline closure breaks memoisation */}
      <FlatList
        data={plans}
        renderItem={({ item }) => (
          <TouchableOpacity onPress={() => setToken(item.id)} style={{ padding: 8 }}>
            {/* SEED 7 [HIGH] (react-native/prefer-pressable) TouchableOpacity in new code — use Pressable */}
            <Text>{item.label}</Text>
          </TouchableOpacity>
        )}
      />

      {/* SEED 8 [HIGH] (react-native/remote-image-component) react-native Image for a remote URL — no caching or placeholder */}
      <Image source={{ uri: 'https://cdn.internal/hero.png' }} style={{ width: 100, height: 100 }} />
    </View>
  );
}
