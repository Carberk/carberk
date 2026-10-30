# Business image privacy repair

The previous business authorization around attachment presigning still issued public `chat-attachments` object URLs. Membership revocation could stop API history while known image bytes remained public. This repair stores new business images in the dedicated `business-chat-private` bucket and namespace. Personal Conversation storage remains unchanged.

The existing staging response now returns an authenticated API upload path for business threads. `expiresIn: 0` means no storage bearer grant was issued. Every upload checks current session, business membership, assignment and open enquiry. Downloads check current buyer or current business history authority. The API accepts at most 5 MiB of WebP bytes, uploads immutably with idempotent identical-byte retry, and bounds storage reads and timeouts. Rich-message creation rejects public attachment keys for business threads and private keys for personal threads. The existing server image cleaner strips metadata in the private bucket before message persistence.

The buyer's real Message bubble and business enquiry history use the protected API, keep decoded source bytes in view memory, and disable image disk caching. Opening full screen performs a fresh authorized download. Sign-out/session change and app backgrounding clear displayed bytes and invalidate pending completions. Returning to the app rechecks authority. An already viewed image cannot be made unknown to its recipient; server revocation applies to subsequent downloads.

## Evidence

`BusinessEnquiries.e2e.spec.ts` exercises actual PostgreSQL, HTTP and MinIO. It checks the business private namespace, authenticated upload and rich send, buyer/current-member download, anonymous known-object refusal, removed-member known-path upload/download refusal, and owner history access. The RED checkpoint is `f0be46d2`; hosted execution belongs to the integration owner. The implementation also updates the synthetic upload content type to `image/webp` so its 5 MiB parser does not change Service messaging's binary limit.

`BusinessChatImage.spec.tsx` renders the real component with the real API client and MSW. It checks actual authenticated bytes in bubble/fullscreen, sign-out clearing, a fresh full-screen read refused after membership loss, and rejection of a pending response from a previous account. Focused personal-chat suites remain regression evidence. Native device and deployed storage acceptance remain integration gates.

## Deployment and legacy remediation gate

Business image activation remains closed until all of the following have recorded evidence:

1. Provision `business-chat-private` on the deployed object store with no anonymous bucket policy, public CDN mapping or public origin access. Give only the API's service credentials read/write access. Verify a known stored object's anonymous URL is refused and authenticated API reads work.
2. Inventory every Conversation with a nonnull `businessId`. Inspect all image Message metadata and report snapshots referring to those Conversations. Inventory all objects under `chat-attachments/<business-conversation-id>/`, including staged objects without Messages. Do not infer that a public historical key became private through this code change.
3. Stop old public business presign issuance by deploying the repair. Drain all previously issued 600-second upload grants, including operational clock skew, or revoke their signing credentials through an approved rotation. During the drain, keep business image activation closed.
4. For retained business images, use a reviewed, separately authorized remediation to copy and clean the bytes into the private bucket, verify their contents and private access, then update every retained Message/report reference atomically or through a resumable audited job. Retention and deletion authority still apply. No real business data or automatic historical migration is assumed by this synthetic delivery.
5. Delete every corresponding public object and staged orphan, then verify every inventoried old anonymous URL no longer returns image bytes. Re-inventory after the presign drain to catch late writes. Recheck buyer/current-member API reads and revoked-member refusal against the remediated records.

An empty real-business inventory must itself be recorded. Fixture-only success does not substitute for this check. Existing private API authorization cannot revoke copies a recipient already downloaded.
