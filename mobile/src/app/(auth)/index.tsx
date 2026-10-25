import { Redirect } from "expo-router";

/** "/(auth)" itself (where web lands when signed out): the welcome screen. */
export default function AuthIndex() {
  return <Redirect href="/welcome" />;
}
