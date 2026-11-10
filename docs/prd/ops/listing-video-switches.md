# Listing video tester switches

The API owns three switch values, all defaulting to off, plus one serving origin:

- `LISTING_VIDEO_UPLOAD_TESTER_USER_IDS`: comma-separated User IDs allowed the owner Video card, target status and existing-session controls.
- `LISTING_VIDEO_VIEW_TESTER_USER_IDS`: independent comma-separated User IDs allowed Ready video metadata and viewer playback. File authorization is enforced separately by #1057.
- `LISTING_VIDEO_UPLOADS_ENABLED`: `true` permits new picks and upload sessions for upload testers. `false` pauses only new work; existing eligible sessions can resume/complete and stored sources can reprocess. Ready reads for view testers continue.
- `LISTING_VIDEO_API_ORIGIN`: public HTTPS origin of this API, used in signed video file URLs. Required outside local development; without it every video-access read returns `VIDEO_NOT_AVAILABLE`. Owner preview also requires upload-list membership.

Set the values on the API service in the intended Railway environment and let its configuration deployment finish on every replica. Use User IDs, never phone numbers or email addresses. Keep both lists empty until the release gate approves activation. Staging changes require founder approval; production activation requires separate explicit approval. Never print private configuration or credentials in a ticket or log.

`GET /api/v1/me` reports `isVideoUploadTester` separately from `canUploadVideo`; suspended accounts and accounts pending deletion get neither capability. The app refreshes this read before opening the video picker or using a selection. A pause keeps the selected clip and explains why it cannot be used. Server checks remain authoritative, including direct upload-session requests. Removing an ID from the upload list revokes existing-session controls; turning off only the switch does not.
