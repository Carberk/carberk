# Listing video UI

Approved target additions for [#886](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/886), governed by [Listings](../../features/32-listings.md) and [ADR-0099](../../../adr/0099-tester-only-listing-video-with-a-90-second-limit.md). Existing Carberk tokens, photo geometry, keyboard/accessibility conventions and current navigation remain the baseline. These are required states, not claims of rendered implementation.

## Seller media

Keep the existing required photos and add one optional video slot. Choose from library only. A denied permission preserves all Listing fields and photos. Preview shows the selected interval, accurate duration, thumbnail timeline with two trim handles, optional Trim for clips <=90s, mandatory interval selection above 90s and a poster picker confined to that interval. Use video cannot submit >90s. Show poster crop as it will appear in a photo tile.

Distinguish Preparing, Uploading and Processing. During upload show prepared byte size, progress, Pause/Continue and Cancel. Paused remains paused across reconnect/reopen. Keep the wizard usable while work proceeds. Required photos alone permit publication while optional video is pending/failed. Buyers receive only ready video.

Errors include unsupported/unreadable source, missing source permission/provider access after reopening, insufficient storage, preparation cancellation/failure, upload interruption/expired authority and processing failure. Preserve Listing/photos and recoverable selection/trim state. Offer the applicable Retry, another video or Remove action. Never fall back to uploading an unprepared original.

A replacement keeps the current public ready video until the new one becomes ready. Pending replacement and active video must be distinguishable to the seller. Removing video hides it immediately. Server state wins over late progress/job responses.

## Buyer media

Keep the cover photo first and insert ready video second. Results retains its existing card geometry; detail keeps the approved inset 4:3 strip. Poster tiles use the same crop as photos and show Play, duration and an accessible label.

Results poster tap opens detail with that video selected, without playing. Detail Play opens a dedicated player. The fullscreen gallery includes the poster in paging and thumbnail navigation; arrival never autoplays. Closing the player returns to the originating detail/gallery item. Returning to Results retains filters/scroll.

Only posters load before Play. The player preserves complete frame/aspect ratio, starts with sound respecting native volume, and exposes pause/resume, seek, mute, fullscreen and quality controls. Auto begins conservatively; Data saver caps at 360p; manual choices list only available renditions. Loading, buffering and retryable failure are visible. Close, navigation and background release playback and stop fetching.

## Required evidence states

Rendered interaction evidence covers eligible/ineligible/permission-denied selection; trim boundaries and poster selection; preparing/uploading/paused/processing/failed/retry/removed; publication with pending/failed optional video; active-plus-pending replacement; poster-only Results/detail/gallery navigation; player loading/playing/paused/buffering/error/quality selection; return position and cleanup on exit/background.

Consolidated final native evidence covers real trim touch interaction, picker/provider recovery, aspect ratios/orientation, posted playback and native controls on available platforms. Founder sample validation remains final. Test labels must distinguish native application evidence from desktop synthetic conversion experiments.
