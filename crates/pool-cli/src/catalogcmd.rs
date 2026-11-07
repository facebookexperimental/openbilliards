// Copyright (c) Meta Platforms, Inc. and affiliates.

//! `pool-cli catalog` — inspect the kernel equipment registry (issue #15).

use crate::cliargs::wants_help;
use pool_core::{Calibration, EquipmentCatalog, CATALOG_VERSION};
use std::process::ExitCode;

pub const HELP: &str = "\
pool-cli catalog — the kernel equipment registry (versioned, immutable ids)

usage: pool-cli catalog list         every entry: category, id, display
                                     name, calibration badge + provenance
       pool-cli catalog show <id>    one entry's full parameters as JSON
       pool-cli catalog json         the whole registry as JSON (the same
                                     bytes pool-wasm's catalog_json() ships)

Use the ids with `run/batch/sweep --equipment axis=id[,...]` (axes
table|cloth|ballset|cue|cushion_model), pool_py rack/options kwargs, and
the SDK/app pickers. exit codes: 0 ok, 2 error (unknown id/usage).";

pub fn cmd_catalog(args: &[String]) -> ExitCode {
    if wants_help(args) {
        println!("{HELP}");
        return ExitCode::SUCCESS;
    }
    match run(args) {
        Ok(()) => ExitCode::SUCCESS,
        Err(e) => {
            eprintln!("error: {e}");
            ExitCode::from(2)
        }
    }
}

/// (badge, provenance text) of a calibration status.
fn badge(c: &Calibration) -> (&'static str, &str) {
    match c {
        Calibration::Calibrated { source } => ("calibrated", source),
        Calibration::Literature { source } => ("literature", source),
        Calibration::Estimated { note } => ("estimated ", note),
        // Measured (catalog v8): the list view shows the provenance doc;
        // per-parameter values + uncertainties are in `catalog show <id>`.
        Calibration::Measured { doc, .. } => ("measured  ", doc),
    }
}

/// One list row: (id, display text, calibration). The display text is the
/// entry's display_name plus the table-axis `[ui-hidden]` marker (catalog
/// v4: internal compatibility entries the app pickers filter out — the CLI
/// still lists them, flagged) or the cue-axis `[superseded-by <id>]`
/// marker (catalog v14, issue #283: de-branded ids keep resolving forever,
/// pickers offer the generic twin instead).
type EntryRow<'a> = (&'a str, String, &'a Calibration);

/// Category name + entry rows, in kernel order.
fn rows(c: &EquipmentCatalog) -> Vec<(&'static str, Vec<EntryRow<'_>>)> {
    fn common<'a>(
        it: impl Iterator<Item = (&'a String, String, &'a Calibration)>,
    ) -> Vec<EntryRow<'a>> {
        it.map(|(id, name, cal)| (id.as_str(), name, cal)).collect()
    }
    let table_name = |e: &pool_core::catalog::TableEntry| {
        if e.ui_hidden {
            format!("{} [ui-hidden]", e.display_name)
        } else {
            e.display_name.clone()
        }
    };
    let cue_name = |e: &pool_core::catalog::CueEntry| match &e.superseded_by {
        Some(twin) => format!("{} [superseded-by {twin}]", e.display_name),
        None => e.display_name.clone(),
    };
    vec![
        ("table", common(c.tables.iter().map(|e| (&e.id, table_name(e), &e.calibration)))),
        ("cloth", common(c.cloths.iter().map(|e| (&e.id, e.display_name.clone(), &e.calibration)))),
        ("ballset", common(c.ballsets.iter().map(|e| (&e.id, e.display_name.clone(), &e.calibration)))),
        ("cue", common(c.cues.iter().map(|e| (&e.id, cue_name(e), &e.calibration)))),
        (
            "cushion_model",
            common(c.cushion_models.iter().map(|e| (&e.id, e.display_name.clone(), &e.calibration))),
        ),
    ]
}

fn run(args: &[String]) -> Result<(), String> {
    let catalog = EquipmentCatalog::get();
    match args.first().map(String::as_str) {
        Some("list") => {
            println!("equipment catalog v{CATALOG_VERSION}");
            for (category, entries) in rows(catalog) {
                println!("\n{category}:");
                for (id, name, cal) in entries {
                    let (kind, source) = badge(cal);
                    println!("  {id:<24} [{kind}] {name}");
                    println!("  {:<24}   {source}", "");
                }
            }
            Ok(())
        }
        Some("show") => {
            let id = args
                .get(1)
                .ok_or("catalog show requires an entry id (see catalog list)")?;
            let entry = entry_json(catalog, id)
                .ok_or_else(|| format!("unknown catalog id {id:?} (see pool-cli catalog list)"))?;
            println!("{entry}");
            Ok(())
        }
        Some("json") => {
            let json = serde_json::to_string_pretty(catalog)
                .map_err(|e| format!("catalog serialization: {e}"))?;
            println!("{json}");
            Ok(())
        }
        _ => Err("catalog requires a subcommand: list | show <id> | json".into()),
    }
}

/// Pretty JSON of the entry with `id`, searched across every category (a
/// retired v8 Measured table or cloth id shows its neutral twin).
fn entry_json(c: &EquipmentCatalog, id: &str) -> Option<String> {
    let pretty = |v: serde_json::Result<String>| v.expect("catalog entries serialize");
    if let Some(e) = c.table_by_any_id(id) {
        return Some(pretty(serde_json::to_string_pretty(e)));
    }
    if let Some(e) = c.cloth_by_any_id(id) {
        return Some(pretty(serde_json::to_string_pretty(e)));
    }
    if let Some(e) = c.ballset(id) {
        return Some(pretty(serde_json::to_string_pretty(e)));
    }
    if let Some(e) = c.cue(id) {
        return Some(pretty(serde_json::to_string_pretty(e)));
    }
    c.cushion_model(id)
        .map(|e| pretty(serde_json::to_string_pretty(e)))
}
