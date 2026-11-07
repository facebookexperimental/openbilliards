// Copyright (c) Meta Platforms, Inc. and affiliates.

// GENERATED from docs/geometry/ball-return-track.schema.json by
//   node web/tools/test-ballreturn.mjs --sync-schema
// Do not edit: the node gate refuses a mirror that differs from the docs file byte for
// byte (arm n1). The docs file is the ONE published schema; this module exists so the
// browser can enforce it before any geometry is built without an extra fetch (the
// docs tree is not served by the app) and without JSON import attributes.
export default {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "openbilliards/ball-return-track/1",
  "title": "OpenBilliards ball-return track definition (feature 037, issue #650) (1.2: the runway minimum is topology-conditional)",
  "description": "One machine-readable metric definition of a table's ball-return system (ADR-0015 law: drawing == JSON == model == gate). Render-only: the kernel never reads it. Frame = the table-definition datum frame TCS-TBL-01 (X head->foot along the length, Y up, Z left->right viewed from the head rail, origin at the table centre on the playing surface), millimetres; runtime three.js metres = (X, Y, Z) x 0.001 axis for axis. Every dimensioned field carries exactly one provenance record (LAW-PURCHASED-BASELINE item 4).",
  "type": "object",
  "required": [
    "schema",
    "doc",
    "units",
    "datum_frame",
    "ball",
    "support",
    "rolling_resistance",
    "runways",
    "pockets"
  ],
  "additionalProperties": false,
  "properties": {
    "schema": {
      "const": "openbilliards/ball-return-track/1"
    },
    "doc": {
      "type": "object",
      "required": [
        "table_id",
        "title",
        "status",
        "revision",
        "date",
        "sources"
      ],
      "additionalProperties": false,
      "properties": {
        "table_id": {
          "type": "string",
          "description": "Catalog table id this track belongs to (TABLE_SPECS key). A TEST definition names the table it is ARMED on by the scripted URL parameter; it is never bound to that table's spec."
        },
        "title": {
          "type": "string"
        },
        "status": {
          "type": "string",
          "enum": [
            "TEST",
            "PROPOSAL",
            "ACCEPTED"
          ],
          "description": "TEST = synthetic fixture, never shipped as a table; PROPOSAL = a lane export awaiting the orchestrator's seal; ACCEPTED = sealed."
        },
        "revision": {
          "type": "string"
        },
        "date": {
          "type": "string",
          "format": "date"
        },
        "issue": {
          "type": "string"
        },
        "sources": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "Attributable sources (dossier files, manufacturer pages with sha where recorded, purchased-model family names)."
        },
        "notes": {
          "type": "string"
        }
      }
    },
    "units": {
      "type": "object",
      "required": [
        "length",
        "angle"
      ],
      "additionalProperties": false,
      "properties": {
        "length": {
          "const": "mm"
        },
        "angle": {
          "const": "deg"
        }
      }
    },
    "datum_frame": {
      "type": "object",
      "required": [
        "id",
        "axes",
        "runtime_mapping"
      ],
      "additionalProperties": true,
      "properties": {
        "id": {
          "const": "TCS-TBL-01"
        },
        "axes": {
          "type": "object",
          "required": [
            "+X",
            "+Y",
            "+Z"
          ],
          "properties": {
            "+X": {
              "const": "head rail toward foot rail"
            },
            "+Y": {
              "const": "up from the playing surface"
            },
            "+Z": {
              "const": "left to right viewed from head rail"
            }
          }
        },
        "runtime_mapping": {
          "const": "three.js (x, y, z) = (X, Y, Z) x 0.001; kernel (kx, ky, kz) = (Z, X, Y) x 0.001"
        },
        "pocket_order": {
          "const": "kernel order: 0 lb, 1 lc, 2 lt, 3 rb, 4 rc, 5 rt (l/r = sign of Z, b/c/t = -X / 0 / +X)"
        }
      }
    },
    "ball": {
      "type": "object",
      "required": [
        "reference_diameter_mm",
        "provenance"
      ],
      "additionalProperties": false,
      "properties": {
        "reference_diameter_mm": {
          "type": "number",
          "exclusiveMinimum": 0,
          "description": "The discipline ball the tray capacity is derived against (WPA 57.15 / WPBSA 52.5). The RUNTIME uses the active rack's kernel radius for every offset; this value only closes the capacity identity."
        },
        "provenance": {
          "$ref": "#/$defs/provenance"
        }
      }
    },
    "support": {
      "$ref": "#/$defs/support"
    },
    "rolling_resistance": {
      "type": "object",
      "required": [
        "class",
        "u_r",
        "provenance"
      ],
      "additionalProperties": false,
      "properties": {
        "class": {
          "type": "string",
          "description": "A repo ClothPreset id (crates/pool-core/src/params.rs ClothPreset / sdk/ts/src/shot.ts clothPreset); the runtime cross-checks the pair (class, u_r) against its mirror table (track.js PRESET_UR) — a new class lands by adding a preset name to the kernel + the mirror, never by editing this schema."
        },
        "u_r": {
          "type": "number",
          "exclusiveMinimum": 0,
          "description": "Centre deceleration / g on a FLAT FLOOR (the kernel convention, evolve.rs: a = u_r·g). On a twin rail the runtime applies (7/5)(r/ρ)·u_r (the same normal-force-offset moment about the two-rail contact axis; track.js resistCoeff)."
        },
        "provenance": {
          "$ref": "#/$defs/provenance",
          "description": "tag PROXY is spelled as DERIVED with the proxy stated in source; the steel-wire / rubber-channel class is an OPEN research item."
        }
      }
    },
    "runways": {
      "type": "array",
      "minItems": 1,
      "items": {
        "$ref": "#/$defs/runway"
      },
      "description": "Every polyline of the system. The MINIMUM count is topology-conditional and lives in the top-level anyOf (trunk-tray: >= 2, an entry and the tray; terminal-chutes: >= 1, a chute that runs from the pocket to its own stop is a complete system). An empty list is refused for both. trunk-tray: exactly one runway is the tray (tray.runway) and every runway reaches it. terminal-chutes: every runway with next = null is a role-chute runway with a `stop`, and every chute is some served pocket's route end. Vertices are the SUPPORT line (rail-axis midline / channel floor centreline), not the ball-centre path."
    },
    "hooks": {
      "type": "array",
      "items": {
        "type": "object",
        "required": [
          "id",
          "runway",
          "s_mm",
          "provenance"
        ],
        "additionalProperties": false,
        "properties": {
          "id": {
            "type": "string"
          },
          "runway": {
            "type": "string"
          },
          "s_mm": {
            "type": "number",
            "minimum": 0,
            "description": "Arclength station along the runway's support line."
          },
          "kind": {
            "type": "string"
          },
          "provenance": {
            "$ref": "#/$defs/provenance"
          }
        }
      },
      "description": "Suspension / hanger stations (the XW101's eight gold hooks). Metadata for the body lanes and the audio slice; zero kinematic effect in v1."
    },
    "pockets": {
      "type": "array",
      "minItems": 1,
      "maxItems": 6,
      "items": {
        "type": "object",
        "required": [
          "index",
          "entry_runway",
          "exit_below_y_mm",
          "provenance"
        ],
        "additionalProperties": false,
        "properties": {
          "index": {
            "type": "integer",
            "minimum": 0,
            "maximum": 5,
            "description": "Kernel pocket index (datum_frame.pocket_order)."
          },
          "entry_runway": {
            "type": "string",
            "description": "The runway whose FIRST vertex is the landing station under this pocket. The runtime requires that station to lie within the pocket's visible-fall radius in plan (fall centre from table.js pocketVisualFalls, else the kernel cup). V5 (1.1): the station must lie within the pocket's visible-fall radius OR within its kernel cup radius in plan — on ring / bag systems (the Star) the ball leaves the bag at the cup, not at the inboard visual fall."
          },
          "notes": {
            "type": "string"
          },
          "exit_below_y_mm": {
            "type": "number",
            "maximum": -55,
            "description": "The LOWEST SOLID of this pocket's assembly (cup floor disc / boot bottom / bucket disc), TCS Y in mm. The extension keeps the ball culled (as the sink left it) until the ball's TOP is below this height, so a re-shown ball never passes through the cup floor; the entry station's ball top must lie at or below it (V5). Must be at or below the cull line −55."
          },
          "provenance": {
            "$ref": "#/$defs/provenance"
          }
        }
      }
    },
    "unserved_pockets": {
      "type": "array",
      "items": {
        "type": "object",
        "required": [
          "index",
          "reason"
        ],
        "additionalProperties": false,
        "properties": {
          "index": {
            "type": "integer",
            "minimum": 0,
            "maximum": 5
          },
          "reason": {
            "type": "string",
            "minLength": 8
          }
        }
      },
      "description": "Every table pocket must be either served or listed here with a reason (the validator refuses a silent gap). Unserved pockets keep the legacy sink cull byte-identically."
    },
    "tray": {
      "type": "object",
      "required": [
        "runway",
        "end",
        "capacity_balls",
        "length_mm",
        "provenance"
      ],
      "additionalProperties": false,
      "properties": {
        "runway": {
          "type": "string",
          "description": "The terminal runway (next = null). Its LAST vertex is the wall station: the first ball rests one ball radius before it."
        },
        "end": {
          "const": "wall"
        },
        "capacity_balls": {
          "type": "integer",
          "minimum": 1,
          "description": "The drawer / collector read (MFR or MODEL). Identity enforced at load: capacity_balls == floor(length_mm / ball.reference_diameter_mm)."
        },
        "length_mm": {
          "type": "number",
          "exclusiveMinimum": 0,
          "description": "Usable length of the tray runway's support line (must equal the runway's derived arclength within 1 mm)."
        },
        "support": {
          "$ref": "#/$defs/support",
          "description": "Optional override (a steel drawer floor under a wire slide is a channel)."
        },
        "provenance": {
          "$ref": "#/$defs/provenance"
        }
      },
      "description": "trunk-tray only: the ONE terminal runway (next = null) whose LAST vertex is the wall station. Forbidden under terminal-chutes (each chute carries its own stop)."
    },
    "debug_visual": {
      "type": "boolean",
      "default": false,
      "description": "TEST only: the module draws the support lines and the tray box (obBallReturnDebug*) at scene root. Refused when doc.status != TEST."
    },
    "checks": {
      "type": "object",
      "additionalProperties": true,
      "properties": {
        "drain_monotonic": {
          "const": true,
          "description": "Every non-tray edge must satisfy k*g*sin(theta) > u_r*g*cos(theta) at the reference ball (validator law, not a claim)."
        },
        "determinism_sha256": {
          "type": "string",
          "pattern": "^[0-9a-f]{64}$",
          "description": "The committed pin of the fixture's id-bound sampled-pose + rest-ladder hash (web/tools/test-ballreturn.mjs --pin; kinematics.js sampleSolution: per 240 Hz sample and ball [id, x, y, z, qx, qy, qz, qw], then the rest ladder as [id, D] pairs in id order)."
        }
      }
    },
    "arrival": {
      "type": "object",
      "required": [
        "restitution",
        "provenance"
      ],
      "additionalProperties": false,
      "description": "Ball-on-ball / ball-on-wall arrival law on the track. The runtime implements ONE law — perfectly inelastic (e = 0: equal masses share a common velocity, the wall is infinite mass): the owner's 「一个接一个堆」 read and research R5. The block exists so the fixture STATES it as a DESIGN read rather than leaving it implicit; a definition that names any other value is refused (V10).",
      "properties": {
        "restitution": {
          "const": 0,
          "description": "Coefficient of restitution at arrival contacts; the only value the runtime implements."
        },
        "provenance": {
          "$ref": "#/$defs/design_provenance"
        }
      }
    },
    "topology": {
      "type": "string",
      "enum": [
        "trunk-tray",
        "terminal-chutes"
      ],
      "description": "trunk-tray (default when absent — the 1.0 form): every runway drains into ONE terminal tray whose end is the wall (JOY / Diamond class). terminal-chutes: each served pocket feeds its own TERMINAL chute (role chute, next null) whose `stop` is the wall — balls queue in the chute against the stop and each other; there is no trunk and no tray (Star XW101 class). `tray` is required in trunk-tray and forbidden in terminal-chutes."
    }
  },
  "$defs": {
    "provenance": {
      "type": "object",
      "required": [
        "tag",
        "source"
      ],
      "additionalProperties": false,
      "properties": {
        "tag": {
          "type": "string",
          "enum": [
            "MFR",
            "MODEL",
            "DERIVED",
            "PHOTO",
            "TEST"
          ],
          "description": "MFR = manufacturer-published; MODEL = purchased-model read (method in source); DERIVED = formula over MFR/MODEL/table quantities (formula in source); PHOTO = measured off an attributed photo; TEST = synthetic fixture value (legal only under doc.status TEST). DESIGN is NOT admissible here — only $defs/design_provenance (the arrival block) carries it."
        },
        "source": {
          "type": "string",
          "minLength": 4
        }
      }
    },
    "support": {
      "oneOf": [
        {
          "type": "object",
          "required": [
            "kind",
            "gauge_mm",
            "rail_diameter_mm",
            "provenance"
          ],
          "additionalProperties": false,
          "properties": {
            "kind": {
              "const": "twin-rail"
            },
            "gauge_mm": {
              "type": "number",
              "exclusiveMinimum": 0,
              "description": "Centre-to-centre spacing of the two wires / rails. Must be < ball diameter + rail diameter (else the ball falls through)."
            },
            "rail_diameter_mm": {
              "type": "number",
              "exclusiveMinimum": 0
            },
            "provenance": {
              "$ref": "#/$defs/provenance"
            }
          },
          "description": "Ball rides two parallel rails. Support line = the midline between the rail AXES. Derived: centre offset h = sqrt((r + r_w)^2 - (g/2)^2); rolling radius rho = sqrt(r^2 - c^2), c = (g/2) * r / (r + r_w); inertia factor k = 1 / (1 + (2/5) (r/rho)^2)."
        },
        {
          "type": "object",
          "required": [
            "kind",
            "width_mm",
            "provenance"
          ],
          "additionalProperties": false,
          "properties": {
            "kind": {
              "const": "channel"
            },
            "width_mm": {
              "type": "number",
              "exclusiveMinimum": 0
            },
            "provenance": {
              "$ref": "#/$defs/provenance"
            }
          },
          "description": "Ball rolls on a flat channel floor (Diamond gully, a steel drawer). Support line = the floor centreline. Derived: h = r, rho = r, k = 5/7."
        }
      ]
    },
    "runway": {
      "type": "object",
      "required": [
        "id",
        "points_mm",
        "next",
        "provenance"
      ],
      "additionalProperties": false,
      "properties": {
        "id": {
          "type": "string",
          "pattern": "^[a-z0-9-]+$"
        },
        "role": {
          "type": "string",
          "enum": [
            "entry",
            "trunk",
            "tray",
            "chute"
          ],
          "description": "entry = leaves a pocket; trunk = fed by junctions; tray = the trunk-tray collector; chute = a TERMINAL per-pocket chute (terminal-chutes topology; next null; carries `stop`)."
        },
        "points_mm": {
          "type": "array",
          "minItems": 2,
          "items": {
            "type": "array",
            "minItems": 3,
            "maxItems": 3,
            "items": {
              "type": "number"
            }
          },
          "description": "Ordered support-line vertices [X, Y, Z] in mm. Travel direction = vertex order. Consecutive vertices must be distinct."
        },
        "next": {
          "type": [
            "string",
            "null"
          ],
          "description": "The runway this one lands on (junction), or null for a terminal runway (the tray, or a chute under terminal-chutes)."
        },
        "support": {
          "$ref": "#/$defs/support",
          "description": "Optional per-runway override of the top-level support."
        },
        "notes": {
          "type": "string"
        },
        "provenance": {
          "$ref": "#/$defs/provenance"
        },
        "stop": {
          "type": "object",
          "required": [
            "kind",
            "wall_s_mm",
            "capacity_balls",
            "provenance"
          ],
          "additionalProperties": false,
          "description": "terminal-chutes only, on a role-chute runway: the stop that ends the chute. wall_s_mm is the arclength station of the STOP FACE along the support line, measured from the chute's first vertex — the first ball rests one ball radius before it, later arrivals queue behind (e = 0 arrival, the arrival block). Support-line vertices BEYOND the wall (a clamp lip, an up-turn) are the stop's own body: never traversed, exempt from the drain law, at most one ball diameter long (V6).",
          "properties": {
            "kind": {
              "type": "string",
              "enum": [
                "ring",
                "bumper",
                "clamp",
                "face"
              ],
              "description": "What the ball rests against (a read, named in provenance)."
            },
            "wall_s_mm": {
              "type": "number",
              "exclusiveMinimum": 0,
              "description": "Arclength station of the stop face along the chute (mm). Must not exceed the chute's arclength + 1 mm (V6)."
            },
            "capacity_balls": {
              "type": "integer",
              "minimum": 1,
              "description": "Identity enforced at load: capacity_balls == floor(wall_s_mm / ball.reference_diameter_mm) (V6)."
            },
            "provenance": {
              "$ref": "#/$defs/provenance"
            }
          }
        }
      },
      "allOf": [
        {
          "anyOf": [
            {
              "not": {
                "properties": {
                  "role": {
                    "const": "chute"
                  }
                },
                "required": [
                  "role"
                ]
              }
            },
            {
              "required": [
                "stop"
              ],
              "properties": {
                "next": {
                  "const": null
                }
              }
            }
          ],
          "description": "a role-chute runway carries a stop and is terminal (next null)"
        },
        {
          "anyOf": [
            {
              "not": {
                "required": [
                  "stop"
                ]
              }
            },
            {
              "properties": {
                "role": {
                  "const": "chute"
                }
              },
              "required": [
                "role"
              ]
            }
          ],
          "description": "only a role-chute runway carries a stop"
        }
      ]
    },
    "design_provenance": {
      "type": "object",
      "required": [
        "tag",
        "source"
      ],
      "additionalProperties": false,
      "properties": {
        "tag": {
          "const": "DESIGN",
          "description": "A modelling decision traceable to the brief / research (named in source), explicitly NOT a measurement. Admissible only where the schema enumerates the admissible value (arrival.restitution)."
        },
        "source": {
          "type": "string",
          "minLength": 4
        }
      }
    }
  },
  "$comment": "Revision 1.1 (2026-09-05, ORDER-BALLRETURN-6): additive. `topology` selects trunk-tray (1.0 form, default) or terminal-chutes (per-pocket terminal chutes with a stop; no tray). 1.0 documents validate unchanged. Revision 1.2 (2026-09-05, ORDER-BALLRETURN-12, review r9 P2-1): a relaxation. `runways.minItems` moves from an unconditional 2 into the topology branches below (trunk-tray keeps 2, terminal-chutes takes 1) so a terminal chute that is ONE runway from pocket to stop -- the form each of the Star XW101 export's six chutes takes, that export escaping the refusal only because it has six of them -- is not refused at V0 before the topology is even read. Every 1.0 / 1.1 document validates unchanged.",
  "anyOf": [
    {
      "title": "trunk-tray: a tray, and at least two runways (an entry and the tray)",
      "allOf": [
        {
          "anyOf": [
            {
              "not": {
                "required": [
                  "topology"
                ]
              }
            },
            {
              "properties": {
                "topology": {
                  "const": "trunk-tray"
                }
              }
            }
          ]
        },
        {
          "required": [
            "tray"
          ]
        },
        {
          "properties": {
            "runways": {
              "minItems": 2
            }
          }
        }
      ]
    },
    {
      "title": "terminal-chutes: no tray, and at least one chute runway",
      "allOf": [
        {
          "required": [
            "topology"
          ]
        },
        {
          "properties": {
            "topology": {
              "const": "terminal-chutes"
            }
          }
        },
        {
          "not": {
            "required": [
              "tray"
            ]
          }
        }
      ]
    }
  ]
};
