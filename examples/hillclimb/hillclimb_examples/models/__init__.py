# Copyright (c) Meta Platforms, Inc. and affiliates.

"""The two learned files of our agents, with their evaluators and model cards.

    c2  C2, a learned pre-filter whose chosen stroke is always simulated: five small MLPs whose mean
        logit orders the Sobol stroke pool at a search decision, so the kernel simulates the most
        promising strokes first
    v   V, a learned leaf value used in the 2-ply search: gradient-boosted regression trees over
        geometric features of a break position, evaluated in pure Python

Each file is checked against its digest when it loads. Neither evaluator needs torch or
scikit-learn; those are the training extras. MODEL-CARD-c2.md and MODEL-CARD-v.md say what each
model is, how it was trained and what it measured, with each result's status.
"""
