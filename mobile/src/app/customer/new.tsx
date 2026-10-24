import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { mutate } from "swr";
import { PhotoPicker } from "@/components/Photos";
import { Button, Card, ErrorText, Field, Heading, Input, Muted, Screen, Title } from "@/components/ui";
import { api } from "@/lib/api";
import { uploadPhotos, type PickedPhoto } from "@/lib/photos";

export default function NewRequest() {
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [description, setDescription] = useState("");
  const [address, setAddress] = useState("");
  const [zip, setZip] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!photos.length) return setError("Add at least one photo of the problem.");
    if (address.trim().length < 3) return setError("Enter the address where the work is needed.");
    if (!/^\d{5}$/.test(zip.trim())) return setError("Enter a 5-digit ZIP code.");
    setError("");
    setLoading(true);
    try {
      const { id } = await api<{ id: number }>("/api/jobs", {
        body: { address: address.trim(), zip: zip.trim(), description: description.trim() || undefined },
      });
      await uploadPhotos(id, photos);
      void mutate("/api/jobs");
      router.replace(`/customer/jobs/${id}` as never);
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }

  return (
    <Screen>
      <View style={{ gap: 4 }}>
        <Title>What needs fixing?</Title>
        <Muted>Start with a photo or two. Our assistant will ask for anything else it needs.</Muted>
      </View>

      <Card>
        <Heading>Photos of the problem</Heading>
        <Muted>One close-up and one wider shot that shows where it is usually works best.</Muted>
        <PhotoPicker photos={photos} onChange={setPhotos} max={8} />
      </Card>

      <Card style={{ gap: 14 }}>
        <Field label="Describe it in a sentence" hint="Optional, but it helps. e.g. “Water dripping under the kitchen sink since yesterday.”">
          <Input value={description} onChangeText={setDescription} multiline />
        </Field>
        <Field label="Address">
          <Input value={address} onChangeText={setAddress} placeholder="123 Main St, Apt 4" autoComplete="street-address" textContentType="fullStreetAddress" />
        </Field>
        <Field label="ZIP code">
          <Input value={zip} onChangeText={(v) => setZip(v.replace(/\D/g, "").slice(0, 5))} keyboardType="number-pad" maxLength={5} autoComplete="postal-code" textContentType="postalCode" />
        </Field>
      </Card>

      <ErrorText>{error}</ErrorText>
      <Button title="Continue" onPress={submit} loading={loading} large />
      <Muted style={{ textAlign: "center", fontSize: 12 }}>
        If you smell gas or see sparks or smoke, leave the area and call 911 or your gas company first.
      </Muted>
    </Screen>
  );
}
