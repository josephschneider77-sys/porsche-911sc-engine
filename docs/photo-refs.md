# Catalogue references (Kat 502)

Source of truth for part number, quantity, shape, proportions, features, placement and orientation: the official Porsche parts catalogue, USA 911 1983, Kat 502 (`kat502-usa-911-83-katalog.pdf`). The PDF is not in the repo. Page numbers below are the PDF page index (the sheet itself is numbered as sheet “- 1” of that illustration). Only lines that apply to the 1978 930/03 are used. Photos are for finish and colour only.

Plug entry direction and whether a connector passes through a valve-cover hole are not settled here. Illustration 901-00 draws the connector (position 21) as its own part on the plug, and the plug (position 16) as a separate W-series shell. Illustration 103-05 draws the lids (positions 17 and 19) as closed covers, with no connector hole in the gasket. `COVER_BOOT_HOLE` stays off. While it is off, the ignition lead stops outside the lower-cover wall, abreast of the boot, because the terminal sits in the cover pocket and a wire cannot reach it without a hole.

The plug axis is still provisional, not a catalogue decision and not a photo match. `SPARK_TILT` is 58° and `SPARK_PITCH` is 24°, with the tip at head-local (12, −8, 28). That pose keeps the shell off both valve heads and off the exhaust-flange plate, and it keeps the cam-housing stud nuts about 19 mm off the axis. The terminal boot meets the cam-housing wall, so the housing is relieved on the same axis (a capped well, radius 11 mm, from 46 mm to 88 mm along the plug). The heat exchanger stays more than 2.5 mm clear. The head washer seat is a spot-face at the end of the 19 mm reach, with the M14 minor-diameter bore through to the chamber.

## Cylinder head — illustration 103-00

| | |
|---|---|
| Drawing | PDF page 63 (sheet - 1) |
| List | PDF pages 64–65 |
| Position 1 | Cylinder head, qty 6. For 1978 the line is **930 104 029 08** (remark “79”, SC, without valves). 930 104 028 03 is the 1980 head. Turbo heads are not used. |
| Positions 9, 10 | Intake valve **930 105 409 01** and exhaust valve **930 105 419 08**, qty 6 each |

The head carries the plug bore. The plug itself is illustration 901-00 position 16, not a 103-00 line.

## Camshaft housing and valve covers — illustration 103-05

| | |
|---|---|
| Drawing | PDF page 66 (sheet - 1) |
| List | PDF pages 67–69 |

| Pos | Part | Qty | 1978 line | In the model |
|---|---|---|---|---|
| 13 | Camshaft housing | 2 | 930 105 021 00 | `cam-housing-left` / `cam-housing-right` |
| 17 | Lid (upper valve cover) | 2 | 901 105 115 03 | `valve-cover-upper-*` |
| 18 | Gasket | 2 | 930 105 194 00 | `valve-cover-gasket-upper-*` |
| 19 | Lid (lower valve cover) | 2 | 930 105 116 00 (116 05 is an alternative) | `valve-cover-lower-*` |
| 20 | Gasket | 2 | 930 105 195 01 | `valve-cover-gasket-lower-*` |
| 24 | Nut | 6 | 901 111 271 00 | `valve-cover-special-*` (3 per lower cover) |
| 25 | Hexagon nut M8 | 34 | 900 076 025 02 | `valve-cover-nuts-*` |

Positions 21–23 (washer, hexagon nut, spring washer, qty 40) are the cam-chain nut pool, not the cover studs. The drawing shows the upper lid, the lower lid, their gaskets, and the nuts as separate callouts. Cover shells stay the closed pans; no connector hole is cut.

## Rocker gear — illustration 103-10

The left valve-control sheet lists the rocker gear for the engine (qty 12). Illustration 103-15 is the right chain drive; its positions 44 and 45 are circlips, not rockers.

| | |
|---|---|
| Drawing | PDF page 70 (sheet - 1) |
| List | PDF pages 71–73 |

| Pos | Part | Qty | Part no. |
|---|---|---|---|
| 44 | Rocker shaft | 12 | 901 105 342 04 |
| 45 | Pan-head screw | 12 | 999 067 008 00 |
| 46 | Bush | 12 | 901 105 344 02 |
| 47 | Nut | 12 | 901 105 376 02 |
| 48 | Rocker arm | 12 | 930 105 043 00 |
| 49 | Adjusting screw | 12 | 901 105 370 02 |
| 50 | Nut | 12 | 999 034 005 00 |

Position 45 is a pan-head screw. The model uses that head, not a hex socket. Six screws and six nuts on each bank. The nut’s flange sits on the housing spot face; the cone enters the shaft.

## Spark plug — illustration 901-00

| | |
|---|---|
| Drawing | PDF page 582 (sheet - 1) |
| List | PDF pages 583–584 |

| Pos | Part | Qty | 1978 line |
|---|---|---|---|
| 16 | Spark plug | 6 | **999 170 170 90**, remark “-79”, “145 EA 0,8”. 999 170 136 90 is the other -79 line at the same position. 999 170 055 90 and 999 170 165 90 are “80-” (not 1978). 999 170 128 90 is Turbo. |
| 21 | Spark plug connector | 6 | 911 602 315 00 |

The sheet does not print a thread reach. The modelled plug is the Bosch W-series already specified for this work: M14×1.25, 19 mm reach, sealing washer, 20.8 mm hex, ribbed ceramic, terminal nut, ground strap and centre electrode. The connector is position 21 and grips the terminal. 999 170 162 90 (“W 3CC”) is not on this Kat 502 sheet.

## Review sheets

`docs/review/spark-plugs.png` and `docs/review/valve-covers.png` are drawing | old | new. The left column is a crop of the Kat 502 sheet named above. The middle column is main `df88f34`. The right column is this branch. Photos are not in those sheets.
