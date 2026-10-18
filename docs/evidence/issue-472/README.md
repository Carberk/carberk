# Issue 472 evidence

Question: does the Search parameters price field drop digits when `7000000` is typed in one burst, as the old FilterSheet field did during the #370 native session ([issue-370 README](../issue-370/README.md), point 5, kept as historical context)? PR 489. It was first built on PR 483 (issue 371), which merged to main as `bc31bc7`; this PR was then rebased onto main.

## Commits these runs refer to

- The native session and the original green run were made at the pre-rebase commit `784f783`. Its tests under `apps/mobile/src/listings/search` are identical to `4b83bce` in this PR's history (`git diff 784f783 4b83bce -- apps/mobile/src/listings/search` is empty), so the native captures still apply to the rendered code. `784f783` is a pre-rebase commit that no remote ref contains (`git branch -r --contains 784f783` lists nothing), so that comparison cannot be rerun from a fresh clone. `4b83bce` is its equivalent in this PR and is reachable from `origin/agent/issue-472`.
- After review findings, the spec was changed at `d52d8eeb87003391fb394f297f970ea14d6250f1` (the delete-and-retype test now ends on a value different from its opening value, and the burst tests fire through `fireEvent.changeText` inside one `act`, which removed the props reach-in and two duplicate tests, 38 to 36). The three mutation runs and the green run below were rerun at that commit. Each log starts with its command, that SHA and the mutation diff.

## Result

The defect did not reproduce, in a rendered test or on the simulator. Production code is unchanged. No red checkpoint exists because no test failed against the unchanged code.

The cause of the original #370 burst observation ("up to 70 TMT") is **not established**. Issue criterion 2 asks for a fix or a recorded reason the simulator burst differs; it is closed here by a recorded integration decision on that basis, not by finding a cause: [the decision comment on PR 489](https://github.com/bagtyyarkovusov/auto.tm-rewrite/pull/489#issuecomment-5935210638). What the evidence supports is narrower: the React side (handler, state, rendering) is shown from source and rendered tests not to drop digits, and the iOS simulator did not reproduce it. The residual native risk is carried to the physical-Android proof as an explicit check, [recorded in issue 345](https://github.com/bagtyyarkovusov/auto.tm-rewrite/issues/345#issuecomment-5935211436): type `7000000` quickly into Min and Max with the device soft keyboard, and paste the whole value into each, recording pass or fail with the build SHA.

## Mechanism read from source

The Min and Max fields are one component, `PriceRangeFilterControl`, rendered by `SearchParametersForm`. The FilterSheet used the same control; its history after introduction (`8744ac15`) is a validation simplification (`4021cb7f`) and the i18n migration (`7c836d36`), and #371 did not touch it. What it does on each `changeText`:

- takes the event's full text, strips non-digits, `parseInt`, and calls `setField("priceMin" | "priceMax", n)`;
- renders `value={priceMin?.toString() ?? ""}`.

There is no formatter (the value is a plain digit string), no debounce, and the handler never reads the previous `value`, so a handler captured before a render cannot go stale. `setField` in `useListingFilters` merges into a ref (`draftRef`), so interleaved Min and Max events do not overwrite each other. The only remaining mechanism that could drop a digit is native: a controlled `value` that lags the native text view while keys keep arriving. A synchronous test cannot exercise it. That is why the native check below exists, and why it is limited to what it shows.

React Native documentation (Context7, `/react/react-native-website`) says two relevant things. The TextInput `value` page says the native value "will be forced to match this value prop" and that this can cause flickering in some cases. The direct-manipulation page says a controlled TextInput "can sometimes drop characters when the `bufferDelay` is low and the user types very quickly", and offers `setNativeProps` as the workaround. `bufferDelay` is not a prop on the current TextInput page, so that passage may be dated, and it does not say whether it applies to the installed version. It is cited only to show that a native lag is a documented possibility, not to say it happens here. An earlier version of this README said React Native guards against lagging values with its event count; two lookups found no such statement in the documentation, so that claim was removed.

## Rendered tests

`apps/mobile/src/listings/search/SearchParametersForm.spec.tsx`, describe "price inputs keep every digit typed or pasted". It renders the real `SearchParametersForm` and `PriceRangeFilterControl` and mocks only the network hooks, as the rest of that spec does. For Min and Max it covers: one digit at a time with a render between each; every prefix fired through `fireEvent.changeText` inside one `act` (React does not render between events); whole-value paste of `7000000`, `7,000,000`, `7 000 000` and `7 000 000 TMT`; a paste over an existing value; a delete-and-retype burst inside one `act` that opens at `7000000`, deletes to `7000` and retypes to `7000555`, so it fails if the handler drops every event. Also both fields in alternating bursts, the values reaching Results params after Show, and a Max typed digit by digit while Min is larger (the inline error appears and clears).

What a rendered test cannot model: each `changeText` carries full text, so these tests show that for in-order sequences of events the last delivered text wins. They do not test out-of-order or dropped delivery, and they do not reproduce native ordering between the text view and a controlled `value`.

Would they fail if the behaviour broke? Three temporary mutations of `PriceRangeFilterControl` (each reverted, never committed) were rerun at spec commit `d52d8eeb87003391fb394f297f970ea14d6250f1`. Each log records the command, the SHA and the diff, then the failing tests and totals.

| Mutation | Log | Result | Delete-and-retype |
|---|---|---|---|
| Min handler appends only the last character to the stored value (stale closure) | [mutation-stale-closure.txt](mutation-stale-closure.txt) | 9 failed, 27 passed | Min fails |
| Max handler commits through a 300 ms `setTimeout` (debounce) | [mutation-debounce.txt](mutation-debounce.txt) | 12 failed, 24 passed | Max fails |
| Min `value` rewritten as `toLocaleString("en-US")` (formatter) | [mutation-formatter.txt](mutation-formatter.txt) | 10 failed, 26 passed | Min fails |

Unmutated: [rendered-green.txt](rendered-green.txt), 36 passed.

Tests that pass under a mutation, named so the table is not read as full coverage:

- Stale closure (Min only): the one-digit-at-a-time Min test passes, because a render happens between events; every Max test passes; so does the maximum-below-minimum test. The Show-count test also passes.
- Debounce (Max only): every Min test passes. The maximum-below-minimum test fails here, along with the existing Show-count test.
- Formatter (Min only): every Max test passes, and so do the Show test (it reads the router params, not the displayed text) and the maximum-below-minimum test (its Min of `500000` is never queried by display value). The existing pre-filled test fails because `70000` renders as `70,000`.

The earlier run of the debounce mutation left the Max delete-and-retype test passing, because it ended on its opening value. That is fixed: it now fails under the debounce mutation.

## Native check

Environment: iPhone 17 simulator `3A8BB230-13C9-4624-8239-395A6E887D4C` (iOS 26.2), `tm.auto.app` development build already installed, Metro on port 8469 from this worktree at the pre-rebase commit `784f783` (`--clear`; the search tests there match `4b83bce`, see above), Maestro 2.6.0 pinned to that UUID. Backend: the PR 483 Railway environment through its public URLs. `/readyz` before the session returned `status: ready` and `commitSha: 5175de8c3a6531c9492239ae804e9aa7b38eb158`. App language was Russian. The form was reached from Results with Filters; no sign-in was needed. No OTP, token or variable value was used or recorded. The flows are in [flows](flows).

Files are in [screenshots](screenshots), JPEGs at 600 px width, light appearance.

| Capture | What it proves |
|---|---|
| `01-burst-min-light.jpg` | `inputText: "7000000"` into Min: the field holds `7000000` (cursor at the end), Max still shows its placeholder, soft number pad visible |
| `02-burst-min-and-max-light.jpg` | The same burst then into Max: both fields hold `7000000`. The button reads "Loading..." because the count request was in flight |
| `03-burst-min-and-max-run4-light.jpg` | Fourth repetition of the burst flow: both fields hold `7000000` |
| `04-one-digit-at-a-time-min-and-max-light.jpg` | Seven single-character `inputText` commands per field: both hold `7000000`, button "Show 0 listings" |
| `05-paste-callout-light.jpg` | The iOS Paste callout on the empty Min field with `7000000` on the simulator pasteboard |
| `06-paste-min-and-max-light.jpg` | After Paste in Min and in Max: both hold `7000000` |

Assertions: `flows/burst.yaml` asserts `7000000` after the Min burst and nothing after the Max burst, and neither `flows/paste.yaml` nor `flows/one-digit-at-a-time.yaml` has any assertion. The Max burst result (captures `02` and `03`), the one-digit result (capture `04`) and every paste result (captures `05` and `06`) therefore rest on the captures alone, which were read by eye; no flow step passed or failed on them. The flows were not edited or rerun for this note.

Keyboard state in the paste captures: `05` shows the Paste/AutoFill callout over the empty Min field with no soft keyboard and the tab bar visible. `06` shows `7000000` in both fields, a text caret at the end of Max (a focused field), no soft keyboard and the tab bar visible. The reason the keyboard is not shown is not established; it was not investigated. These two captures therefore do not show the soft number pad that `01`, `02`, `03` and `04` show.

The burst flow ran four times (captures 01 and 02 from the first; 03 from the fourth). Runs 2 to 4 each passed `assertVisible: "7000000"` after the Min burst; only run 4's Max state was inspected, in `03`. Runs 2 and 3 were not screenshotted for Max.

## What this does and does not show

- On this simulator, Maestro's `inputText` of the whole string and of one character at a time both left `7000000` in both fields, and a pasted `7000000` did too. The "up to 70 TMT" from the #370 session did not recur.
- Why the earlier burst differed is not established. What the #370 record contains: [issue-370 README](../issue-370/README.md) records an iPhone 17 simulator on iOS 26.2 with no UDID, and its point 5 says "a simulator typed several characters in one burst". No committed material names the tool that typed that burst, so whether it was Maestro `inputText` or something else is unknown, and whether it was the same simulator as in this run is unknown. The #370 input method was not replayed against the new form, so the discriminating experiment was not run. The one structural difference on record is that the old field sat in the FilterSheet inside a Sheet rather than in a full-screen form. The control itself is unchanged since before that session, which narrows the question to the input path or the sheet; it does not settle it. Context7 (`/mobile-dev-inc/maestro-docs`) documents the `inputText`, `eraseText`, `pasteText` and `hideKeyboard` commands but not how `inputText` delivers characters on iOS, so Maestro's chunking behaviour is not documented here and is not claimed.
- Hardware keyboard: the soft number pad was visible in the typing captures `01`, `02`, `03` and `04` (not in the paste captures, see above). The Simulator preference `ConnectHardwareKeyboard` has no value on this machine (`defaults read` reported the key as missing), and it was not toggled, since that is a host setting shared with other devices. A hardware-keyboard run was therefore not made and no claim is made about it.
- Maestro's `scrollUntilVisible` reported the "Ценовой диапазон" row as visible while it was below the fold on the unscrolled form, so the flows scroll with a swipe. This is a Maestro matching note, not an app finding.
- Limits: one simulator, one iOS version, Maestro as the only text source for typing, Max pasted only after Min. A physical keyboard, a third-party keyboard and Android were not tested.

## Observed outside scope

`PriceRangeFilterControl` stores `parseInt` of the typed digits. Digit strings of 22 characters or more become a number whose `toString()` is exponent notation (`1e+21`), and strings over 15 significant digits lose precision (`12345678901234567` becomes `12345678901234568`). This was checked in Node only, not in the app, and not covered by the tests. It is a different defect from the one in the issue and no price that long is a valid listing price; it is reported, not fixed.

## Cleanup

Metro (port 8469) was stopped and the port was confirmed free. The app was terminated and the simulator shut down. Docker was not used.
