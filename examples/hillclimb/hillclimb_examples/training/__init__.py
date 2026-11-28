# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Training code for the two learned files, with the data generators that make their inputs.

    datagen   plays games with an agent and writes the search-decision rows C2 learns from
    relog     replays recorded games in the kernel and writes the break rows V learns from and
              the bench leaves of the 2-ply
    train_c2  fits C2's five fold models (torch)
    train_v   fits V's trees (scikit-learn) and exports them to the plain form that
              hillclimb_examples.models.v evaluates

The shipped weights were fitted on the project's own simulations, which do not ship. The small
fixtures here are fresh, made by datagen and relog, and run the code end to end. torch and
scikit-learn are the training extras and are imported inside the functions that use them.
"""
