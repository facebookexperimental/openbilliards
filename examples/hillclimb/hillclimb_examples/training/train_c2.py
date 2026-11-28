# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Fit C2, a learned pre-filter whose chosen stroke is always simulated, on the trigger rows.

The units are the struck members of every trigger row of hillclimb_examples.training.datagen (a
row whose search struck nothing is left out). A unit's 47 inputs come from
hillclimb_examples.models.c2.features at the row's position, with the row's run, its break flag and
its aim-centre count; its label is the member's success flag. The rows' folds
(hillclimb_examples.training.datagen.fold_of) hold whole games out: the model of fold f is fitted
on the units of the other folds, in row order, and scored on its own (held-out AUROC, ties at
average rank). Each model is an MLP 47 -> 128 ReLU -> 128 ReLU -> 1 logit, fitted by Adam (learning
rate 1e-3, weight decay 1e-3) for 60 epochs of shuffled batches of 256 under binary cross-entropy
on the logit, its inputs standardised by the training units' means and standard deviations (a
deviation below 1e-8 counts as 1). The seed fixes the initial weights and the batch order, and the
fit runs on one thread, so on the same platform and torch build a refit of the same rows with the
same seed gives the same weights, digest for digest. save() writes the weights file through
hillclimb_examples.models.c2.save, the form hillclimb_examples.models.c2.load reads, with every
fold digest and the combined digest.

The position block of a unit is read, as hillclimb_examples.models.c2.features reads it in play,
from the first 32 members of its row's struck list (the pool prefix). The fit behind the shipped
file read it from the whole struck list, which differs only on rows where the extension was struck.
The shipped C2 file was fitted on the project's own simulations, which do not ship; a refit on the
fixture rows runs the code end to end and is not expected to equal it.

torch and numpy are imported inside the functions that use them (torch is a training extra).
"""

import argparse
import json

from hillclimb import adapter
from hillclimb_examples.models import c2
from hillclimb_examples.training import datagen
from straightpool import candidates

#: The fit's settings.
EPOCHS = 60
BATCH = 256
LEARNING_RATE = 1e-3
WEIGHT_DECAY = 1e-3
HIDDEN = 128

#: The seed of a fit unless the caller names one.
SEED = 17


def members_of(row):
    """The struck members of a trigger row as straightpool.candidates.PoolMember."""
    return [candidates.PoolMember(int(s["i"]), int(s["ball"]), int(s["pocket"]), s["kind"],
                                  adapter.Stroke.of(s["stroke"]), None, s["cut_deg"])
            for s in row["struck"]]


def design(rows):
    """(X, y, folds, games) over the units of `rows`: the n x 47 inputs (float64), the 0/1 labels,
    each unit's fold and each unit's game key (a list: keys use all 64 bits)."""
    import numpy as np
    blocks, labels, folds, games = [], [], [], []
    for row in rows:
        if not row["trigger"] or not row["struck"]:
            continue
        x = c2.features(datagen.positions_of(row["position"]), members_of(row), run=row["run"],
                        break_decision=row["rack_untouched"], n_centres=row["n_centres"])
        blocks.append(np.asarray(x, dtype=np.float64))
        labels += [int(bool(s["success"])) for s in row["struck"]]
        folds += [int(row["fold"])] * len(row["struck"])
        games += [int(row["game"])] * len(row["struck"])
    X = np.concatenate(blocks) if blocks else np.zeros((0, c2.N_FEATURES))
    return X, np.array(labels, dtype=np.int8), np.array(folds, dtype=np.int64), games


def fit_fold(X, y, *, seed=SEED, epochs=EPOCHS):
    """One fold's model on its training units: {'net': the torch module, 'mu', 'sd'}."""
    import numpy as np
    import torch
    if len(X) == 0:
        raise ValueError("no training unit")
    threads = torch.get_num_threads()
    torch.set_num_threads(1)
    try:
        torch.manual_seed(seed)
        mu = X.mean(0)
        sd = X.std(0)
        sd = np.where(sd < 1e-8, 1.0, sd)
        xt = torch.tensor((X - mu) / sd, dtype=torch.float32)
        yt = torch.tensor(np.asarray(y, dtype=np.float64), dtype=torch.float32)[:, None]
        net = torch.nn.Sequential(torch.nn.Linear(X.shape[1], HIDDEN), torch.nn.ReLU(),
                                  torch.nn.Linear(HIDDEN, HIDDEN), torch.nn.ReLU(),
                                  torch.nn.Linear(HIDDEN, 1))
        opt = torch.optim.Adam(net.parameters(), lr=LEARNING_RATE, weight_decay=WEIGHT_DECAY)
        order = torch.Generator().manual_seed(seed)
        loss = torch.nn.functional.binary_cross_entropy_with_logits
        for _ in range(epochs):
            perm = torch.randperm(len(xt), generator=order)
            for start in range(0, len(xt), BATCH):
                idx = perm[start:start + BATCH]
                opt.zero_grad()
                loss(net(xt[idx]), yt[idx]).backward()
                opt.step()
    finally:
        torch.set_num_threads(threads)
    return {"net": net, "mu": mu, "sd": sd}


def logits(model, X):
    """A fitted fold model's logits on inputs X (a float64 array)."""
    import torch
    with torch.no_grad():
        z = model["net"](torch.tensor((X - model["mu"]) / model["sd"], dtype=torch.float32))
    return z.numpy()[:, 0].astype("float64")


def auroc(scores, labels):
    """The Mann-Whitney AUROC of scores against 0/1 labels, ties at average rank; None when a class
    is missing."""
    import numpy as np
    s = np.asarray(scores, dtype=np.float64)
    y = np.asarray(labels).astype(bool)
    n1 = int(y.sum())
    n0 = len(y) - n1
    if n1 == 0 or n0 == 0:
        return None
    order = np.argsort(s, kind="mergesort")
    ranks = np.empty(len(s), dtype=np.float64)
    i = 0
    while i < len(s):
        j = i
        while j + 1 < len(s) and s[order[j + 1]] == s[order[i]]:
            j += 1
        ranks[order[i:j + 1]] = (i + j) / 2.0 + 1.0
        i = j + 1
    return float((ranks[y].sum() - n1 * (n1 + 1) / 2.0) / (n1 * n0))


def fold_json(model):
    """A fitted fold model in the weights file's fold form: its six layer tensors by name and its
    input means and scales, as nested lists."""
    return {"state_dict": {name: t.detach().cpu().numpy().tolist()
                           for name, t in model["net"].state_dict().items()},
            "mu": [float(v) for v in model["mu"]], "sd": [float(v) for v in model["sd"]]}


def fit(rows, *, seed=SEED, epochs=EPOCHS):
    """(folds, report) of a fit on `rows`: the N_FOLDS fold models in fold_json form, each fitted on
    the other folds' units, and per fold its unit counts and held-out AUROC."""
    X, y, folds, games = design(rows)
    models, report = [], []
    for f in range(c2.N_FOLDS):
        test = folds == f
        model = fit_fold(X[~test], y[~test], seed=seed, epochs=epochs)
        models.append(fold_json(model))
        report.append({"fold": f, "train": int((~test).sum()), "heldout": int(test.sum()),
                       "heldout_success": int(y[test].sum()),
                       "heldout_auroc": auroc(logits(model, X[test]), y[test])
                       if test.any() else None})
    summary = {"units": int(len(y)), "success": int(y.sum()), "games": len(set(games)),
               "seed": seed, "epochs": epochs, "folds": report}
    return models, summary


def save(path, folds):
    """Write the weights file of the folds to a new path (hillclimb_examples.models.c2.save);
    returns its combined digest, which hillclimb_examples.models.c2.load(path, combined=...)
    checks."""
    return c2.save(path, folds)


def main(argv=None):
    """Command line: fit C2 on a trigger-rows.jsonl and write the weights file."""
    parser = argparse.ArgumentParser(prog="python -m hillclimb_examples.training.train_c2",
                                     description=main.__doc__)
    parser.add_argument("rows",
                        help="trigger-rows.jsonl written by hillclimb_examples.training.datagen")
    parser.add_argument("out", help="weights file to write (must not exist)")
    parser.add_argument("--seed", type=int, default=SEED, help="seed of the fit")
    parser.add_argument("--epochs", type=int, default=EPOCHS, help="epochs per fold")
    args = parser.parse_args(argv)
    folds, summary = fit(datagen.read_jsonl(args.rows), seed=args.seed, epochs=args.epochs)
    summary["combined_digest"] = save(args.out, folds)
    print(json.dumps(summary, indent=1, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
