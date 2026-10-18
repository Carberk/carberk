import { Module } from "@nestjs/common";

import { IdentityModule } from "../identity/identity.module";
import { STAFF_AUTHORITY_PORT, type StaffAuthorityPort } from "../identity/identity.public";

import { ReadOperationsHealth } from "./application/ReadOperationsHealth";
import { RedisOperationsSnapshot } from "./infrastructure/RedisOperationsSnapshot";
import { OperationsController } from "./presentation/OperationsController";

@Module({ imports: [IdentityModule], controllers: [OperationsController], providers: [RedisOperationsSnapshot,
  { provide: ReadOperationsHealth, inject: [STAFF_AUTHORITY_PORT, RedisOperationsSnapshot],
    useFactory: (authority: StaffAuthorityPort, snapshot: RedisOperationsSnapshot) => new ReadOperationsHealth(authority, () => snapshot.read()) },
] })
export class OperationsModule {}
