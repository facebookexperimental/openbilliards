# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Fit V, a learned leaf value used in the 2-ply, on hillclimb_examples.training.relog's break rows.

A break row gives V's 30 inputs (hillclimb_examples.models.v.features of its cue ball and break
ball) and the label 1 - make / m, the share of draws on which the played break stroke missed
(hillclimb_examples.training.relog.label). One gradient-boosted regressor (scikit-learn's
HistGradientBoostingRegressor with PARAMS: squared error, learning rate 0.05, 300 trees of at most
15 leaves, at least 40 rows per leaf, L2 regularisation 1, 255 bins, no early stopping) is fitted
on all rows. hillclimb_examples.models.v.export turns its trees into the plain form
hillclimb_examples.models.v evaluates in pure Python, and hillclimb_examples.models.v.save writes
them as the model file (canonical JSON, gzip with no file name and modification time 0, so equal
trees give equal bytes). check() proves the pure evaluator equal to scikit-learn's predict, float
for float, on any feature rows: the break rows, and the break leaves of
hillclimb_examples.training.relog.

The shipped V file was fitted this way on the project's own simulations, which do not ship; a refit
on the fixture rows runs the code end to end and is not expected to equal it.

numpy and scikit-learn are imported inside the functions that use them (scikit-learn is a training
extra).
"""

import argparse
import json

from hillclimb_examples.models import v
from hillclimb_examples.training import datagen, relog

#: The seed of a fit unless the caller names one. It moves nothing below scikit-learn's binning
#: subsample (200,000 rows) without early stopping.
SEED = 17

#: The regressor's settings.
PARAMS = {"loss": "squared_error", "learning_rate": 0.05, "max_iter": 300, "max_leaf_nodes": 15,
          "min_samples_leaf": 40, "l2_regularization": 1.0, "max_bins": 255,
          "early_stopping": False}


def design(rows):
    """(X, y) of break rows: the N_FEATURES inputs of hillclimb_examples.models.v.features and the
    labels."""
    X = [v.features(tuple(r["cue"]), tuple(r["bb"])) for r in rows]
    y = [relog.label(r["make"], r["m"]) for r in rows]
    return X, y


def leaf_inputs(entries):
    """The inputs of every 'break' leaf of hillclimb_examples.training.relog leaf entries, in file
    order."""
    return [v.features(tuple(leaf["cue"]), tuple(leaf["bb"]))
            for entry in entries for stroke in entry["menu"] for leaf in stroke["leaves"]
            if leaf is not None and leaf["kind"] == "break"]


def fit(rows, *, seed=SEED, params=None):
    """The regressor fitted on break rows, with PARAMS (`params` merged over them)."""
    import numpy as np
    from sklearn.ensemble import HistGradientBoostingRegressor
    X, y = design(rows)
    settings = dict(PARAMS, **(params or {}))
    settings["random_state"] = seed
    return HistGradientBoostingRegressor(**settings).fit(np.asarray(X, dtype=np.float64),
                                                         np.asarray(y, dtype=np.float64))


def check(trees, model, X):
    """The number of rows of X on which hillclimb_examples.models.v.predict over the exported trees
    equals the regressor's predict exactly; ValueError at the first row where they differ."""
    import numpy as np
    if not len(X):
        return 0
    expected = model.predict(np.asarray(X, dtype=np.float64))
    for i, (x, want) in enumerate(zip(X, expected)):
        got = v.predict(trees, [float(value) for value in x])
        if got != float(want):
            raise ValueError(f"row {i}: the pure evaluator gives {got!r}, scikit-learn {want!r}")
    return len(X)


def main(argv=None):
    """Command line: fit V on a break-rows.jsonl (hillclimb_examples.training.relog), check the
    exported trees against scikit-learn on the rows (and on the break leaves of a leaves.jsonl when
    given) and write the model file."""
    parser = argparse.ArgumentParser(prog="python -m hillclimb_examples.training.train_v",
                                     description=main.__doc__)
    parser.add_argument("rows",
                        help="break-rows.jsonl written by hillclimb_examples.training.relog")
    parser.add_argument("out", help="model file to write (.json.gz; must not exist)")
    parser.add_argument("--leaves", default=None, help="leaves.jsonl to check the trees on too")
    parser.add_argument("--seed", type=int, default=SEED, help="seed of the fit")
    args = parser.parse_args(argv)
    rows = datagen.read_jsonl(args.rows)
    model = fit(rows, seed=args.seed)
    trees = v.export(model)
    checked = check(trees, model, design(rows)[0])
    if args.leaves:
        checked += check(trees, model, leaf_inputs(datagen.read_jsonl(args.leaves)))
    digest = v.save(args.out, trees)
    print(json.dumps({"rows": len(rows), "trees": trees["n_trees"], "checked": checked,
                      "digest": digest}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
