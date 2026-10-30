import { diagnosticIdentityFile } from "@/lib/diagnostic-identity-files";

type Context = { params: Promise<{ id: string; file: string }> };
export async function GET(request: Request, context: Context) { return diagnosticIdentityFile(request, context, "order"); }
export async function PUT(request: Request, context: Context) { return diagnosticIdentityFile(request, context, "order", true); }
