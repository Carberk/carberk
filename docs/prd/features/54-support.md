# 54 - General Support

## Purpose and ownership

General Support is Carberk's assistance and appeal service, separate from paid Vehicle History, Listing Conversations, content moderation and diagnostic orders. It uses a Support case owner and shared business-messaging capabilities under [ADR-0106](../../adr/0106-service-owned-support-and-vehicle-history.md). Its source anchor is [#500](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/500); this campaign admits the post-review feature, not a retrospective claim it shipped in the reviewer build. The original reviewer release keeps Cabinet Help email/phone until this service's own readiness gates pass.

## Access, identity and entry

One Support row in Messages and Cabinet Help open the same user's Support service/history. Do not add extra support links in Favorites or Listing Conversation menus. Signed-out entry offers sign-in and existing contact details in Help; it cannot reveal a private thread. The later entry decision removed the older signed-out Messages contact block.

Support replies are displayed under the Carberk business identity, not as a seller or public employee identity. Named operator attribution remains internal/audited; Vehicle History may show assigned operator name and visible handovers without changing Support identity. Contact information is reachable from the header/info sheet. Authorized moderators/admins with TOTP and an explicit Support capability may answer; one person may hold multiple capabilities. General marketplace moderation alone must not confer private Support access. Restricted users keep the appeal channel even when ordinary marketplace sends are forbidden. Do not reuse Listing availability/block rules to reject an appeal.

## Communications and notifications

Text and one client-compressed image per service message, up to 5 MB after compression, are supported for user and staff. Include selection/preview/removal, upload progress, independent upload-versus-send failure/retry, sent/read state and full image viewing. Retry a send without duplicating a successful upload/message. Uploaded content must match allowed type/size and be cleaned of unnecessary metadata; service-scoped association and authorized retrieval are required. No PDFs, videos, general files or broadcast attachments are admitted by the Vehicle History PDF work.

Inbound assistance, replies and audited one-to-one operational notices are allowed. Initial outbound categories are Support follow-up, account/moderation decisions and service problems affecting that user. Require reason and actor audit. No promotions, broadcasts or automatic reminder campaign. Distinguish private staff notes from public replies so a note cannot notify the user or satisfy the response clock. Read/history pagination, reconnect recovery, assignment/unread state and push must respect service identity/access; notification previews must not expose private evidence. No guaranteed response/resolution copy.

## Operations and lifecycle

Staffed daily 09:00-20:00 Asia/Ashgabat by the authorized service team. This explicitly supersedes #500's older founder-only weekday Asia/Shanghai staffing proposal for Support. Internal first meaningful response target remains four staffed hours. This is different from the incident process's own team, schedule and urgency targets; neither schedule silently replaces the other.

The clock starts at the oldest unanswered user message, including one reopening a closed case. Extra user messages do not reset it. A meaningful human reply satisfies it; automated receipt or private note does not. A staff-initiated notice/manual reopening alone creates no user-response deadline. Preserve unanswered age outside staffed hours; calculate elapsed staffed time against the named schedule. Suspected security/data exposure enters urgent incident process immediately. Next priority is account access, deletion problems and moderation appeals, then ordinary help; within a category oldest unanswered first.

One named staff owner may claim a case and explicitly hand it over. Queue reads and client buttons are not mutation authorization; removed/previous staff cannot continue protected operations. Resolved cases may be closed by staff. When staff asks for user information and receives no reply for 14 days, staff may close with notice. A case awaiting staff investigation/response stays open. No automatic idle-closure job is authorized.

A new user message or public staff reply reopens the same case while retained history exists; staff may reopen manually. Do not invent a response obligation when no unanswered user message exists. After old history is purged, begin a fresh case without resurrecting deleted content. Closure/reopen transitions are audited, and a delayed purge must not delete a newly reopened case.

## Retention and rights

Existing accepted Support policy remains: retain text/images while open and for 90 days after closure; reopening followed by later closure restarts that period. Delete linked Support content when account deletion completes, subject to verified specific deletion obligations, retaining anonymous case counts only. This is the existing General Support schedule, not the rejected blanket Vehicle History service/diagnostic purge proposal. An internal vehicle archive cannot absorb a Support transcript or receipt to evade deletion. Purge stored bytes and derived/cached copies through the owned lifecycle; retries, restoration and reopening must not revive removed content.

Durable vehicle/market knowledge and anonymized insights require separately recorded purpose, provenance, permissions and identifiability; Support access is not permission to mine private messages for demographic inference or sell user records. Do not infer age from images/messages. Diagnostic-private readership and provider restrictions remain separate.

## Acceptance and activation

Prove signed-out/private entry, restricted-user appeal, unauthorized staff and direct artifact reads, business identity, one-to-one notice reason/audit, private-note separation, four-staffed-hour clock across close/reopen/days, 14-day manual closure, 90-day purge/reopen race, account deletion/storage cleanup and push/reconnect behavior. Test through meaningful application/rendered and real disposable database/storage/worker boundaries, including failure/retry. All screens, validation, statuses and generated exports support TK/RU/EN. Consolidate native image/push checks with campaign acceptance.

Public service opens only after named staff coverage, contact details, escalation process, private storage, role/rights/deletion enforcement and actual notification/read flows pass. Readiness may differ from Vehicle History provider/payment activation; enabling Support must not enable paid history automatically.
