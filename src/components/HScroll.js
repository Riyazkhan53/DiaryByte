import { ScrollView, StyleSheet } from 'react-native';

/**
 * A horizontal scrolling row (filter chips, thumbnails, posters).
 *
 * React Native's ScrollView may shrink by default, so in a column taller
 * than the screen a horizontal row gets squeezed to a sliver and its chips'
 * text is cut off. This one keeps its full height.
 */
export default function HScroll({ style, ...props }) {
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} {...props} style={[styles.row, style]} />;
}

const styles = StyleSheet.create({
  row: { flexGrow: 0, flexShrink: 0 },
});
