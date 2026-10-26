import "reflect-metadata";
import { ConfigService } from "@nestjs/config";
import type { PrismaService } from "@auto-tm/db";
import { IdentityModule } from "../../../identity/identity.module";
import type { BusinessAuthorityPort, ClockPort } from "../../../identity/identity.public";
import { ListingOwnership } from "../../application/ListingOwnership";
import { VideoEligibility } from "../../application/VideoEligibility";

/** Use the actual Identity composition providers, with DB/config/time boundaries. */
export function videoAuthority(prisma: PrismaService, clock: ClockPort) {
  const providers = Reflect.getMetadata("providers", IdentityModule) as { name?: string; useClass?: { name: string } }[];
  const Repository = providers.find(p => p.useClass?.name === "PrismaBusinessAuthority")?.useClass as unknown as new (db: PrismaService) => unknown;
  const Authority = providers.find(p => p.name === "CheckBusinessAuthority") as unknown as new (repository: unknown, clock: ClockPort) => BusinessAuthorityPort;
  const authority = new Authority(new Repository(prisma), clock);
  return { authority, ownership: new ListingOwnership(authority), eligibility: new VideoEligibility(new ConfigService({ VIDEO_ROLLOUT_ENABLED: true, VIDEO_UPLOADS_ENABLED: true, VIDEO_TESTER_USER_IDS: ["viewer"] })) };
}
