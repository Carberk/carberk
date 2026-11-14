import { useMutation } from "@tanstack/react-query";
import { AuthSchemas } from "@auto-tm/contracts";

import { apiClient } from "../client";

export function useVerifyOtp() {
  return useMutation({
    retry: false,
    networkMode: "always",
    mutationFn: (input: AuthSchemas.OtpVerifyRequest) =>
      apiClient.post(
        "/auth/otp/verify",
        input,
        AuthSchemas.OtpVerifyResponseSchema,
        { auth: false },
      ),
  });
}
