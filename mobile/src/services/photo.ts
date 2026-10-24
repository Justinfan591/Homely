import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { Platform } from "react-native";
import type { PhotoInput } from "@shared/scope-client";

const MAX_EDGE = 1568;

/**
 * Shrinks the long edge to 1568 px and re-encodes as JPEG before upload. The server only
 * accepts JPEG/PNG/WebP/GIF, and iPhone library photos are often HEIC.
 */
export async function preparePhoto(uri: string): Promise<PhotoInput> {
  let out = uri;
  try {
    // Decodes at most MAX_EDGE on the long side (keeps the aspect ratio, never upscales).
    const image = await ImageManipulator.manipulate(uri, { maxWidth: MAX_EDGE, maxHeight: MAX_EDGE }).renderAsync();
    const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
    out = saved.uri;
  } catch {
    // Upload the original; the server explains if the format isn't supported.
  }
  if (Platform.OS === "web") return await (await fetch(out)).blob();
  return { uri: out, name: "photo.jpg", type: "image/jpeg" };
}
