# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Data tables for the D621 alignment gate: how OUR mesh names map to families, how the purchased model's nodes map to
groups, and which model group is paired with which family. Edit HERE when the lane adds `dm-` meshes.

All rules are anchored regular expressions evaluated with re.fullmatch (a pattern ending in `.*` is a prefix rule).
The first matching row wins, so put narrower rules (dm-cabinet-screw-*) before wider ones (dm-cabinet-*).
Ours meshes with an empty name are given the synthetic name `anon#<i>(<parent>)` by common.load_ours.
"""
import re

# ---------------------------------------------------------------------------------------------------------------------
# OURS: (family, name pattern, parent pattern or None)
# ---------------------------------------------------------------------------------------------------------------------
OURS_FAMILIES = [
    ("railtop",    r"dm-railtop.*",                 None),
    ("subrail",    r"dm-subrail.*",                 None),
    ("cushion",    r"dm-cushion.*",                 None),
    ("apron",      r"dm-apron-skirt",               None),
    ("apron",      r"dm-apronband.*",               None),   # apron band (model: pool_kant_side01/02)
    ("apron",      r"dm-cabinet-trough-.*",         None),   # unlit trough plates behind the end openings (inside the cabinet)
    ("ballreturn", r"dm-pocketcupfloor-.*",         None),   # pocket cup floors (model: pool_trap bottoms)
    ("railtop",    r"dm-kerffloor-.*",              None),   # slate strip under the side-pocket kerf (inside the rail band)
    ("legbolt",    r"dm-cabinet-screw-.*",          None),   # cabinet screws (model: screw_01..16) -- before dm-cabinet-*
    ("apron",      r"dm-cabinet-.*",                None),   # cabinet body/panels/bottom board (model: pool_front/side/bottom)
    ("brdoor",     r"dm-ballreturn-door",           None),
    ("leg",        r"dm-leg-(hl|hr|fl|fr)",         None),
    ("leveler",    r"dm-leveler.*",                 None),
    ("legbolt",    r"anon#.*",                      r"dm-leg-bolt.*"),
    ("casting",    r"dm-casting-corner.*",          None),
    ("casting",    r"dm-cornerblock-.*",            None),   # 45-degree corner blocks (model: pool_kant01/03/06/08)
    ("liner",      r"dm-liner-side.*",              None),
    ("facing",     r"dm-bootsleeve-.*",             None),   # cloth jaw-facing wedges (bed cloth, not leather; model has no counterpart) -- before boot
    ("bed",        r"dm-falllip-.*",                None),   # cloth roll at the bed-hole edge (bed cloth; model has no counterpart) -- before boot
    ("boot",       r"dm-(bootcollar|bootrim|bootbowl|bootskirt|boothem|bootstitch)-.*", None),   # leather only (2026-09-02; the a39f14cd analysis counted bootsleeve + falllip here)
    ("sight",      r"dm-sight.*",                   None),
    ("ballreturn", r"dm-(returnshaft|returnfloor)-.*", None),
    ("ballreturn", r"dm-pocketcup-.*",              None),   # pocket cups (model: pool_trap01..06)
    ("bed",        r"dm-bed-cloth",                 None),
    ("decal",      r"dm-(shelfshadow|tongueao|spot-foot).*", None),
]
_OURS_COMPILED = [(f, re.compile(n), re.compile(p) if p else None) for f, n, p in OURS_FAMILIES]


def ours_family(name, parent):
    for fam, rn, rp in _OURS_COMPILED:
        if rn.fullmatch(name or "") and (rp is None or rp.fullmatch(str(parent or ""))):
            return fam
    return "unknown"


# ---------------------------------------------------------------------------------------------------------------------
# MODEL: (group, node-name pattern). Node names come from the quarantine file names node_<id>_<name>.obj.
# ---------------------------------------------------------------------------------------------------------------------
MODEL_GROUP_RULES = [
    ("rails",        r"pool_kant\d+"),
    ("rail_side",    r"pool_kant_side.*"),
    ("kant_support", r"pool_kant_support"),
    ("apron_cabinet", r"pool_side01|pool_side02|pool_front|pool_bottom|pool_top|pool_midle"),
    ("legs_out",     r"pool_leg_out.*"),
    ("legs_in",      r"pool_leg_in.*"),
    ("cushions",     r"pool_rubber.*"),
    ("boots",        r"pool_leather.*"),
    ("traps",        r"pool_trap.*"),
    ("sights",       r"romb(?!19$).*"),
    ("screws",       r"screw.*"),
    ("label",        r"pool_label"),
    ("cue",          r"cue.*"),
    ("ignore",       r"NGon.*|scene_world|romb19"),
]
_MODEL_COMPILED = [(g, re.compile(p)) for g, p in MODEL_GROUP_RULES]


def model_group(name):
    for g, r in _MODEL_COMPILED:
        if r.fullmatch(name):
            return g
    return "unknown"


# sub-splits and pseudo-groups used by the pairings (node lists in the model's own id order are resolved at run time)
MODEL_RAIL_CAPS = ("pool_kant02", "pool_kant04", "pool_kant05", "pool_kant07", "pool_kant09", "pool_kant10")
MODEL_RAIL_CORNERS = ("pool_kant01", "pool_kant03", "pool_kant06", "pool_kant08")
MODEL_CABINET = ["pool_front", "pool_side01", "pool_side02", "pool_bottom"]
MODEL_BEDSLAB = ["pool_top"]

# ---------------------------------------------------------------------------------------------------------------------
# PAIRING (ALIGNMENT-D621.md section 3): key, label, model groups, ours families, note.  Order = concat order (do not
# reorder: the area-weighted sampler draws triangle indices, so the concat order is part of the reproducible result).
# ---------------------------------------------------------------------------------------------------------------------
DEVIATION_PAIRS = [
    ("rails_apronband__railtop_subrail", "rails+kant_side <-> railtop+subrail (task mapping)", ["rail_caps", "rail_side"], ["railtop", "subrail"],
     "task-specified pairing; the model's kant_side is the 133 mm apron band BELOW the bed, which ours carries in apron-skirt, so see the alt pair too"),
    ("railcaps__railtop_subrail", "rail caps only <-> railtop+subrail (alt)", ["rail_caps"], ["railtop", "subrail"], "alternative: caps above the bed only"),
    ("rubber__cushion", "rubber <-> cushion", ["cushions"], ["cushion"], ""),
    ("cabinet__apron", "cabinet (front+sides+bottom) <-> apron-skirt(+door) (task mapping)", ["cabinet"], ["apron", "brdoor"], "task-specified pairing"),
    ("apronband_cabinet__apron", "kant_side band + cabinet <-> apron-skirt(+door) (alt)", ["rail_side", "cabinet"], ["apron", "brdoor"],
     "alternative: everything the model shows below the bed line on the outside"),
    ("legs__leg_leveler", "legs (out+in) <-> leg+leveler", ["legs_out", "legs_in"], ["leg", "leveler"], ""),
    ("leather__boot", "leather <-> boot* (collar/rim/bowl/skirt/hem/stitch; leather only, sleeves = facing, falllip = bed)", ["boots"], ["boot"], "leather-only set since 2026-09-02 (the a39f14cd analysis counted the cloth sleeves + falllip as boot)"),
    ("romb__sight", "romb <-> sight", ["sights"], ["sight"], "flat cages both sides"),
    ("cornerblocks__casting", "kant corner blocks <-> casting-corner", ["rail_corners"], ["casting"], ""),
    ("traps__ballreturn", "traps <-> returnshaft+returnfloor", ["traps"], ["ballreturn"], "below-bed, invisible in poses"),
    ("bedslab__bedcloth", "pool_top <-> bed-cloth", ["bedslab"], ["bed"], "bed slab (10 mm thick) vs cloth plane"),
    ("screws__legbolts", "screws <-> leg bolts", ["screws"], ["legbolt"], "different placement (cabinet vs leg faces)"),
    ("railcaps_boots__liner", "rail caps + boots <-> liner-side (ours-only part)", ["rail_caps", "boots"], ["liner"],
     "model has no side-pocket liner; ours->model direction is the meaningful one"),
]
# whole table = model visible set <-> ours minus decals (appended after the pairs above, before the extra pairs)
WHOLE_TABLE_MODEL_GROUPS = ["rail_caps", "rail_corners", "rail_side", "cabinet", "bedslab", "legs_out", "legs_in", "cushions", "boots", "traps", "sights", "screws"]
WHOLE_TABLE_OURS_EXCLUDE = ("decal",)
WHOLE_TABLE_NOTE = "kant_support (hidden core), pool_midle (degenerate), label, cue, rack excluded from the model side"
# deviation_extra.py pairs (same method; run after the list above)
EXTRA_PAIRS = [
    ("railassembly__railtop_subrail_casting_liner", "rail caps + 45deg corner blocks <-> railtop + subrail + casting + liner (whole rail-top assembly)",
     ["rail_caps", "rail_corners"], ["railtop", "subrail", "casting", "liner"], "fair pairing for the corner: ours' casting = the model's cap ends + arc"),
    ("abovebed__all", "everything above the bed: caps + corners + rubber + leather + romb <-> railtop + subrail + casting + liner + cushion + boot* + facing + sight",
     ["rail_caps", "rail_corners", "cushions", "boots", "sights"], ["railtop", "subrail", "casting", "liner", "cushion", "boot", "facing", "sight"],
     "the part of the table every gameplay camera sees (facing = the cloth jaw wedges, kept in the visible set; falllip moved to bed)"),
]
# split pairs (2026-09-02): ours side selected by an anchored regex over the mesh names (re.fullmatch), model side by groups.
# They read the apron band and the cabinet separately from the combined apronband_cabinet__apron pair.
SPLIT_PAIRS = [
    ("apronband__rail_side", "kant_side band <-> dm-apronband (band only)", ["rail_side"], r"dm-apronband.*",
     "split of apronband_cabinet__apron: the 133 mm band below the bed alone"),
    ("cabinet__cabinet", "cabinet (front+sides+bottom) <-> dm-cabinet-* except screws/trough", ["cabinet"], r"dm-cabinet-(?!screw-|trough-).*",
     "split of apronband_cabinet__apron: the cabinet body alone (screws are in legbolt, the unlit trough plates are excluded)"),
]
# LAW split pairs (D621-ALIGN seal, 2026-09-03): the apron/cabinet verdict rows evaluated with the MFR-decided deltas removed
# the same way the silhouettes are (law_adjust_d621.json): the apron band with OUR envelope pushed out to the model's (EN-01
# 104 x 59 in vs the model's 104.78 x 59.43 — envelope_dx/dy per side), and the cabinet WALLS alone (the bottom board sits at
# EN-06 = 15 in on ours and at the model's 360 — 21 mm apart by law — so the board is out of the pair on both sides).
# (key, label, model groups, model-node exclude regex or None, ours regex, ours transform tag, note)
LAW_SPLIT_PAIRS = [
    ("apronband__rail_side_law", "kant_side band <-> dm-apronband, LAW-ADJUSTED ours (envelope out)", ["rail_side"], None, r"dm-apronband.*",
     "envelope_out", "law twin of apronband__rail_side: our band translated outward by envelope_dx (along) / envelope_dy (across) per side"),
    ("cabinet_walls__cabinet_walls_law", "cabinet WALLS (front + sides) <-> dm-cabinet-end/side, LAW-ADJUSTED (bottom board out)", ["cabinet"],
     r"pool_bottom|pool_top|pool_midle", r"dm-cabinet-(end|side)-.*", "envelope_out",
     "law twin of cabinet__cabinet: the bottom board is EN-06 (MFR 15 in) on ours and 360 on the model, so it is out of the pair on both sides; "
     "the walls stand at the model's recess behind OUR cap edge (MFR envelope), so the envelope delta is removed as for the band"),
]
# centroid-aligned legs (2026-09-02): the legs pair recomputed after translating each of OUR legs (+ its leveler) in plan
# onto the nearest MODEL leg's plan AABB centre -> form-only residual, placement removed (deviation.py builds it).
LEGS_FORM_KEY = "legs__leg_leveler_centroid_aligned"
LEGS_FORM_LABEL = "legs (out+in) <-> leg+leveler, centroid-aligned (each of our legs translated in plan onto the nearest model leg's plan centre; form only)"
# report order + labels (write_report.py)
DEVIATION_REPORT_ORDER = [
    ("railassembly__railtop_subrail_casting_liner", "rail caps + 45° corner blocks ↔ railtop+subrail+casting+liner (fair rail-top pairing)"),
    ("rails_apronband__railtop_subrail", "rails + kant_side ↔ railtop+subrail (task mapping as written)"),
    ("railcaps__railtop_subrail", "rail caps only ↔ railtop+subrail"),
    ("rubber__cushion", "rubber ↔ cushion"),
    ("cabinet__apron", "cabinet (front+sides+bottom) ↔ apron-skirt(+door) (task mapping)"),
    ("apronband_cabinet__apron", "kant_side band + cabinet ↔ apron-skirt(+door)"),
    ("apronband__rail_side", "kant_side band ↔ dm-apronband (split: band only)"),
    ("cabinet__cabinet", "cabinet (front+sides+bottom) ↔ dm-cabinet-* except screws/trough (split: cabinet only)"),
    ("legs__leg_leveler", "legs (shell+core) ↔ leg+leveler"),
    ("legs__leg_leveler_centroid_aligned", "legs (shell+core) ↔ leg+leveler (centroid-aligned: placement removed, form only)"),
    ("leather__boot", "leather ↔ boot* (collar/rim/bowl/skirt/hem/stitch; leather only)"),
    ("romb__sight", "romb ↔ sight"),
    ("cornerblocks__casting", "kant 45° corner blocks ↔ casting-corner (task mapping)"),
    ("traps__ballreturn", "traps ↔ returnshaft+returnfloor (hidden)"),
    ("bedslab__bedcloth", "pool_top ↔ bed-cloth"),
    ("screws__legbolts", "screws ↔ leg bolts"),
    ("railcaps_boots__liner", "rail caps + boots ↔ liner-side (ours-only part; ours→model direction meaningful)"),
    ("abovebed__all", "EVERYTHING ABOVE THE BED (what every gameplay camera sees)"),
    ("whole_table", "WHOLE TABLE (model visible set ↔ ours minus decals)"),
]

# ---------------------------------------------------------------------------------------------------------------------
# Silhouette sets (overlays.py / visual_weight*.py). Model side = Task B's silhouette set; ours excludes decals + leg bolts
# (the model set excludes screws).
# ---------------------------------------------------------------------------------------------------------------------
MODEL_SIL_INCLUDE = ["rails", "rail_side", "kant_support", "apron_cabinet", "legs_out", "legs_in", "cushions", "boots", "traps", "sights"]
OURS_SIL_INCLUDE = ["railtop", "subrail", "cushion", "apron", "brdoor", "leg", "leveler", "casting", "liner", "boot", "sight", "ballreturn", "bed", "facing"]
ABOVE_BED_MODEL = ["rails", "cushions", "boots", "sights"]
ABOVE_BED_OURS = ["railtop", "subrail", "casting", "liner", "cushion", "boot", "sight", "facing"]
# painter order for the coloured group raster (silhouettes_model.py)
MODEL_SIL_ORDER_TOP = ["traps", "legs_in", "legs_out", "apron_cabinet", "kant_support", "rail_side", "cushions", "rails", "boots", "sights"]
MODEL_SIL_ORDER_ELEV = ["traps", "legs_in", "legs_out", "apron_cabinet", "kant_support", "rail_side", "rails", "cushions", "boots", "sights"]

# visual_weight.py: key, label, model silhouette groups, ours families, counted views, deviation key
VW_VIEWS = ["top", "side", "end"]
VISUAL_WEIGHT_PAIRS = [
    ("apron_cabinet", "apron band + cabinet + bottom board  <->  apron-skirt + ball-return door", ["rail_side", "apron_cabinet_nobed"], ["apron", "brdoor"], ["side", "end"], "apronband_cabinet__apron"),
    ("legs", "legs (shell + core)  <->  leg + leveler", ["legs_out", "legs_in"], ["leg", "leveler"], ["side", "end"], "legs__leg_leveler"),
    ("railassembly", "rail caps + 45deg corner blocks  <->  railtop + subrail + casting + liner", ["rails"], ["railtop", "subrail", "casting", "liner"], VW_VIEWS, "railassembly__railtop_subrail_casting_liner"),
    ("boots", "leather boots  <->  boot* (collar/rim/bowl/skirt/hem/stitch; leather only)", ["boots"], ["boot"], VW_VIEWS, "leather__boot"),
    ("cushions", "rubber  <->  cushion", ["cushions"], ["cushion"], VW_VIEWS, "rubber__cushion"),
    ("sights", "romb  <->  sight", ["sights"], ["sight"], ["top"], "romb__sight"),
    ("ballreturn", "traps (pocket cups)  <->  returnshaft + returnfloor  [hidden inside the base]", ["traps"], ["ballreturn"], ["side", "end"], "traps__ballreturn"),
]
# visual_weight2.py (Metric C): key, model groups, ours families; assembly per view
VW2_PAIRS = [
    ("apron_cabinet", ["rail_side", "apron_cabinet"], ["apron", "brdoor"]),
    ("legs", ["legs_out", "legs_in"], ["leg", "leveler"]),
    ("railassembly", ["rails"], ["railtop", "subrail", "casting", "liner"]),
    ("boots", ["boots"], ["boot"]),
    ("cushions", ["cushions"], ["cushion"]),
    ("sights", ["sights"], ["sight"]),
    ("ballreturn", ["traps"], ["ballreturn"]),
]
VW2_ASSEMBLY = {"top": (ABOVE_BED_MODEL, ABOVE_BED_OURS), "side": (None, None), "end": (None, None)}
VW2_ABOVE = {"railassembly", "boots", "cushions", "sights"}

# ---------------------------------------------------------------------------------------------------------------------
# Law-adjusted silhouettes (law_adjust.py, --law-adjust): which of OUR families each MFR-decided delta moves.
#   legs      -> translated inward toward the plan centre (EN-05 feet datum: 89.75 x 44.75 in outside-to-outside at the feet)
#   cabinet   -> bottom edge extended downward (EN-06: cabinet bottom 15 in above the floor; the model has 360 mm)
#   envelope  -> every other silhouette family shifted outward per half (EN-01: 104 x 59 in; the model has 2661.5 x 1509.5)
# ---------------------------------------------------------------------------------------------------------------------
LAW_LEG_FAMILIES = ("leg", "leveler")
LAW_CABINET_FAMILIES = ("apron",)
LAW_ENVELOPE_FAMILIES = tuple(f for f in OURS_SIL_INCLUDE if f not in LAW_LEG_FAMILIES)
