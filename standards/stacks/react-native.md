# React Native Review Rules

All React rules apply. Additionally:

## BLOCKER — request changes

- `react-native/unvirtualised-list` — **Large lists without virtualization.** `ScrollView` + `.map()` over dynamic data, or `FlatList` where FlashList is the project standard — require FlashList (or FlatList minimum) for lists that can exceed ~20 items.
- `react-native/unmemoised-list-item` — **Non-memoized list item components** — every list item must be `React.memo` with stable callback references (no inline arrow closures over changing values passed to items).
- `react-native/animating-layout-properties` — **Animating layout properties** (`width`, `height`, `top`, `left`, `margin`) — animations must use `transform` and `opacity` only; layout properties run on the JS thread and jank.
- `react-native/bare-strings-outside-text` — **Bare strings outside `<Text>`** — crashes on Android.
- `react-native/falsy-and-rendering` — **Falsy `&&` rendering** (`count && <X/>`) — renders `0`/`NaN` as text and crashes on Android; require ternary.
- `react-native/blocking-gesture-handler` — **Blocking the JS thread in gesture/scroll handlers** — heavy work in `onScroll` without Reanimated worklets or throttling.

## HIGH

- `react-native/inline-props-in-list-items` — Inline style objects / inline functions in list item props — hoist or memoize; breaks item memoization.
- `react-native/remote-image-component` — `Image` from react-native for remote images where `expo-image` is available — no caching, no placeholder handling.
- `react-native/prefer-pressable` — `TouchableOpacity` in new code — use `Pressable`.
- `react-native/js-navigator` — JS-based navigators where native stack (`@react-navigation/native-stack`) is available.
- `react-native/missing-safe-area` — Missing safe-area handling in full-screen ScrollViews.
- `react-native/measure-over-onlayout` — `measure()` calls where `onLayout` suffices.
- `react-native/native-dep-in-shared-package` — Native dependencies added to shared monorepo packages instead of the app package.
- `react-native/reanimated-shared-value-misuse` — Reanimated shared values read during render or mutated outside worklets/handlers.

## SUGGESTION

- `react-native/intl-in-render` — `Intl.NumberFormat` / `Intl.DateTimeFormat` created inside render or loops — hoist to module scope.
- `react-native/missing-getitemtype` — Heterogeneous lists without `getItemType` (FlashList).
- `react-native/derived-animation-in-render` — Derived animation values computed in render instead of `useDerivedValue`.
