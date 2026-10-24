import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { Alert, Platform } from "react-native";
import { api } from "./api";

export type PickedPhoto = { uri: string; name: string; type: string };

const MAX_EDGE = 1568;

/** Shrinks the long edge to 1568 px and re-encodes as JPEG, same as the old web app. */
async function resize(asset: ImagePicker.ImagePickerAsset, index: number): Promise<PickedPhoto> {
  const name = `photo-${Date.now()}-${index}.jpg`;
  try {
    const ctx = ImageManipulator.manipulate(asset.uri);
    const { width, height } = asset;
    if (width && height && Math.max(width, height) > MAX_EDGE) {
      ctx.resize(width >= height ? { width: MAX_EDGE, height: null } : { width: null, height: MAX_EDGE });
    }
    const image = await ctx.renderAsync();
    const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.85 });
    return { uri: saved.uri, name, type: "image/jpeg" };
  } catch {
    // The server only accepts JPEG/PNG/WebP/GIF, so anything else (e.g. HEIC) is labelled JPEG.
    const type = asset.mimeType && /^image\/(jpeg|png|webp|gif)$/.test(asset.mimeType) ? asset.mimeType : "image/jpeg";
    return { uri: asset.uri, name: asset.fileName ?? name, type };
  }
}

/** Opens the camera or photo library and returns resized photos (empty if cancelled). */
export async function pickPhotos(source: "camera" | "library", limit: number): Promise<PickedPhoto[]> {
  if (limit <= 0) return [];
  const perm =
    source === "camera" ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    Alert.alert(
      source === "camera" ? "Camera access needed" : "Photo access needed",
      "Allow access in your phone's Settings to add photos of the problem.",
    );
    return [];
  }
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ["images"],
    quality: 1,
    // iPhones store HEIC; ask iOS for a JPEG-compatible copy in case resizing fails.
    preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
  };
  const result =
    source === "camera"
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync({ ...options, allowsMultipleSelection: limit > 1, selectionLimit: limit });
  if (result.canceled) return [];
  return Promise.all(result.assets.slice(0, limit).map(resize));
}

export async function uploadPhotos(jobId: number, photos: PickedPhoto[], labels: string[] = []) {
  if (!photos.length) return;
  const form = new FormData();
  for (const [i, p] of photos.entries()) {
    if (Platform.OS === "web") {
      form.append("photos", await (await fetch(p.uri)).blob(), p.name);
    } else {
      // React Native's FormData accepts { uri, name, type } file parts.
      form.append("photos", { uri: p.uri, name: p.name, type: p.type } as unknown as Blob);
    }
    form.append("labels", labels[i] ?? "");
  }
  await api(`/api/jobs/${jobId}/photos`, { body: form });
}

/** Shrinks a camera capture (same rules as picked photos) so uploads stay fast. */
export async function prepareCapture(pic: { uri: string; width: number; height: number }): Promise<PickedPhoto> {
  return resize({ uri: pic.uri, width: pic.width, height: pic.height, mimeType: "image/jpeg" } as ImagePicker.ImagePickerAsset, 0);
}

/** Uploads one guided shot. The server runs the vision check and returns the result. */
export async function uploadShot<T>(scanId: number, shotId: string, photo: PickedPhoto): Promise<T> {
  const form = new FormData();
  form.append("shotId", shotId);
  if (Platform.OS === "web") {
    form.append("photo", await (await fetch(photo.uri)).blob(), photo.name);
  } else {
    form.append("photo", { uri: photo.uri, name: photo.name, type: photo.type } as unknown as Blob);
  }
  return api<T>(`/api/scans/${scanId}/shots`, { body: form });
}
