# MTurk HIT Helper Stable v0.3.13

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
