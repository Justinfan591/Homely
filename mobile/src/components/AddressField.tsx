import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type TextInputProps, type ViewStyle } from "react-native";
import type { AddressSuggestion } from "@/domain/types";
import { api } from "@/services";
import { colors, shadow } from "@/theme";
import { Field } from "./Design";
import { haptic } from "./haptics";
import { Icon } from "./Icon";
import { Text } from "./Text";

type Props = Omit<TextInputProps, "value" | "onChangeText"> & {
  label: string;
  value: string;
  /** Typing: the address is free text again (forget any picked coordinates). */
  onChangeText: (text: string) => void;
  /** A suggestion was tapped: fill the field and keep where it is. */
  onPick: (s: AddressSuggestion) => void;
  style?: StyleProp<ViewStyle>;
};

/**
 * The address field with type-ahead: after 3+ characters, up to 5 matching addresses appear in a card
 * under it. Tapping one fills the field. Typing still works if the search is down (no suggestions).
 */
export function AddressField({ label, value, onChangeText, onPick, style, onFocus, onBlur, ...input }: Props) {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);
  // Only search for what they typed (not for an address filled by a pick or the location button).
  const [query, setQuery] = useState<string | null>(null);
  const latest = useRef(0);

  useEffect(() => {
    const q = query?.trim() ?? "";
    if (q.length < 3) {
      setSuggestions([]);
      setLoading(false);
      return;
    }
    const id = ++latest.current;
    setLoading(true);
    const t = setTimeout(() => {
      api
        .searchAddresses(q)
        .catch(() => [])
        .then((found) => {
          if (id !== latest.current) return; // a newer search is on its way
          setSuggestions(found);
          setLoading(false);
        });
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  function pick(s: AddressSuggestion) {
    haptic.select();
    latest.current++;
    setQuery(null);
    setSuggestions([]);
    setLoading(false);
    onPick(s);
  }

  const open = focused && query !== null && query.trim().length >= 3 && (loading || suggestions.length > 0);

  return (
    <View style={style}>
      <Field
        label={label}
        icon="map-pin"
        value={value}
        onChangeText={(t) => {
          setQuery(t);
          onChangeText(t);
        }}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          // Let a tap on a suggestion land before the list closes.
          setTimeout(() => setFocused(false), 200);
          onBlur?.(e);
        }}
        autoComplete="street-address"
        textContentType="fullStreetAddress"
        autoCorrect={false}
        {...input}
      />
      {open ? (
        <View style={[styles.list, shadow]} accessibilityLabel="Address suggestions">
          <View style={styles.clip}>
          {suggestions.length === 0 ? (
            <View style={styles.row}>
              <ActivityIndicator color={colors.inkSoft} />
              <Text variant="caption" tone="soft">
                Looking up addresses…
              </Text>
            </View>
          ) : (
            suggestions.map((s, i) => (
              <Pressable
                key={`${s.address}-${i}`}
                accessibilityRole="button"
                accessibilityLabel={s.line2 ? `${s.line1}, ${s.line2}` : s.line1}
                onPress={() => pick(s)}
                style={({ pressed }) => [styles.row, i > 0 && styles.rule, pressed && { backgroundColor: colors.fillPressed }]}
              >
                <View style={styles.pin}>
                  <Icon name="map-pin" size={16} color={colors.ink} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text variant="label" numberOfLines={1}>
                    {s.line1}
                  </Text>
                  {s.line2 ? (
                    <Text variant="caption" tone="soft" numberOfLines={1}>
                      {s.line2}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            ))
          )}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { marginTop: 8, borderRadius: 20, backgroundColor: colors.card },
  clip: { borderRadius: 20, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12, minHeight: 56 },
  rule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  pin: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" },
});
