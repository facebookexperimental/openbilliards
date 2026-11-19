# Pocket-assembly declarations (V18)

One file per table, schema `ball-return-assembly/1.0`, named `<canonicalTableId(tableId)>.json`: the file name is the table's
neutral key (the first `TABLE_SPECS` key bound to its spec object; the V18 fetch in `web/scene/ballreturn/index.js:1320` builds
the name this way), while the `table_id` field inside may be an alias of that key (both name one catalog spec object).
A ball legitimately enters the pocket assembly — the
cup, the well, the bag, its net and skirt, the slide ring — so those meshes are not furniture for the ENTRY segment of a runway:
V16 treats a declared mesh as PASSABLE from the capture point to the first station whose sphere is clear of every declared
mesh (measured per runway, never a constant) and as furniture again beyond it. Never a global exemption.

Ownership: a table with a craft lane declares through its lane (the XW101's `wpbsa_snooker_12ft` — the snooker lane, SNK-R29;
the Diamond — the diamond lane); main's generic `wpa_generic_9ft` is declared here by the ball-return lane as fixture geometry,
DERIVED from the built model. A solid the model uses where the real table is hollow is recorded as `solid_simplification: true`
so the modelling lane sees it. None declared = the assembly is furniture; an invalid declaration refuses the track (fail-closed).

```json
{
  "schema": "ball-return-assembly/1.0",
  "table_id": "wpbsa_snooker_12ft",
  "doc": { "title": "...", "status": "...", "revision": "...", "date": "YYYY-MM-DD", "issue": "#...", "notes": "..." },
  "meshes": [
    { "id": "corner-bag", "kind": "bag", "name": "obPocketNet",
      "provenance": { "tag": "PHOTO", "source": "..." } },
    { "id": "corner-skirt", "kind": "skirt", "name": "obPocketNetSkirt", "solid_simplification": false,
      "provenance": { "tag": "PHOTO", "source": "..." } },
    { "id": "middle-well-lc", "kind": "well",
      "match": { "parent": "obTable", "geometry": "CylinderGeometry", "center_mm": [0, -99, -703], "size_mm": [137, 200, 137], "tolerance_mm": 3 },
      "solid_simplification": true,
      "provenance": { "tag": "DERIVED", "source": "..." } }
  ],
  "provenance": { "tag": "PHOTO | MODEL | DERIVED | TEST", "source": "..." }
}
```

- `kind`: `cup | well | bag | net | skirt | ring | liner | other`.
- Exactly one of `name` (the mesh's `name` in the scene) or `match` (an UNNAMED mesh: its parent group's name, its three
  geometry type, its world AABB centre and size in mm, a tolerance in (0, 20] mm — a rename or a move breaks the match and
  V16 names the mesh again).
- The track's OWN hardware (the wires the ball rides, the ring it passes through, the straps) is not assembly: it is declared in
  the sibling companion `../hardware/<trackId>.json` (schema `ball-return-hardware/1.0`, V17 — the published track schema's
  root forbids extra keys, so the block cannot live in the track JSON) and measured apart (`ownHardware`).
- The read is on the controller facade: `ctl.assembly` (the declaration), `ctl.furniture.assemblyDeclared`,
  `ctl.furniture.entrySegments` (per route: the runway and the station where the entry segment ends),
  `ctl.furniture.assemblyPass` (the stations passed inside the segment), and a violation `assemblyBeyondEntry` when a declared
  mesh is met beyond it.
