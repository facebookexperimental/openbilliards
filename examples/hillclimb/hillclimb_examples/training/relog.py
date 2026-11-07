# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Physics re-log: recorded games replayed in the kernel, V's training rows, the 2-ply's leaves.

A game record of hillclimb_examples.training.datagen holds the game key and every played stroke
with its call (and the cue-ball placement while the cue ball was in hand). replay() plays those
strokes again through straightpool.game.step from the key, with no agent: the kernel simulates
every stroke afresh and each result is checked against the record (scored, run after the stroke);
a difference raises ReplayMismatch. Two products are read off the replay:

- V's training rows (break_row). At a break decision, the first decision after a re-rack, with the
  cue ball on the table, the break ball is the one object ball that stayed on the table through the
  re-rack (break_ball). The row holds the cue ball and the break ball in the kernel frame and the
  make count of the played break stroke: the stroke is simulated again `m` times on draws of a
  stream of its own, and the label V learns is 1 - make / m.
- The bench leaves of the 2-ply (leaves_at). At a 14th-ball decision, two object balls on the table
  with the cue ball among them, each stroke of a menu (by default the played one) is struck on
  `draws` draws: its fail bits say which draws missed the call, and each of the first `keep` draws
  that scores is carried through the rules (straightpool.game.advance), the re-rack included, to
  the next position: a leaf. A leaf at a break decision with the cue ball on the table and a break
  ball is the kind V scores ('break'); the others keep their kind (LEAF_KINDS). No leaf is scored
  here.

Streams (hillclimb.crn), every one derived from the game key; every simulation of decision i runs
with the decision's kernel seed (straightpool.game.kernel_seed):

    labels  crn.draw(crn.stream(namespace + '/label', key), i, j), j < m
    leaves  crn.draw(crn.stream(namespace + '/leaf', key), i, j), j < draws
"""

import argparse
import pathlib

from hillclimb import crn, runner, select
from hillclimb_examples.training import datagen
from straightpool import game as rules

#: The namespace of the re-log's streams unless the caller names its own.
NAMESPACE = "hillclimb/training/relog"

#: Draws behind a break row's make count (the label is 1 - make / m).
LABEL_DRAWS = 32

#: Draws per menu stroke at a 14th-ball decision, and how many of the first draws become leaves.
LEAF_DRAWS = 256
LEAF_KEEP = 8

#: The kinds of a leaf: a break decision with the cue ball on the table and a break ball (the kind
#: V scores), one with the cue ball in hand, one with all fifteen balls racked, and no break
#: decision at all.
LEAF_KINDS = ("break", "in-hand", "full-rack", "no-rerack")

#: The keys of every break row (V's training rows).
BREAK_KEYS = ("game", "decision", "cue", "break_ball", "bb", "stroke", "call", "m", "make")

CUE = datagen.CUE


class ReplayMismatch(RuntimeError):
    """A replayed stroke did not reproduce its record (or the record does not fit its game)."""


def object_balls(positions):
    """The object-ball ids of {ball id: (x, y)}, ascending."""
    return sorted(b for b in positions if b != CUE)


def break_ball(before, pocketed):
    """The break ball after a re-rack: the one object ball of the position before the stroke that
    ended the rack (`before`, {ball id: (x, y)}) that the stroke did not pocket (`pocketed`, ball
    ids); None unless there is exactly one."""
    gone = set(pocketed)
    left = [b for b in object_balls(before) if b not in gone]
    return left[0] if len(left) == 1 else None


def is_fourteenth(positions):
    """Whether a position is a 14th-ball decision: the cue ball and two object balls on the table,
    so that a pot leaves one ball and brings the re-rack."""
    return CUE in positions and len(object_balls(positions)) == 2


def label(make, m):
    """V's label of a break row: the share of the m draws that missed, 1 - make / m."""
    return 1.0 - make / m


def replay(record):
    """Yield (game, action, judgment, outcome, next game) for every recorded stroke of a game
    record, each stroke simulated again from the key (the outcome is None where the agent declared
    no callable pot). ReplayMismatch at the first stroke whose result differs from the record, with
    the kernel build named when it is not the record's."""
    game = rules.new_game(record["key"])
    for entry in record["strokes"]:
        if game.over is not None or game.decision != entry["decision"]:
            raise ReplayMismatch(f"game {record['key']}: the record goes on at decision "
                                 f"{entry['decision']} where the replay is at {game.decision} "
                                 f"(over: {game.over})")
        action = datagen.action_of(entry)
        nxt, judgment, outcome = rules.step(game, action, noise=record["noise"],
                                            cap=record["cap"])
        if bool(judgment.scored) != bool(entry["scored"]) or nxt.run != entry["run"]:
            build = ("" if record["kernel"] == datagen.kernel_id() else
                     "; the record was made on another kernel build")
            raise ReplayMismatch(f"game {record['key']} decision {game.decision}: replayed "
                                 f"scored={judgment.scored} run={nxt.run}, recorded "
                                 f"scored={entry['scored']} run={entry['run']}{build}")
        yield game, action, judgment, outcome, nxt
        game = nxt


def break_row(game, action, before, pocketed, *, m, noise, stream_seed, threads=1):
    """The training row of V at a break decision, or None when the decision has no row (the cue
    ball in hand, no call, or no single break ball). `before` and `pocketed` are the position before
    the stroke that ended the rack and the balls it pocketed."""
    positions = game.state.positions()
    bb = break_ball(before, pocketed)
    if CUE not in positions or action.call is None or bb is None or bb not in positions:
        return None
    d = game.decision
    draws = crn.block(stream_seed, d, m)
    make = datagen.make_count(game.state, action.stroke, action.call, draws, noise=noise,
                              seed=rules.kernel_seed(game), threads=threads)
    return {"game": int(game.key), "decision": d, "cue": list(positions[CUE]), "break_ball": bb,
            "bb": list(positions[bb]), "stroke": datagen.stroke_json(action.stroke),
            "call": datagen.call_json(action.call), "m": m, "make": make}


def leaf_of(j, game, nxt, outcome):
    """The leaf of draw j: the position after the stroke and the rules, with its kind and, for a
    'break' leaf, the cue ball and the break ball."""
    positions = nxt.state.positions()
    bb = break_ball(game.state.positions(), [b for b, _ in outcome.pocketed])
    if nxt.over is not None or not nxt.rack_untouched:
        kind = "no-rerack"
    elif CUE not in positions:
        kind = "in-hand"
    elif bb is None or bb not in positions:
        kind = "full-rack"
    else:
        kind = "break"
    scored = kind == "break"
    return {"j": j, "kind": kind, "position": datagen.position_json(positions),
            "cue": list(positions[CUE]) if scored else None, "break_ball": bb if scored else None,
            "bb": list(positions[bb]) if scored else None}


def leaves_at(game, menu, *, draws, keep, noise, stream_seed, threads=1):
    """The bench leaves of a 14th-ball decision (the cue ball on the table): per menu Action, its
    fail bits over `draws` draws ('0' scored, '1' missed) and the leaves of the first `keep` draws
    (None where the draw missed). A scoring draw's outcome goes through straightpool.game.advance,
    the rules' transition of a played stroke, to its leaf."""
    d = game.decision
    seed = rules.kernel_seed(game)
    normals = crn.block(stream_seed, d, draws)
    out = []
    for action in menu:
        outcomes = select.rollouts([(game.state, action.stroke)], normals, r=noise, seed=seed,
                                   threads=threads)[0]
        scored = [rules.judge(o, action.call).scored for o in outcomes]
        leaves = []
        for j in range(min(keep, draws)):
            if not scored[j]:
                leaves.append(None)
                continue
            nxt, _ = rules.advance(game, game.state, action.call, outcomes[j])
            leaves.append(leaf_of(j, game, nxt, outcomes[j]))
        out.append({"stroke": datagen.stroke_json(action.stroke),
                    "call": datagen.call_json(action.call),
                    "fails": "".join("0" if ok else "1" for ok in scored), "leaves": leaves})
    return out


def relog(record, *, m=LABEL_DRAWS, draws=LEAF_DRAWS, keep=LEAF_KEEP, namespace=NAMESPACE,
          threads=1):
    """The re-log of one game record: {'game', 'rows': V's break rows, 'leaves': one entry per
    14th-ball decision with the cue ball on the table, its position and its menu (the played
    stroke) with fail bits and leaves}."""
    key = int(record["key"])
    labels = crn.stream(f"{namespace}/label", key)
    leaf_stream = crn.stream(f"{namespace}/leaf", key)
    noise = record["noise"]
    rows, leaves, before = [], [], None
    for game, action, _, outcome, _ in replay(record):
        if game.rack_untouched and before is not None:
            row = break_row(game, action, *before, m=m, noise=noise, stream_seed=labels,
                            threads=threads)
            if row is not None:
                rows.append(row)
        positions = game.state.positions()
        if is_fourteenth(positions) and action.call is not None and action.place is None:
            leaves.append({"game": key, "decision": game.decision,
                           "position": datagen.position_json(positions),
                           "menu": leaves_at(game, [action], draws=draws, keep=keep, noise=noise,
                                             stream_seed=leaf_stream, threads=threads)})
        before = (positions, [] if outcome is None else [b for b, _ in outcome.pocketed])
    return {"game": key, "rows": rows, "leaves": leaves}


def _relog_task(task):
    """runner.run's task function: (record, settings) -> relog(record, **settings)."""
    record, settings = task
    return relog(record, **settings)


def relog_all(records, *, workers=1, **settings):
    """relog() of every record, in record order whatever the worker count."""
    return runner.run(_relog_task, [(r, settings) for r in records], workers=workers)


FILES = ("break-rows.jsonl", "leaves.jsonl")


def write(directory, logs):
    """Write the break rows and the leaf entries of relog results as FILES into `directory`;
    FileExistsError when either exists."""
    directory = pathlib.Path(directory)
    paths = [directory / name for name in FILES]
    for path in paths:
        if path.exists():
            raise FileExistsError(path)
    directory.mkdir(parents=True, exist_ok=True)
    datagen.write_jsonl(paths[0], [row for log in logs for row in log["rows"]])
    datagen.write_jsonl(paths[1], [entry for log in logs for entry in log["leaves"]])
    return paths


def main(argv=None):
    """Command line: re-log the games of a games.jsonl (hillclimb_examples.training.datagen) and
    write break-rows.jsonl and leaves.jsonl into a new directory."""
    parser = argparse.ArgumentParser(prog="python -m hillclimb_examples.training.relog",
                                     description=main.__doc__)
    parser.add_argument("games", help="games.jsonl written by hillclimb_examples.training.datagen")
    parser.add_argument("out", help="directory to write (its two files must not exist)")
    parser.add_argument("--m", type=int, default=LABEL_DRAWS, help="draws per break label")
    parser.add_argument("--draws", type=int, default=LEAF_DRAWS, help="draws per menu stroke")
    parser.add_argument("--keep", type=int, default=LEAF_KEEP, help="leading draws kept as leaves")
    parser.add_argument("--namespace", default=NAMESPACE, help="namespace of every stream")
    parser.add_argument("--workers", type=int, default=1, help="worker processes")
    args = parser.parse_args(argv)
    logs = relog_all(datagen.read_jsonl(args.games), workers=args.workers, m=args.m,
                     draws=args.draws, keep=args.keep, namespace=args.namespace)
    for path in write(args.out, logs):
        print(path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
