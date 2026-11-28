# training

The code that makes the training data of our two learned files and fits them:

- **C2**, a learned pre-filter whose chosen stroke is always simulated: it orders the Sobol stroke
  pool at a search decision so that the kernel simulates the most promising strokes first;
- **V**, a learned leaf value used in the 2-ply: it predicts how likely the break shot is to fail
  from the cue ball and the break ball after a re-rack.

Their evaluators, files and model cards are in `hillclimb_examples/models/`. torch (for C2) and
scikit-learn (for V) are the `train` extra; nothing here is needed to play.

## The chain

| step | module | reads | writes |
|---|---|---|---|
| 1 | `hillclimb_examples.training.datagen` | an agent spec | `games.jsonl`, `decision-rows.jsonl`, `trigger-rows.jsonl` |
| 2 | `hillclimb_examples.training.relog` | `games.jsonl` | `break-rows.jsonl`, `leaves.jsonl` |
| 3 | `hillclimb_examples.training.train_c2` | `trigger-rows.jsonl` | a C2 weights file |
| 4 | `hillclimb_examples.training.train_v` | `break-rows.jsonl` (and `leaves.jsonl` for the check) | a V model file |

1. `datagen` plays self-play games of 14.1 with an agent (the baseline agent unless you pass a
   spec). At every decision with the cue ball on the table it checks the agent's stroke on 32 draws;
   when the stroke makes fewer than half of them, or the agent finds no callable pot, the decision
   is a trigger and the search runs: the Sobol pool is laid, its first 32 members are struck once
   each (96 more when none of them scores), the best 4 successes are struck again on the 32
   draws, and the best that makes at least half of them is played when it beats the agent's
   stroke. The
   trigger rows hold every struck member with its success flag: C2's training units.
2. `relog` replays each recorded game in the kernel from its key, with no agent, and checks every
   stroke against the record. At each break decision it writes V's row: the cue ball, the break
   ball and how many of 32 re-simulations of the played break stroke score (V's label is the missed
   share). At each 14th-ball decision it prepares the bench leaves of the 2-ply: the played stroke
   on 256 draws, and the break positions its first 8 scoring draws lead to.
3. `train_c2` fits five fold models (games held out together) and writes the weights file through
   `hillclimb_examples.models.c2.save`.
4. `train_v` fits the gradient-boosted trees, checks the pure-Python evaluator of
   `hillclimb_examples.models.v` equal to scikit-learn on every row and leaf, and writes the model
   file through `hillclimb_examples.models.v.save`.

From the project directory (`examples/hillclimb`), with the kernel module built from
`crates/pool-py`:

    python -B -m hillclimb_examples.training.datagen data --games 200
    python -B -m hillclimb_examples.training.relog data/games.jsonl relog
    python -B -m hillclimb_examples.training.train_c2 data/trigger-rows.jsonl c2-refit.json
    python -B -m hillclimb_examples.training.train_v relog/break-rows.jsonl v-refit.json.gz --leaves relog/leaves.jsonl

Each command refuses to overwrite a file. Every random number derives from the game key and a
namespace string (`--namespace`), so the same command on the same kernel build writes the same
bytes whatever the worker count (`--workers`).

## Where the training data comes from

Every training row is simulated by the openbilliards kernel. The games are self-play of our own
agents; every stroke is simulated by the kernel under the hand noise law (`hillclimb.noise`) with
shape off, its default (the ICGA convention alone), and every label (a struck member's success, a
break stroke's make count) is read off simulated strokes by the rules of the game
(`straightpool.game`). No row comes from recordings of real play, from human strokes, or from any
third-party data set.

The shipped C2 and V files were fitted on the project's own simulated games, made by earlier forms
of this chain with the agents of the time, on the kernel build their model cards name. Those data do
not ship. A refit on the fixtures below runs the code end to end and is not expected to equal the
shipped weights.

## How this chain differs from the one behind the shipped files

- The trigger is checked on the stroke the agent plays; the research generators read the best make
  count of the agent's own candidate window.
- The search plays its pick when it makes more draws than the agent's stroke; the research
  generators also counted the draws that left a next pot open.
- C2's position inputs are read from the first 32 struck members (the pool prefix), as the scorer
  reads them in play; the fit behind the shipped file read them from every struck member, which
  differs only where the extension was struck.
- V's label re-simulates the played break stroke on a stream of its own; the research read the make
  count the agent's break search had measured on its own draws.

## Fixtures

`fixtures/` holds a small set made by an earlier version of this chain on fresh keys (namespace
`hillclimb/training/fixture`): 36 games of the baseline agent at r = 0.1, capped at 29 balls, with
the fast search form (`--small`: 8 members struck, 8 more when none scores, the best 2 struck again
on 8 draws), and 16 draws per break label and per leaf stroke. It is small enough for the tests to
fit both models in seconds:

| file | made by | holds |
|---|---|---|
| `games.jsonl` | `datagen` | the game records: key, kernel build hash, settings, played strokes |
| `trigger-rows.jsonl` | `datagen` | the trigger rows of those games |
| `break-rows.jsonl` | `relog` | V's rows of those games |
| `leaves.jsonl` | `relog` | the bench leaves of those games |

The commands that made them are in `fixtures/MANIFEST.json`, with the first 16 hex digits of the
SHA-256 of each file. They were made with a previous version of this package's code, before the
baseline agent aimed its ball-in-hand strokes from the seat (`straightpool/AGENT-CARD-base.md`); the
MANIFEST names this version's modules, and the same commands run with this version may write other
bytes. A game record carries a hash of the kernel build it was made on (`kernel`); a replay on
another build is not expected to reproduce it, so the tests replay fresh games, never the fixture's.

## Tests

    python -B -m unittest discover -s tests/training -t .

The fit tests skip without torch or scikit-learn, and the replay tests skip without the kernel
module.
