import "reflect-metadata";
import type { Provider } from "@nestjs/common";
import { MODULE_METADATA } from "@nestjs/common/constants";
import { Test } from "@nestjs/testing";
import { PrismaService } from "@auto-tm/db";
import { IdentityModule } from "../../../modules/identity/identity.module";
import { IDENTITY_ADMIN_PORT, IDENTITY_READ_PORT, IDENTITY_CHECK_PORT,
  type IdentityAdminPort, type IdentityReadPort, type IdentityCheckPort } from "../../../modules/identity/identity.public";

/** Database-level composition uses Identity's configured public providers.
 * It does not initialize the unrelated HTTP, queue or sign-in services. */
export async function configuredIdentityTestPorts(db: PrismaService) {
 const tokens = [IDENTITY_ADMIN_PORT, IDENTITY_READ_PORT, IDENTITY_CHECK_PORT];
 const configured = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, IdentityModule) as Provider[];
 const providers = tokens.map(token => {
  const provider = configured.find(value => typeof value === "object" && value !== null && "provide" in value && value.provide === token);
  if (!provider) throw new Error("Missing configured Identity public provider");
  return provider;
 });
 const module = await Test.createTestingModule({ providers: [{ provide: PrismaService, useValue: db }, ...providers] }).compile();
 return { module, admin: module.get<IdentityAdminPort>(IDENTITY_ADMIN_PORT), read: module.get<IdentityReadPort>(IDENTITY_READ_PORT), check: module.get<IdentityCheckPort>(IDENTITY_CHECK_PORT) };
}
