import { inventoryActor } from "./inventoryActor";
import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Inject,
  Post,
  Req,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import type { z } from "zod";
import { AdminSchemas, ErrorCode, ListingsSchemas } from "@auto-tm/contracts";

import { resolveClientIp } from "../../../common/client-ip";
import {
  IDENTITY_CHECK_PORT,
  contactPhoneCodeException,
  type IdentityCheckPort,
} from "../../identity/identity.public";
import { ConfirmContactPhone } from "../application/ConfirmContactPhone";
import { ListMyContactPhones } from "../application/ListMyContactPhones";
import { RequestContactPhoneCode } from "../application/RequestContactPhoneCode";
import type { UsableContactPhone } from "../application/UsableContactPhone";

type AuthenticatedRequest = FastifyRequest & {
  user?: { sub?: string };
  locale?: "ru" | "tk" | "en";
};

function toResponse(phone: UsableContactPhone): ListingsSchemas.VerifiedContactPhone {
  return {
    phone: phone.phone,
    source: phone.source,
    confirmedAt: phone.confirmedAt?.toISOString() ?? null,
    reusableUntil: phone.reusableUntil?.toISOString() ?? null,
  };
}

/** The seller's contact phones for Listings (ADR-0081). */
@Controller("api/v1/me/contact-phones")
export class ContactPhonesController {
  constructor(
    @Inject(RequestContactPhoneCode)
    private readonly requestCode: RequestContactPhoneCode,
    @Inject(ConfirmContactPhone)
    private readonly confirmContactPhone: ConfirmContactPhone,
    @Inject(ListMyContactPhones)
    private readonly listMyContactPhones: ListMyContactPhones,
    @Inject(IDENTITY_CHECK_PORT)
    private readonly identityCheck: IdentityCheckPort,
  ) {}

  @Post("request")
  @HttpCode(200)
  async request(
    @Req() req: FastifyRequest,
    @Body() body: unknown,
  ): Promise<ListingsSchemas.ContactPhoneCodeRequestResponse> {
    const userId = await this.signedInSeller(req);
    const { phone } = this.parseOrThrow(ListingsSchemas.ContactPhoneCodeRequestSchema, body);

    try {
      const result = await this.requestCode.execute({
        ...inventoryActor(req),
        userId,
        phone,
        ip: resolveClientIp(req),
        locale: (req as AuthenticatedRequest).locale ?? "ru",
      });
      return result.status === "confirmed"
        ? { status: "confirmed", contactPhone: toResponse(result.contactPhone) }
        : result;
    } catch (error) {
      throw contactPhoneCodeException(error) ?? error;
    }
  }

  @Post("verify")
  @HttpCode(200)
  async verify(
    @Req() req: FastifyRequest,
    @Body() body: unknown,
  ): Promise<ListingsSchemas.ContactPhoneVerifyResponse> {
    const userId = await this.signedInSeller(req);
    const { phone, code } = this.parseOrThrow(
      ListingsSchemas.ContactPhoneVerifyRequestSchema,
      body,
    );

    try {
      const confirmed = await this.confirmContactPhone.execute({ ...inventoryActor(req), userId, phone, code });
      return {
        contactPhone: {
          phone: confirmed.phone,
          source: "confirmed",
          confirmedAt: confirmed.confirmedAt.toISOString(),
          reusableUntil: confirmed.reusableUntil.toISOString(),
        },
      };
    } catch (error) {
      throw contactPhoneCodeException(error) ?? error;
    }
  }

  @Get()
  async list(@Req() req: FastifyRequest): Promise<ListingsSchemas.MyContactPhonesResponse> {
    const userId = await this.signedInSeller(req);
    const { items } = await this.listMyContactPhones.execute({ ...inventoryActor(req), userId });
    return { items: items.map(toResponse) };
  }

  private async signedInSeller(req: FastifyRequest): Promise<string> {
    const userId = (req as AuthenticatedRequest).user?.sub as string;
    if (await this.identityCheck.isSuspended(userId)) {
      throw new ForbiddenException({
        code: "FORBIDDEN",
        message: "User is suspended",
        details: { reason: AdminSchemas.AdminErrorReason.UserSuspended },
      });
    }
    return userId;
  }

  private parseOrThrow<T>(schema: { parse: (data: unknown) => T }, data: unknown): T {
    try {
      return schema.parse(data);
    } catch (err) {
      // Match by shape: the contracts package may load its own copy of Zod,
      // so `instanceof ZodError` is not reliable here (as in MeController).
      if (err && typeof err === "object" && "issues" in err) {
        throw new BadRequestException({
          code: ErrorCode.ValidationFailed,
          message: "Invalid request",
          details: (err as z.ZodError).flatten(),
        });
      }
      throw err;
    }
  }
}
