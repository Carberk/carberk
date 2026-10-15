import { ConfigService } from "@nestjs/config";
export function serviceRuntime(_config: ConfigService) {
 return { syntheticSubjectAllowed: (_subject: { userId: string; sessionId: string }) => false };
}
