// DO NOT MERGE — Redline validation seed (anti-slop rules).
import { ActionSheetIOS, Dimensions, StyleSheet } from 'react-native';
// SEED 1 [HIGH] (react-native/deep-import) private path with no stability contract
import TextInputState from 'react-native/Libraries/Components/TextInput/TextInputState';

// SEED 2 [HIGH] (react-native/cached-window-dimensions) read once, wrong after rotation
const { width } = Dimensions.get('window');
export const styles = StyleSheet.create({ card: { width: width - 32 } });

export function pickPhoto(onPick: (i: number) => void) {
  // SEED 3 [HIGH] (react-native/unguarded-platform-api) iOS-only API in a shared file
  ActionSheetIOS.showActionSheetWithOptions({ options: ['Camera', 'Library', 'Cancel'] }, onPick);
}

export const blur = () => TextInputState.blurTextInput(TextInputState.currentlyFocusedInput());
