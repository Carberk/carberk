import { useMutation } from "@tanstack/react-query";
import { AuthSchemas } from "@auto-tm/contracts";

import { apiClient } from "../client";

export function useRequestOtp() {
  return useMutation({
    retry: false,
    networkMode: "always",
    mutationFn: (input: AuthSchemas.OtpRequestRequest) =>
      apiClient.post(
        "/auth/otp/request",
        input,
        AuthSchemas.OtpRequestResponseSchema,
        { auth: false },
      ),
  });
}
