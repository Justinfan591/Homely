import * as Location from "expo-location";
import { Platform } from "react-native";
import { api } from "@/services";

export type AddressResult = { address: string; lat: number; lng: number } | { error: "denied" | "blocked" | "unavailable" };

/** "12 Main St, Toronto" from the phone's own geocoder, or null if it has nothing useful. */
function format(a: Location.LocationGeocodedAddress | undefined): string | null {
  if (!a) return null;
  const street = [a.streetNumber, a.street].filter(Boolean).join(" ") || a.name;
  const city = a.city ?? a.subregion ?? a.region;
  return [street, city].filter(Boolean).join(", ") || null;
}

/**
 * Asks for location permission (when in use only) and turns the current position into an address.
 * The phone's geocoder first; the server's when the phone has none (web) or finds nothing.
 */
export async function currentAddress(): Promise<AddressResult> {
  try {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) return { error: perm.canAskAgain ? "denied" : "blocked" };
    const { coords } = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    let address: string | null = null;
    if (Platform.OS !== "web") {
      address = format((await Location.reverseGeocodeAsync(coords).catch(() => []))[0]);
    }
    address ??= await api.reverseGeocode(coords.latitude, coords.longitude).catch(() => null);
    return address ? { address, lat: coords.latitude, lng: coords.longitude } : { error: "unavailable" };
  } catch (e) {
    console.warn("Couldn't get the current location", e);
    return { error: "unavailable" };
  }
}
