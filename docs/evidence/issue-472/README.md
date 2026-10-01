# Issue 472 evidence

Question: does the Search parameters price field drop digits when `7000000` is typed in one burst, as the old FilterSheet field did during the #370 native session ([issue-370 README](../issue-370/README.md), point 5, kept as historical context)? PR 489, stacked on PR 483 (issue 371) at `5175de8c3a6531c9492239ae804e9aa7b38eb158`.

## Result

The defect did not reproduce, in a rendered test or on the simulator. Production code is unchanged. No red checkpoint exists because no test failed against the unchanged code.

## Mechanism read from source

The Min and Max fields are one component, `PriceRangeFilterControl`, rendered by `SearchParametersForm`. The FilterSheet used the same control; its history after introduction (`8744ac15`) is a validation simplification (`4021cb7f`) and the i18n migration (`7c836d36`), and #371 did not touch it. What it does on each `changeText`:

- takes the event's full text, strips non-digits, `parseInt`, and calls `setField("priceMin" | "priceMax", n)`;
- renders `value={priceMin?.toString() ?? ""}`.

There is no formatter (the value is a plain digit string), no debounce, and the handler never reads the previous `value`, so a handler captured before a render cannot go stale. `setField` in `useListingFilters` merges into a ref (`draftRef`), so interleaved Min and Max events do not overwrite each other. The only remaining mechanism that could drop a digit is native: a controlled `value` that lags the native text view while keys keep arriving. React Native guards against this with its event count, and a synchronous test cannot exercise it. That is why the native check below exists, and why it is limited to what it shows.

## Rendered tests

`apps/mobile/src/listings/search/SearchParametersForm.spec.tsx`, describe "price inputs keep every digit typed or pasted". It renders the real `SearchParametersForm` and `PriceRangeFilterControl` and mocks only the network hooks, as the rest of that spec does. For Min and Max it covers: one digit at a time with a render between each; every prefix delivered in one `act` from a handler captured once (no render between events); the same through `fireEvent.changeText`; whole-value paste of `7000000`, `7,000,000`, `7 000 000` and `7 000 000 TMT`; a paste over an existing value; a delete-and-retype burst. Also both fields in alternating bursts, the values reaching Results params after Show, and a Max typed digit by digit while Min is larger (the inline error appears and clears).

What a rendered test cannot model: each `changeText` carries full text, so these tests prove the handler and state are correct for any delivery order. They do not reproduce native ordering between the text view and a controlled `value`.

Would they fail if the behaviour broke? Three temporary mutations of `PriceRangeFilterControl` (reverted, not committed) were run against the new tests:

| Mutation | File | Result |
|---|---|---|
| Min handler appends only the last character to the stored value (stale closure) | [mutation-stale-closure.txt](mutation-stale-closure.txt) | 10 failed, 28 passed. One-at-a-time Min still passes, burst and paste fail |
| Max handler commits through a 300 ms `setTimeout` (debounce) | [mutation-debounce.txt](mutation-debounce.txt) | 12 failed, 26 passed |
| Min `value` rewritten as `toLocaleString("en-US")` (formatter) | [mutation-formatter.txt](mutation-formatter.txt) | 11 failed, 27 passed |

Unmutated: [rendered-green.txt](rendered-green.txt), 38 passed, at `784f783`.

## Native check

Environment: iPhone 17 simulator `3A8BB230-13C9-4624-8239-395A6E887D4C` (iOS 26.2), `tm.auto.app` development build already installed, Metro on port 8469 from this worktree at `784f783` (`--clear`), Maestro 2.6.0 pinned to that UUID. Backend: the PR 483 Railway environment through its public URLs. `/readyz` before the session returned `status: ready` and `commitSha: 5175de8c3a6531c9492239ae804e9aa7b38eb158`. App language was Russian. The form was reached from Results with Filters; no sign-in was needed. No OTP, token or variable value was used or recorded. The flows are in [flows](flows).

Files are in [screenshots](screenshots), JPEGs at 600 px width, light appearance.

| Capture | What it proves |
|---|---|
| `01-burst-min-light.jpg` | `inputText: "7000000"` into Min: the field holds `7000000` (cursor at the end), Max still shows its placeholder, soft number pad visible |
| `02-burst-min-and-max-light.jpg` | The same burst then into Max: both fields hold `7000000`. The button reads "Loading..." because the count request was in flight |
| `03-burst-min-and-max-run4-light.jpg` | Fourth repetition of the burst flow: both fields hold `7000000` |
| `04-one-digit-at-a-time-min-and-max-light.jpg` | Seven single-character `inputText` commands per field: both hold `7000000`, button "Show 0 listings" |
| `05-paste-callout-light.jpg` | The iOS Paste callout on the empty Min field with `7000000` on the simulator pasteboard |
| `06-paste-min-and-max-light.jpg` | After Paste in Min and in Max: both hold `7000000` |

The burst flow ran four times (captures 01 and 02 from the first; 03 from the fourth). Runs 2 to 4 each passed `assertVisible: "7000000"` after the Min burst; only run 4's Max state was inspected, in `03`. Runs 2 and 3 were not screenshotted for Max.

## What this does and does not show

- On this simulator, Maestro's `inputText` of the whole string and of one character at a time both left `7000000` in both fields, and a pasted `7000000` did too. The "up to 70 TMT" from the #370 session did not recur.
- Why the earlier burst differed is not established. Candidate differences, none confirmed: the earlier session used a different simulator and a different text-delivery tool, and typed into the old FilterSheet inside a Sheet rather than a full-screen form. The control itself is unchanged since before that session, so the old observation points at the input path or the sheet, not at this control's code. Context7 (`/mobile-dev-inc/maestro-docs`) documents the `inputText`, `eraseText`, `pasteText` and `hideKeyboard` commands but not how `inputText` delivers characters on iOS, so Maestro's chunking behaviour is not documented here and is not claimed.
- Hardware keyboard: the soft number pad was visible in every typing capture. The Simulator preference `ConnectHardwareKeyboard` has no value on this machine (`defaults read` reported the key as missing), and it was not toggled, since that is a host setting shared with other devices. A hardware-keyboard run was therefore not made and no claim is made about it.
- Maestro's `scrollUntilVisible` reported the "Ценовой диапазон" row as visible while it was below the fold on the unscrolled form, so the flows scroll with a swipe. This is a Maestro matching note, not an app finding.
- Limits: one simulator, one iOS version, Maestro as the only text source for typing, Max pasted only after Min. A physical keyboard, a third-party keyboard and Android were not tested.

## Observed outside scope

`PriceRangeFilterControl` stores `parseInt` of the typed digits. Digit strings of 22 characters or more become a number whose `toString()` is exponent notation (`1e+21`), and strings over 15 significant digits lose precision (`12345678901234567` becomes `12345678901234568`). This was checked in Node only, not in the app, and not covered by the tests. It is a different defect from the one in the issue and no price that long is a valid listing price; it is reported, not fixed.

## Cleanup

Metro (port 8469) was stopped and the port was confirmed free. The app was terminated and the simulator shut down. Docker was not used.
