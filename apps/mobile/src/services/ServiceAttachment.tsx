import { useState } from "react";
import { Image, View } from "react-native";
import type { ServiceMessagingSchemas as S } from "@auto-tm/contracts";

import { apiClient } from "../api/client";

import { serviceCopy } from "./copy";

import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";

export function ServiceAttachment(_props: { conversationId: string; attachment: NonNullable<S.ServiceMessage["attachment"]>; locale: string }) { return null; }
