import { useMutation } from "@tanstack/react-query";
import { AuthSchemas } from "@auto-tm/contracts";

import { apiClient,ApiError } from "../client";
import { beginSignInMeasurement } from "../../measurement/nativeMeasurement";

export function useVerifyOtp() {
  return useMutation({
    mutationFn: async (input: AuthSchemas.OtpVerifyRequest) => {
      const measurement=beginSignInMeasurement("email" in input?"email":"phone");
      try {
        return await apiClient.post("/auth/otp/verify", input, AuthSchemas.OtpVerifyResponseSchema, {auth:false,headers:measurement.headers});
      } catch(error) {
        if(error instanceof TypeError || (error instanceof ApiError && error.code==="NETWORK_ERROR"))measurement.transportFailure();
        throw error;
      }
    },
  });
}
