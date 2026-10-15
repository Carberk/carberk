-- Additive. No marketplace role implicitly receives private capabilities.
CREATE TABLE "staff_grants" (
 "userId" TEXT NOT NULL,
 "capability" TEXT NOT NULL,
 "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "revokedAt" TIMESTAMP(3),
 CONSTRAINT "staff_grants_pkey" PRIMARY KEY ("userId", "capability"),
 CONSTRAINT "staff_grants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "staff_grants_capability_check" CHECK ("capability" IN ('support.operations', 'history.fulfilment', 'history.payment.verify', 'history.payment.history', 'history.export', 'founder.refund.approve', 'staff.manage', 'founder.control', 'founder.admission', 'founder.recovery', 'diagnostics.reception', 'diagnostics.technician', 'diagnostics.reviewer', 'diagnostics.templates', 'analytics.aggregate', 'analytics.investigate'))
);
