# MTurk HIT Helper Stable v0.3.51

This build reads MTurk's React data directly from the HitSetTable `data-react-props` payload instead of relying on fragile button discovery in the rendered DOM.

## Install

1. Remove older MTurk helper extensions from `chrome://extensions`
2. Load this folder unpacked
3. Hard refresh the MTurk page

## Notes

- Click **Enable audio alerts** once on the MTurk page if you want beeps
- Hotkey for accepting the top visible HIT is `Z`
- Hidden entries are removed from view
- Excluded entries remain visible but never become the preferred top item unless every visible item is excluded

## Changes in 0.3.51

- Fixed row highlighting so MTurk React `li` rows are shaded and bordered uniformly at the row/container level instead of styling each individual column span

## Changes in 0.3.50

- Restored row-pill mounting to a stable first-cell/title-anchor placement after 0.3.46 moved pills into a table cell that could disappear or fail to render on MTurk
- Restored per-row score/status pills so each visible HIT group shows a pill again instead of only the current top HIT
- Ignored helper-owned mutation events so pill insertion does not immediately retrigger unnecessary rerank loops

## Changes in 0.3.45

- Added a new hide/show-hidden pill so you can temporarily reveal rows normally hidden by filtering, watch suppression, age limits, requester blocks, or manual hide lists, then rehide them with one click
- Moved the on-page helper pills out of the fixed upper-right stack into a centered horizontal toolbar mounted above the HIT results table for a more stable layout

## Changes in 0.3.43

- Made watch-list evaluation stateful and edge-triggered instead of re-evaluating repeatedly on identical row-mapping passes
- Added per-HIT watch state for last seen Created age/direction and a snapshot-based refresh ID so each watched HIT is evaluated only once per material refresh snapshot
- Updated release detection to compare against the last observed Created timing progression, preventing repeated same-snapshot checks from prematurely releasing or re-processing watched HITs

## Changes in 0.3.42

- Updated watch-list release logic to understand future Created values like `in 26s` versus active values like `26s ago`
- If a watched item was added while inactive (`in Xs`), it now releases as soon as the Created value flips to active (`Xs ago`)
- If a watched item was added while already active (`Xs ago`), it now stays hidden until the Created value flips back to future or the age clearly resets to a newer HIT

## Changes in 0.3.15

- Fixed score pills and top badge attaching to the actual HIT row cells instead of nested requester-info popup elements
- Fixed refresh crash caused by an undefined variable in refresh control detection
- Made refresh scheduling resilient so the countdown continues after each refresh cycle
- Tightened DOM row mapping to only real HIT table rows with six cells and an accept control

## Changes in 0.3.16

- Added debug overlay mode that marks each chosen anchor with a blue outline and row index tag
- Added popup buttons for Dump mapping and Rerank now
- Console dump now shows row index, requester, title, score, filtered/excluded status, whether a row/control was found, and the chosen anchor tag/text

## Changes in 0.3.17

- Added a DOM render wait so row mapping waits for MTurk to actually render rows before decorating
- Broadened row detection to include tr and role=row candidates instead of only tbody rows
- Added logging for row-readiness and zero-row conditions

## Changes in 0.3.18

- Removed the over-strict row filter that was discarding every valid MTurk row
- DOM row collection now uses broad visible candidates from MainContent and lets index mapping/debug overlay reveal the correct row structure
- Mapping log now reports total DOM candidates versus mapped items

## Changes in 0.3.19

- Scoped DOM row collection to the actual HitSetTable container instead of all visible divs under MainContent
- Row mapping now matches each DOM row against the specific requester, title, and reward from bodyData instead of naive index alignment
- Mapping log now reports matched row count separately from total DOM candidate rows

## Changes in 0.3.20

- Fixed getHitSetTableContainer so it exists at top-level scope and no longer crashes rerank
- Relaxed DOM row matching to require requester plus either title or reward, instead of all three fields
- Mapping log now includes matchedControls to make accept-control failures easier to spot

## Changes in 0.3.21

- Replaced fragile refresh-button clicking with deterministic hard refresh via window.location.assign(window.location.href)
- Timer now counts down to a real page reload instead of a UI click
- Countdown text now reflects reload behavior

## Changes in 0.3.22

- Row discovery now anchors to the actual visible results table by matching the headers Requester, Title, HITs, Reward, Created, and Actions
- Result rows are taken only from that table body, preventing pills/highlights from failing due to wrong DOM branch selection
- Accept control lookup is now scoped to the Actions cell of each matched result row

## Changes in 0.3.23

- Dropped nonexistent table/header detection and switched to content-matching row discovery under MainContent
- Rows are now matched to React bodyData using requester/title/reward text instead of semantic table structure
- Pill/highlight anchoring now prefers the deepest element containing the HIT title text within the matched row

## Changes in 0.3.26

- Switched from table/source assumptions to live DOM hydration matching under MainContent
- Visible hydrated nodes are now scored against React bodyData by requester/title/reward text and best-match assigned
- Pills/highlights attach only to matched hydrated nodes from the live rendered UI


## Changes in 0.3.37

- Added low-count ghost suppression keyed by HIT group ID and persisted across reloads in the same tab
- Added configurable minimum visible HIT count so groups under the threshold are hidden outright
- Added repeated low-count suppression so sticky 1-HIT ghost groups are hidden for a configurable number of minutes

## Changes in 0.3.38

- Made the reload countdown pill clickable so it can toggle auto-refresh on and off without opening the popup
- Made the on-page audio alert button persist its enabled state across refreshes and reflect that saved preference
- Changed Blocked requesters in the popup to a removable multiselect list like Hidden opportunities

## Changes in 0.3.38

- Added a loose title-normalization fallback in scoreHydratedMatch() so rows still match when the DOM title differs only by punctuation or spacing.

## Changes in 0.3.40

- Added a configurable Watch delay and `W` hotkey to temporarily hide the current top-ranked HIT group.
- Watch-listed HIT groups automatically reappear early if their Created time refreshes instead of continuing to age normally.
- Added time-aware Created-age parsing so watch detection compares elapsed age instead of matching literal strings.


## Changes in 0.3.41

- Added a Watch list multiselect to the popup so current watch-delayed HIT groups are visible there.
- Added a minus button for the Watch list so selected watch entries can be manually removed like hidden and excluded entries.
- Popup watch-list removal now updates the page immediately by removing those entries from session watch state and reranking.


## v0.3.45
- Made HIT-group pills idempotent and resilient to row replacement by reusing/rebuilding pill hosts and reapplying decoration after DOM mutations.
- Added duplicate-safe `H` hiding keyed to a specific requester/title HIT-group identifier instead of blindly appending the same title repeatedly.
