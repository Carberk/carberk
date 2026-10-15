/**
 * Contact-phone codes for Listings (ADR-0081). The purpose is fixed inside
 * identity: a caller cannot ask for a code that signs anyone in, and a code
 * from another flow or another User never confirms a contact phone.
 */
export interface ContactPhoneCodePort {
  /** Applies the shared budgets, stores a code bound to the User and sends the SMS. */
  requestCode(input: {
    userId: string;
  businessId?: string | undefined;
    phone: string;
    ip: string;
    locale: "ru" | "tk" | "en";
  }): Promise<ContactPhoneCodeSent>;

  /** Checks and consumes the newest contact-phone code this User requested for the number. */
  confirmCode(input: { userId: string;
  businessId?: string | undefined; phone: string; code: string }): Promise<void>;
}

export interface ContactPhoneCodeSent {
  requestId: string;
  resendInSeconds: number;
  testCode?: string;
}
