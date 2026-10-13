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

These captures supplement the rendered tests and local/hosted gates recorded in the [PR Execution state](https://github.com/bagtyyarkovusov/auto.tm-rewrite/pull/848). The final-source phone-keyboard check separately confirmed input, action and legal copy remain visible. An older capture clipped glyphs after changing the font category while the app was running. The cold-launch captures below supersede its use as evidence of persistent clipping. A transient hot-change limitation remains; ordinary route-remount recovery has not been established. This evidence does not establish final Android production-binary behavior, authenticated media/admin endpoint behavior, iOS uploads or slow-network ThumbHash behavior. Those gates need their own release evidence.

Rapid reopen was observed in a separate native recording. CLI timing does not prove a reopen within the 220 ms exit interval; the cancellation regression test and a failing cleanup-removal mutation establish that behavior.

## Cold-launch large text

These additional captures show the same existing iPhone 17 Pro iOS Debug client at exact source `378727bd`, after a cold relaunch. Ops checked the served source before capture and restored the text category to `large` afterwards. The sign-in, launch and sheet product sources are unchanged in the final toolchain integration `904a48099230499d8d3d76714cb3312ec0c0529f`; these captures do not establish the final patched native runtime or production binary.

| State | Capture | Observation |
|---|---|---|
| English phone entry, accessibility-large, Light | [Screenshot](login-cold-accessibility-large.png) | Complete heading, field, helper, action and legal text are visible without glyph clipping. |
| English phone entry, maximum accessibility category, Light | [Screenshot](login-cold-accessibility-max.png) | Glyphs remain intact. Legal copy continues below the viewport and needs scrolling. |
| Russian phone entry, maximum category, scrolled legal copy | [Screenshot](login-cold-accessibility-max-ru-legal.png) | The action and complete legal copy remain reachable and readable by scrolling. |

The Russian scrolled capture has no software keyboard visible. Its original local filename included `keyboard`; that filename is not evidence of keyboard layout. These captures cover cold-launch phone entry only. They do not establish email entry, a keyboard-visible maximum-size form, screen-reader behavior, or a general accessibility pass. Hot font-category changes can transiently clip glyphs until a cold remount; no speculative source fix was made from the earlier capture. Final-source native keyboard and media acceptance remains the operations owner's separate gate.
