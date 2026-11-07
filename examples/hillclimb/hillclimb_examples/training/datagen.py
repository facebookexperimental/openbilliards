# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Self-play data for C2: games with a search at the forced decisions, written as rows.

The generator plays games of straightpool.game with an agent and writes one row per decision. At a
decision with the cue ball on the table it first checks the agent's stroke: the stroke is simulated
on `draws` draws of the decision, and its make count is the number of draws on which the called
ball drops in the called pocket without a foul (straightpool.game.judge). The decision is a trigger
when the agent declares that no pot is callable ('giveup') or when its stroke makes fewer than half
of its draws ('forced'); otherwise it is 'healthy'. While the cue ball is in hand nothing is checked
('in-hand'), since the search below needs the cue ball on the table. A trigger runs the search
whose first stage C2 orders in play:

1. Stage 1. The Sobol stroke pool of the position (straightpool.candidates.sobol_pool) is laid and
   its first `prefix` members are struck once each in the kernel; when none of them scores, the
   next `extension` members are struck too. Every struck member gets its success flag. These flags
   are what C2, a learned pre-filter whose chosen stroke is always simulated, learns to predict.
2. Stage 2. The successes are ranked (rank_successes: direct pots before bank and kick pots, then
   the smaller cut angle, the softer stroke and the lower pool index; a repeated stroke once) and
   the first `top` are struck again on the decision's `draws` draws, the draws the agent's stroke
   was checked on, so the two are compared on common random numbers.
3. The best of them that makes at least half of its draws (decide) is played instead of the
   agent's stroke when it makes more draws than the agent's stroke does, or when the agent gave up.

Search() is the later form of this search (32 struck, 96 more when none of them scores, the best 4
struck again); Search(extension=0, top=2) is the earlier form. SMALL is a fast form for fixtures and
tests. Rows are built when the game is over, so every row also carries the game's run length and the
balls the run gained from its decision on, and fold_of(key) holds a whole game out together.

Streams. Every random number derives from the game key and the namespace (hillclimb.crn), so a game
replays from its key alone and no row depends on the worker that played it:

    the played strokes   straightpool.game.step (the hand noise law at (key, i))
    check and stage 2    crn.draw(crn.stream(namespace + '/check', key), i, j), j < draws
    stage 1              crn.draw(crn.stream(namespace + '/strike', key), i, member index)
    the Sobol pool       its seed noise.shot_seed(crn.stream(namespace + '/pool', key), i)

and every simulation of decision i runs with the decision's kernel seed (game.kernel_seed).

A game record holds the key, the kernel build it was made on (as kernel_id(), a hash), the settings,
every played stroke with its call and result (the input hillclimb_examples.training.relog replays)
and the rows.
"""

import argparse
import dataclasses
import hashlib
import json
import pathlib
from dataclasses import dataclass

from hillclimb import adapter, crn, measure, runner, select
from hillclimb import noise as hand_noise
from hillclimb.protocol import AgentSpec, Decision
from straightpool import candidates
from straightpool import game as rules

#: The namespace of the generator's streams unless the caller names its own.
NAMESPACE = "hillclimb/training/datagen"

#: The noise level of the published numbers (the 0.1x unit) and the cap on balls per game.
NOISE = 0.1
CAP = 200

#: Folds of the split that holds a whole game out together.
N_FOLDS = 5

#: The kernel's id of the cue ball.
CUE = 0

#: The decision kinds a row's 'why' takes.
WHY = ("healthy", "forced", "giveup", "in-hand")

#: The keys of every decision row, in no particular order.
ROW_KEYS = ("game", "fold", "decision", "run", "rack_untouched", "in_hand", "position", "agent",
            "check", "trigger", "why", "played", "stroke", "call", "place", "scored", "fouls",
            "run_after", "n_centres", "struck", "search", "game_L", "balls_after", "died",
            "censored")

#: The keys of every struck member of a trigger row.
STRUCK_KEYS = ("i", "ball", "pocket", "kind", "cut_deg", "stroke", "stage", "success", "make")


@dataclass(frozen=True)
class Search:
    """The search at a trigger decision.

    draws      draws per stroke in the check of the agent's stroke and in stage 2; a stroke passes
               when it makes at least half of them (floor)
    pool       members of the Sobol pool (a power of two)
    prefix     members struck first, in pool order
    extension  members struck next when none of the prefix scores (0 turns the extension off)
    top        ranked successes struck again in stage 2"""

    draws: int = 32
    pool: int = 512
    prefix: int = 32
    extension: int = 96
    top: int = 4

    def __post_init__(self):
        if self.draws < 2 or self.prefix < 1 or self.extension < 0 or self.top < 1:
            raise ValueError(f"draws >= 2, prefix >= 1, extension >= 0 and top >= 1: {self}")
        if self.pool < 1 or self.pool & (self.pool - 1) or self.prefix + self.extension > self.pool:
            raise ValueError(f"pool must be a power of two holding prefix + extension: {self}")

    @property
    def floor(self):
        """The make count a stroke needs to pass: half of its draws, rounded down."""
        return self.draws // 2


#: A fast form of the search for fixtures and tests.
SMALL = Search(draws=8, pool=64, prefix=8, extension=8, top=2)


def fold_of(key, n=N_FOLDS):
    """The fold of a game: the first 8 bytes of SHA-256 over its key's decimal text, big-endian,
    mod n. Every row of a game shares it, so a held-out fold holds whole games."""
    digest = hashlib.sha256(str(int(key)).encode("ascii")).digest()
    return int.from_bytes(digest[:8], "big") % n


def kernel_id():
    """The first 16 hex digits of SHA-256 over the kernel build stamp: the build a record was made
    on, written as a hash. A replay on another build is not expected to reproduce the record."""
    return hashlib.sha256(adapter.kernel_version().encode("utf-8")).hexdigest()[:16]


def position_json(positions):
    """{'cue': [x, y] or None, 'balls': {'id': [x, y]}} of {ball id: (x, y)}, kernel frame."""
    cue = positions.get(CUE)
    return {"cue": None if cue is None else [float(cue[0]), float(cue[1])],
            "balls": {str(b): [float(p[0]), float(p[1])]
                      for b, p in sorted(positions.items()) if b != CUE}}


def positions_of(position):
    """The {ball id: (x, y)} of a position_json, the cue ball included when it is on the table."""
    out = {int(b): (float(p[0]), float(p[1])) for b, p in position["balls"].items()}
    if position["cue"] is not None:
        out[CUE] = (float(position["cue"][0]), float(position["cue"][1]))
    return dict(sorted(out.items()))


def stroke_json(stroke):
    """A Stroke as the list [v0, phi, theta, a, b]."""
    return list(stroke.as_tuple())


def call_json(call):
    """A Call as [ball, pocket], or None."""
    return None if call is None else [int(call.ball), int(call.pocket)]


def place_json(place):
    """A cue-ball placement as [x, y], or None."""
    return None if place is None else [float(place[0]), float(place[1])]


def action_of(entry):
    """The straightpool.game.Action of a recorded stroke ({'stroke', 'call', 'place'})."""
    call = entry["call"]
    place = entry["place"]
    return rules.Action(adapter.Stroke.of(entry["stroke"]),
                        None if call is None else rules.Call(int(call[0]), int(call[1])),
                        None if place is None else (float(place[0]), float(place[1])))


def rank_successes(struck):
    """The successes of a struck list in stage-2 order: direct pots before bank and kick pots, then
    the smaller cut angle (a member without one after any that has one), the softer stroke and the
    lower pool index. A stroke equal to an earlier one to 5 decimals is dropped."""
    wins = [s for s in struck if s["success"]]
    wins.sort(key=lambda s: (0 if s["kind"] == "direct" else 1,
                             999.0 if s["cut_deg"] is None else float(s["cut_deg"]),
                             float(s["stroke"][0]), int(s["i"])))
    seen, out = set(), []
    for s in wins:
        key = tuple(round(float(x), 5) for x in s["stroke"])
        if key not in seen:
            seen.add(key)
            out.append(s)
    return out


def decide(makes, floor):
    """The position, in a list of make counts in rank order, of the stroke a search plays: the most
    makes among the counts of at least `floor`, a tie keeping the earlier one; None when none
    reaches the floor."""
    best = None
    for i, made in enumerate(makes):
        if made >= floor and (best is None or made > makes[best]):
            best = i
    return best


def make_count(state, stroke, call, draws, *, noise, seed, threads=1):
    """How many of `draws` (five normals each) score `call` when `stroke` is played from `state`:
    each draw perturbs the stroke at noise level `noise` and the kernel simulates it with seed
    `seed`."""
    outcomes = select.rollouts([(state, stroke)], draws, r=noise, seed=seed, threads=threads)[0]
    return sum(1 for outcome in outcomes if rules.judge(outcome, call).scored)


def strike(state, members, stream_seed, decision, *, noise, seed, threads=1):
    """Stage 1: the success flags of `members`, each struck once from `state` under draw
    member.index of `decision` (crn.draw(stream_seed, decision, member.index)) with kernel seed
    `seed`. A member scores when its ball drops in its pocket without a foul."""
    jobs = [(state, hand_noise.perturb(m.stroke, crn.draw(stream_seed, decision, m.index), noise),
             seed) for m in members]
    outcomes = adapter.simulate_many(jobs, threads=threads)
    return [rules.judge(outcome, rules.Call(m.ball, m.pocket)).scored
            for m, outcome in zip(members, outcomes)]


def member_json(member, stage, success):
    """A struck member as its row entry (make is filled in when stage 2 strikes it again)."""
    cut = None if member.cut_deg is None else float(member.cut_deg)
    return {"i": int(member.index), "ball": int(member.ball), "pocket": int(member.pocket),
            "kind": member.kind, "cut_deg": cut, "stroke": stroke_json(member.stroke),
            "stage": stage, "success": bool(success), "make": None}


def search_at(game, gave_up, agent_make, *, search, noise, streams, threads=1):
    """The search at a trigger decision of `game` (the cue ball on the table), after the agent gave
    up (`gave_up`) or its stroke made `agent_make` of the check draws. `streams` holds the game's
    stream seeds by use: 'check', 'strike' and 'pool' (see the module docstring). Returns (record,
    struck, action): the search record, the struck members as row entries, and the Action to play
    instead of the agent's, or None to keep the agent's."""
    d = game.decision
    seed = rules.kernel_seed(game)
    members = candidates.sobol_pool(game, n=search.pool,
                                    seed=hand_noise.shot_seed(streams["pool"], d))
    struck = []
    for stage, part in (("prefix", members[:search.prefix]),
                        ("extension", members[search.prefix:search.prefix + search.extension])):
        if not part or (stage == "extension" and any(s["success"] for s in struck)):
            break
        flags = strike(game.state, part, streams["strike"], d, noise=noise, seed=seed,
                       threads=threads)
        struck += [member_json(m, stage, ok) for m, ok in zip(part, flags)]
    ranked = rank_successes(struck)[:search.top]
    by_index = {m.index: m for m in members}
    draws = crn.block(streams["check"], d, search.draws)
    makes = []
    if ranked:
        outcomes = select.rollouts([(game.state, by_index[s["i"]].stroke) for s in ranked], draws,
                                   r=noise, seed=seed, threads=threads)
        for s, row in zip(ranked, outcomes):
            s["make"] = sum(1 for o in row
                            if rules.judge(o, rules.Call(s["ball"], s["pocket"])).scored)
            makes.append(s["make"])
    best = decide(makes, search.floor)
    plays = best is not None and (gave_up or makes[best] > agent_make)
    chosen = ranked[best] if best is not None else None
    record = {"pool": len(members), "extended": any(s["stage"] == "extension" for s in struck),
              "n_struck": len(struck), "n_success": sum(1 for s in struck if s["success"]),
              "folded": [s["i"] for s in ranked], "chosen": None if chosen is None else chosen["i"],
              "plays": plays}
    action = None
    if plays:
        action = rules.Action(by_index[chosen["i"]].stroke,
                              rules.Call(chosen["ball"], chosen["pocket"]))
    return record, struck, action


def _step(game, agent, *, noise, cap, search, streams, threads):
    """One decision: check the agent's stroke, search at a trigger, play, and the decision's entry.
    Returns (entry, next game)."""
    d = game.decision
    action = agent.act(game, Decision(game.key, d, noise))
    positions = game.state.positions()
    check, why, record, struck, n_centres, played = None, "in-hand", None, None, None, action
    if CUE in positions:
        gave_up = action.call is None
        if gave_up:
            why = "giveup"
        else:
            draws = crn.block(streams["check"], d, search.draws)
            check = make_count(game.state, action.stroke, action.call, draws, noise=noise,
                               seed=rules.kernel_seed(game), threads=threads)
            why = "forced" if check < search.floor else "healthy"
        if why != "healthy":
            n_centres = len(candidates.aim_centres(game))
            record, struck, chosen = search_at(game, gave_up, check, search=search, noise=noise,
                                               streams=streams, threads=threads)
            if chosen is not None:
                played = chosen
    nxt, judgment, _ = rules.step(game, played, noise=noise, cap=cap)
    entry = {"decision": d, "run": game.run, "rack_untouched": bool(game.rack_untouched),
             "in_hand": game.in_hand, "position": position_json(positions),
             "agent": {"stroke": stroke_json(action.stroke), "call": call_json(action.call),
                       "place": place_json(action.place)},
             "check": check, "trigger": why in ("forced", "giveup"), "why": why,
             "played": "agent" if played is action else "search",
             "stroke": stroke_json(played.stroke), "call": call_json(played.call),
             "place": place_json(played.place), "scored": bool(judgment.scored),
             "fouls": list(judgment.fouls), "run_after": nxt.run, "n_centres": n_centres,
             "struck": struck, "search": record}
    return entry, nxt


def play_game(key, agent, *, noise=NOISE, cap=CAP, search=Search(), namespace=NAMESPACE,
              threads=1):
    """One game from key `key` with `agent` (already reset for the key: runner.play does that),
    to its end; the game itself ends at `cap` balls ('CAP'). Returns the game record: key, kernel,
    settings, run length, how it ended, the played strokes ('strokes': decision, stroke, call,
    place, scored, run after) and the rows (rows_of)."""
    key = int(key)
    streams = {name: crn.stream(f"{namespace}/{name}", key) for name in ("check", "strike", "pool")}
    game = rules.new_game(key)
    entries = []
    while game.over is None:
        if len(entries) > cap:
            raise RuntimeError(f"game {key}: {len(entries)} strokes without reaching the end")
        entry, game = _step(game, agent, noise=noise, cap=cap, search=search, streams=streams,
                            threads=threads)
        entries.append(entry)
    censored = game.over == "CAP"
    record = {"key": key, "kernel": kernel_id(), "noise": noise, "cap": cap,
              "namespace": namespace, "search": dataclasses.asdict(search), "L": game.run,
              "over": game.over, "censored": censored,
              "strokes": [{k: e[k] for k in ("decision", "stroke", "call", "place", "scored")}
                          | {"run": e["run_after"]} for e in entries]}
    record["rows"] = rows_of(key, entries, game.run, censored)
    return record


def rows_of(key, entries, length, censored):
    """The decision rows of a finished game: each entry with the game key, its fold and the labels
    known only at the end (the run length, the balls gained from the decision on, whether the run
    ended at a miss or at the cap)."""
    fold = fold_of(key)
    return [{"game": int(key), "fold": fold, **e, "game_L": length,
             "balls_after": length - e["run"], "died": not censored, "censored": censored}
            for e in entries]


def trigger_rows(rows):
    """The rows of trigger decisions."""
    return [r for r in rows if r["trigger"]]


@dataclass(frozen=True)
class SelfPlay:
    """Data generation as a hillclimb target: play(agent, key) plays one game (play_game) and
    returns its record; value(records) is the capped run-length estimate, sum L / sum deaths."""

    noise: float = NOISE
    cap: int = CAP
    search: Search = Search()
    namespace: str = NAMESPACE
    name: str = "self-play-data"

    def play(self, agent, key):
        return play_game(key, agent, noise=self.noise, cap=self.cap, search=self.search,
                         namespace=self.namespace)

    def value(self, records):
        return measure.run_length([(r["L"], 0 if r["censored"] else 1) for r in records], m=1)


def generate(spec, n, *, target=SelfPlay(), start=0, workers=1):
    """The records of n games of `target` with the agent of `spec`, on the keys start .. start + n
    - 1 of crn.game_keys(target.namespace + '/games'), in key order whatever the worker count."""
    keys = crn.game_keys(target.namespace + "/games", n, start)
    return runner.play(target, spec, keys, workers=workers)


def dumps(item):
    """Canonical JSON text: sorted keys, compact separators, no NaN or infinity."""
    return json.dumps(item, sort_keys=True, separators=(",", ":"), allow_nan=False)


def write_jsonl(path, items):
    """Write one canonical JSON line per item; FileExistsError when the file exists."""
    with pathlib.Path(path).open("x", encoding="utf-8") as fh:
        for item in items:
            fh.write(dumps(item) + "\n")


def read_jsonl(path):
    """The items of a JSON-lines file."""
    with pathlib.Path(path).open(encoding="utf-8") as fh:
        return [json.loads(line) for line in fh if line.strip()]


def split(records):
    """(games, decision rows, trigger rows) of game records: the games without their rows."""
    games = [{k: v for k, v in r.items() if k != "rows"} for r in records]
    rows = [row for r in records for row in r["rows"]]
    return games, rows, trigger_rows(rows)


FILES = ("games.jsonl", "decision-rows.jsonl", "trigger-rows.jsonl")


def write(directory, records):
    """Write the three files of FILES into `directory`; FileExistsError when any exists."""
    directory = pathlib.Path(directory)
    paths = [directory / name for name in FILES]
    for path in paths:
        if path.exists():
            raise FileExistsError(path)
    directory.mkdir(parents=True, exist_ok=True)
    for path, items in zip(paths, split(records)):
        write_jsonl(path, items)
    return paths


def main(argv=None):
    """Command line: play games and write games.jsonl, decision-rows.jsonl and trigger-rows.jsonl
    into a new directory."""
    parser = argparse.ArgumentParser(prog="python -m hillclimb_examples.training.datagen",
                                     description=main.__doc__)
    parser.add_argument("out", help="directory to write (its three files must not exist)")
    parser.add_argument("--games", type=int, required=True, help="number of games")
    parser.add_argument("--start", type=int, default=0, help="index of the first game key")
    parser.add_argument("--namespace", default=NAMESPACE, help="namespace of every stream")
    parser.add_argument("--noise", type=float, default=NOISE, help="noise level r")
    parser.add_argument("--cap", type=int, default=CAP, help="cap on balls per game")
    parser.add_argument("--small", action="store_true", help="the fast search form (SMALL)")
    parser.add_argument("--agent", default=None,
                        help='agent spec as JSON {"builder": ..., "params": {...}} '
                             "(default: the baseline agent with its defaults)")
    parser.add_argument("--workers", type=int, default=1, help="worker processes")
    args = parser.parse_args(argv)
    if args.agent is None:
        from straightpool import base_agent
        spec = base_agent.spec()
    else:
        given = json.loads(args.agent)
        spec = AgentSpec(given["builder"], given.get("params", {}))
    target = SelfPlay(noise=args.noise, cap=args.cap, search=SMALL if args.small else Search(),
                      namespace=args.namespace)
    records = generate(spec, args.games, target=target, start=args.start, workers=args.workers)
    for path in write(args.out, records):
        print(path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
