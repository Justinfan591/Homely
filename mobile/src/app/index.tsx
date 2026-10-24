import { Redirect } from "expo-router";
import { useAuth } from "@/lib/auth";
import { homeFor } from "@/lib/nav";

export default function Index() {
  const { user } = useAuth();
  return <Redirect href={(user ? homeFor(user.role) : "/login") as never} />;
}
