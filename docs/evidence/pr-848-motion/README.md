# PR #848 native motion evidence

These captures show source `378727bd3e3d1430334887315fc72638d721555d` on the existing iPhone 17 Pro iOS Debug client, served by guarded Metro against the staging backend at `bf3f`. They do not require a new staging APK. The source bundle was checked after restarting Metro to exclude an earlier stale bundle.

| State | Capture | Governing specification and observation |
|---|---|---|
| Light language sheet, signed-out Cabinet | [Screenshot](sheet-light.png) | [Shared motion](../../prd/ui/76-motion.md). Panel, handle, title and rows form one visible panel. |
| Picker closing after selection | [Frame sequence](picker-exit-contact.png) | [Shared motion](../../prd/ui/76-motion.md). The SearchParameters brand title, search and rows remain visible while the panel exits. |
| Reduced Motion sheet | [Frame sequence](sheet-reduced-motion-contact.png) | [Shared motion](../../prd/ui/76-motion.md). The cold-restarted reduced-motion setting produces a fade without spatial movement. |
| Launch identity sequence | [Frame sequence](launch-transition.png) and [video](launch-preview.mp4) | [Root layout](../../prd/ui/hifi/mobile-_layout.md). C-dot contracts and rises during its fade, then the wordmark and credit rise and fade in. The completed identity holds before exit. |
| Saved Light startup | [Frame sequence](launch-light-contact.png) | [Root layout](../../prd/ui/hifi/mobile-_layout.md). The deliberate dark brand screen hands off directly to the Light destination. |

The launch video is the preview shown to the founder. All assets contain signed-out screens, public marketplace content or launch identity. No OTP, token or private account data is included.

These captures supplement the rendered tests and local/hosted gates recorded in the [PR Execution state](https://github.com/bagtyyarkovusov/auto.tm-rewrite/pull/848). The final-source phone-keyboard check separately confirmed input, action and legal copy remain visible. An inherited large-text clipping defect remains a reported release gap. This evidence does not establish final Android production-binary behavior, authenticated media/admin endpoint behavior, iOS uploads or slow-network ThumbHash behavior. Those gates need their own release evidence.

Rapid reopen was observed in a separate native recording. CLI timing does not prove a reopen within the 220 ms exit interval; the cancellation regression test and a failing cleanup-removal mutation establish that behavior.
