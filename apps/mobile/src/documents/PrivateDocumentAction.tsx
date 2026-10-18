import { useEffect, useRef, useState } from "react";
import { File, Paths } from "expo-file-system";
import { randomUUID } from "expo-crypto";
import * as Sharing from "expo-sharing";

import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";

/** The caller owns authorization and unmounts this view when access ends.
 * Only opaque temporary names enter device cache. The system sheet provides
 * available open/save/share destinations; external copies cannot be revoked. */
export function PrivateDocumentAction({ download, label, busyLabel, errorLabel }: { download: () => Promise<Uint8Array>; label: string; busyLabel: string; errorLabel: string }) {
 const [busy, setBusy] = useState(false), [failed, setFailed] = useState(false);
 const epoch = useRef(0), file = useRef<File | null>(null), active = useRef(false);
 useEffect(() => () => { epoch.current++; file.current?.delete(); file.current = null; }, []);
 async function open() {
  if (active.current) return; active.current = true; const token = epoch.current; setBusy(true); setFailed(false);
  let temporary: File | null = null;
  try {
   if (!await Sharing.isAvailableAsync()) throw new Error("DOCUMENT_SHEET_UNAVAILABLE");
   const bytes = await download();
   if (token !== epoch.current) return;
   if (bytes.length === 0 || bytes.length > 20*1024*1024) throw new Error("INVALID_DOCUMENT");
   temporary = new File(Paths.cache, `private-document-${randomUUID()}.pdf`); temporary.create({ overwrite: false }); temporary.write(bytes); file.current = temporary;
   await Sharing.shareAsync(temporary.uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf", dialogTitle: label });
  } catch { if (token === epoch.current) setFailed(true); }
  finally {
   if (file.current === temporary) { temporary?.delete(); file.current = null; }
   active.current = false; if (token === epoch.current) setBusy(false);
  }
 }
 return <Button accessibilityRole="button" accessibilityLabel={busy ? busyLabel : failed ? errorLabel : label} disabled={busy} onPress={() => { void open(); }}><Text>{busy ? busyLabel : failed ? errorLabel : label}</Text></Button>;
}
