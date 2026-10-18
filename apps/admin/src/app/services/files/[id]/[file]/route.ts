import { proxyPrivateFile, type PrivateFileContext } from "../../../private-file-proxy";
export async function GET(request: Request, context: PrivateFileContext) { return proxyPrivateFile(request, context, false, "attachments"); }
export async function POST(request: Request, context: PrivateFileContext) { return proxyPrivateFile(request, context, true, "attachments"); }
