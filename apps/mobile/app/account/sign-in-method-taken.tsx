import { useLocalSearchParams } from "expo-router";

import { SignInMethodTakenState } from "../../components/account/SignInMethodTakenState";

// The confirmed value belongs to another User (SIGN_IN_METHOD_TAKEN). The code
// screen replaces itself with this one on top of Profile, so every Back returns
// there; nothing on the account changed.
export default function SignInMethodTakenScreen() {
  const { method } = useLocalSearchParams<{ method?: string }>();

  return <SignInMethodTakenState method={method === "email" ? "email" : "phone"} />;
}
