export interface IdentityEventPayloads {
  UserRegistered: {
    userId: string;
    phone: string | null;
    email: string | null;
  };
  ReviewerOtpBypassAuthenticated: {
    userId: string;
    role: string;
    occurredAt: string;
  };
}

export interface IdentityEventBusPort {
  emit<K extends keyof IdentityEventPayloads>(event: K, payload: IdentityEventPayloads[K]): void;
}
