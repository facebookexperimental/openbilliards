#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""matidentity_rox.py — MATERIAL-IDENTITY law row for every NON-TARGET table (fence law from the Diamond review round 4
P1: a global material edit leaked into another table while every mesh hash stayed identical).

Compares the per-mesh material exports of matidentity_dump_rox.mjs: LIVE tree vs the fence BASE tree, for each other
table, in two variants — DIRECT boot and VIA-OX (booted on rasson_ox_9ft, switched to the table in the same session).
A row is GREEN only when every mesh has the same material slots with identical type / class / colour / emissive /
roughness / metalness / envMapIntensity / clearcoat / clearcoatRoughness / specularIntensity / sheen / opacity /
transparent / side / normalScale / clearcoatNormalScale and identical CONTENT hashes for map / normalMap / roughnessMap
/ metalnessMap / emissiveMap / clearcoatNormalMap / aoMap / alphaMap / envMap; a mesh set difference is RED too.

Red arm (--arm NAME=DIR ...): each arm dir holds exports made from a deliberately mutated tree; every arm must produce
at least one RED row or the gate prints NOT ARMED and fails.

Usage: python3 tools/render/ghrox/matidentity_rox.py --base /tmp/ox-a2/matid/base --live /tmp/ox-a2/matid/live
         [--live-via /tmp/ox-a2/matid/live-via] --transitions <matstate --all JSON>
         --tables a,b,c --out /tmp/ox-a2/matid/out [--arm global=/tmp/.../arm-global ...] [--judge]
"""
import argparse, json, os, sys
FIELDS = ["type", "obClass", "color", "emissive", "emissiveIntensity", "roughness", "metalness", "envMapIntensity", "clearcoat", "clearcoatRoughness",
          "specularIntensity", "sheen", "opacity", "transparent", "side", "normalScale", "clearcoatNormalScale"]
TEX = ["map", "normalMap", "roughnessMap", "metalnessMap", "emissiveMap", "clearcoatNormalMap", "aoMap", "alphaMap", "envMap"]

def load(d, t):
    p = os.path.join(d, t + ".json")
    if not os.path.exists(p): return None
    return json.load(open(p))

def texkey(rec):
    if rec is None: return None
    if rec.get("kind") == "cube": return ("cube", tuple(rec.get("faces") or []), rec.get("colorSpace"))
    return (rec.get("kind"), rec.get("hash"), tuple(rec.get("size") or []), rec.get("colorSpace"), tuple(rec.get("repeat") or []), tuple(rec.get("wrap") or []))

def compare(base, live):
    diffs = []
    if base is None or live is None: return [("export", "missing base or live export", None, None)]
    b = {r["key"]: r for r in base["rows"]}; l = {r["key"]: r for r in live["rows"]}
    for k in sorted(set(b) - set(l)): diffs.append((k, "mesh only in BASE", None, None))
    for k in sorted(set(l) - set(b)): diffs.append((k, "mesh only in LIVE", None, None))
    for k in sorted(set(b) & set(l)):
        bs, ls = b[k]["slots"], l[k]["slots"]
        if len(bs) != len(ls): diffs.append((k, "material slot count", len(bs), len(ls))); continue
        for i, (bm, lm) in enumerate(zip(bs, ls)):
            if (bm is None) != (lm is None): diffs.append((k, f"slot {i} null-ness", bm is None, lm is None)); continue
            if bm is None: continue
            for f in FIELDS:
                if bm.get(f) != lm.get(f): diffs.append((k, f"slot {i} {f}", bm.get(f), lm.get(f)))
            for f in TEX:
                if texkey(bm.get(f)) != texkey(lm.get(f)):
                    diffs.append((k, f"slot {i} {f} (content hash)", (bm.get(f) or {}).get("hash", (bm.get(f) or {}).get("faces")), (lm.get(f) or {}).get("hash", (lm.get(f) or {}).get("faces"))))
    return diffs

def transition_rows(census, tables):
    """Every A -> OX and OX -> A pair must carry independently read records.

    Judge material values, not the producer's verdict. Incoming OX is compared
    with a fresh OX boot; outgoing A is compared with its own fresh boot.
    """
    rows = {}
    pairs = census.get("pairs", [])
    ids = [pair.get("a") for pair in pairs]
    if (census.get("b") != "rasson_ox_9ft" or len(ids) != len(set(ids))
            or set(ids) != set(tables) or set(census.get("tables", [])) != set(tables)):
        rows["coverage"] = [("transitions", "missing, duplicate or unexpected table -> OX pair", sorted(tables), ids)]
    fresh = census.get("oxFreshMaterials")
    if not fresh or not any(row.get("name", "").startswith("dm-sight-") for row in fresh.get("rows", [])):
        rows["fresh-OX"] = [("sights", "fresh OX sight inventory missing or empty", None, None)]
    for pair in pairs:
        table = pair.get("a")
        materials = pair.get("materials", {})
        rows[f"{table}/A-to-OX"] = compare(fresh, materials.get("incoming"))
        rows[f"{table}/OX-to-A"] = compare(materials.get("fresh"), materials.get("outgoing"))
        if pair.get("Sb", {}).get("tableBuilt") != "rasson_ox_9ft":
            rows[f"{table}/A-to-OX"].append(("table", "incoming renderer identity", "rasson_ox_9ft", pair.get("Sb", {}).get("tableBuilt")))
        if pair.get("S0", {}).get("tableBuilt") != table or pair.get("S1", {}).get("tableBuilt") != table:
            rows[f"{table}/OX-to-A"].append(("table", "outgoing renderer identity", table, pair.get("S1", {}).get("tableBuilt")))
    return rows

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--base", required=True); ap.add_argument("--live", required=True); ap.add_argument("--live-via"); ap.add_argument("--transitions", required=True)
    ap.add_argument("--tables", required=True); ap.add_argument("--out", required=True); ap.add_argument("--arm", action="append", default=[]); ap.add_argument("--judge", action="store_true")
    a = ap.parse_args(); os.makedirs(a.out, exist_ok=True); tables = [t for t in a.tables.split(",") if t]
    rows = []; red = 0; report = {"base": a.base, "live": a.live, "live_via": a.live_via, "tables": {}, "arms": {}}
    L = ["# MATIDENTITY-ROX — material identity of every non-target table vs the fence base export (LAW)", "",
         f"base export `{a.base}` · live export `{a.live}`" + (f" · live via-OX export `{a.live_via}`" if a.live_via else ""), "",
         "| table | variant | meshes (base / live) | textures hashed | material diffs | status |", "|---|---|---|---|---|---|"]
    for t in tables:
        base = load(a.base, t)
        for variant, d in (("direct", a.live),) + ((("via-OX", a.live_via),) if a.live_via else ()):
            live = load(d, t); diffs = compare(base, live); status = "GREEN" if not diffs else "**RED**"; red += bool(diffs)
            report["tables"][f"{t}/{variant}"] = {"diffs": [list(x) for x in diffs], "meshes_base": base and base["meshes"], "meshes_live": live and live["meshes"]}
            L.append(f"| {t} | {variant} | {base and base['meshes']} / {live and live['meshes']} | {live and live.get('textures')} | {len(diffs)} | {status} |")
            for k, what, bv, lv in diffs[:12]: L.append(f"|  ↳ `{k}` | {what} | base `{bv}` | live `{lv}` | | |")
    if a.transitions:
        census = json.load(open(a.transitions))
        transitions = transition_rows(census, tables)
        report["transition_source"] = a.transitions
        report["transitions"] = transitions
        for name, diffs in transitions.items():
            red += bool(diffs)
            L.append(f"| {name} | ordered transition | | | {len(diffs)} | {'**RED**' if diffs else 'GREEN'} |")
            for key, what, before, after in diffs[:12]:
                L.append(f"| ↳ `{key}` | {what} | expected `{before}` | actual `{after}` | | |")
    L += ["", f"LAW: every declared material-identity row, 0 diffs → **{'GREEN' if red == 0 else 'RED'}** ({red} red rows)"]
    armed_ok = True
    for arm in a.arm:
        name, d = arm.split("=", 1); fired = 0; detail = []
        for t in tables:
            base = load(a.base, t); mut = load(d, t)
            if mut is None: continue
            diffs = compare(base, mut); fired += bool(diffs); detail.append(f"{t}: {len(diffs)} diffs" + (f" (e.g. {diffs[0][0]} {diffs[0][1]}: base {diffs[0][2]} → {diffs[0][3]})" if diffs else ""))
        ok = fired > 0; armed_ok &= ok; report["arms"][name] = {"fired_tables": fired, "detail": detail, "ok": ok}
        L += ["", f"Red arm `{name}` ({d}): {'FIRED' if ok else 'NOT FIRED'} on {fired} table(s) — " + "; ".join(detail)]
    L += ["", f"Red arms: {'OK' if (armed_ok and a.arm) else ('NONE DECLARED' if not a.arm else 'NOT ARMED')}"]
    open(os.path.join(a.out, "MATIDENTITY-ROX.md"), "w").write("\n".join(L) + "\n"); json.dump(report, open(os.path.join(a.out, "matidentity.json"), "w"), indent=1)
    verdict = "GREEN" if red == 0 else "RED"; print(f"[matidentity-rox] {verdict}: {len(tables)} tables, {red} red rows; arms {'OK' if (armed_ok and a.arm) else 'NOT ARMED'} -> {a.out}/MATIDENTITY-ROX.md")
    if a.judge and (red or (a.arm and not armed_ok)): sys.exit(1)

if __name__ == "__main__": main()
