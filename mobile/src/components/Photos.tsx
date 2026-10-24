import { Image } from "expo-image";
import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { absoluteUrl, authHeaders } from "@/lib/api";
import { pickPhotos, type PickedPhoto } from "@/lib/photos";
import { colors, radius } from "@/lib/theme";

/** An image from the API. Sends the sign-in token, because job photos are private. */
export function ApiImage({ path, style }: { path: string; style: StyleProp<ViewStyle> }) {
  return <Image source={{ uri: absoluteUrl(path), headers: authHeaders() }} style={style as never} contentFit="cover" transition={150} />;
}

/** Tap a photo to see it full screen. */
export function PhotoThumb({ path, label, size }: { path: string; label?: string | null; size?: number }) {
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();
  return (
    <>
      <Pressable onPress={() => setOpen(true)} style={[st.thumb, size ? { width: size, height: size } : st.thumbGrid]}>
        <ApiImage path={path} style={StyleSheet.absoluteFill} />
        {label ? (
          <Text numberOfLines={1} style={st.thumbLabel}>
            {label}
          </Text>
        ) : null}
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={st.viewer} onPress={() => setOpen(false)}>
          <Image source={{ uri: absoluteUrl(path), headers: authHeaders() }} style={st.viewerImage} contentFit="contain" />
          {label ? <Text style={[st.viewerLabel, { bottom: insets.bottom + 24 }]}>{label}</Text> : null}
          <Text style={[st.viewerClose, { top: insets.top + 12 }]}>✕</Text>
        </Pressable>
      </Modal>
    </>
  );
}

export function PhotoGallery({ photos }: { photos: { id: number; label: string | null; url: string }[] }) {
  if (!photos.length) return null;
  return (
    <View style={st.grid}>
      {photos.map((p) => (
        <PhotoThumb key={p.id} path={p.url} label={p.label} />
      ))}
    </View>
  );
}

/** Take or choose photos. Images are shrunk on the phone before upload. */
export function PhotoPicker({ photos, onChange, max = 10 }: { photos: PickedPhoto[]; onChange: (p: PickedPhoto[]) => void; max?: number }) {
  const [busy, setBusy] = useState(false);
  const full = photos.length >= max;

  async function add(source: "camera" | "library") {
    setBusy(true);
    try {
      const picked = await pickPhotos(source, max - photos.length);
      if (picked.length) onChange([...photos, ...picked]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: 8 }}>
      <View style={st.grid}>
        {photos.map((p, i) => (
          <View key={p.uri} style={[st.thumb, st.thumbGrid]}>
            <Image source={{ uri: p.uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
            <Pressable onPress={() => onChange(photos.filter((_, j) => j !== i))} style={st.remove} accessibilityLabel="Remove photo" hitSlop={8}>
              <Text style={st.removeText}>×</Text>
            </Pressable>
          </View>
        ))}
        {!full && (
          <Pressable onPress={() => add("camera")} disabled={busy} style={[st.thumbGrid, st.add]}>
            <Text style={st.addIcon}>📷</Text>
            <Text style={st.addText}>{busy ? "Adding…" : "Take photo"}</Text>
          </Pressable>
        )}
      </View>
      {!full && (
        <Text onPress={() => add("library")} style={st.library}>
          or choose from your photos
        </Text>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  thumb: { borderRadius: radius.md, overflow: "hidden", backgroundColor: colors.tint },
  thumbGrid: { width: "31.5%", aspectRatio: 1 },
  thumbLabel: { position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.55)", color: colors.white, fontSize: 11, paddingHorizontal: 6, paddingVertical: 2 },
  remove: { position: "absolute", top: 6, right: 6, width: 26, height: 26, borderRadius: 13, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center" },
  removeText: { color: colors.white, fontSize: 18, lineHeight: 20 },
  add: { borderRadius: radius.md, borderWidth: 2, borderStyle: "dashed", borderColor: "rgba(16,185,138,0.45)", backgroundColor: colors.brand50, alignItems: "center", justifyContent: "center", gap: 4 },
  addIcon: { fontSize: 26 },
  addText: { fontSize: 12, fontWeight: "600", color: colors.brand700 },
  library: { fontSize: 14, fontWeight: "600", color: colors.brand700, paddingVertical: 4 },
  viewer: { flex: 1, backgroundColor: "rgba(0,0,0,0.92)", justifyContent: "center" },
  viewerImage: { width: "100%", height: "80%" },
  viewerLabel: { position: "absolute", left: 20, right: 20, color: colors.white, textAlign: "center", fontSize: 15 },
  viewerClose: { position: "absolute", right: 20, color: colors.white, fontSize: 24 },
});
