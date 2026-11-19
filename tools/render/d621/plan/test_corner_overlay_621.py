# Copyright (c) Meta Platforms, Inc. and affiliates.

"""C7 measurement arms; optional evidence dependencies are documented in README.md."""
import unittest

import numpy as np
import pytest


def walls(loops):
    """DERIVED: extrude independently specified section contours for fixtures."""
    vertices, faces = [], []
    for loop in loops:
        for a, b in zip(loop, loop[1:]+loop[:1]):
            k = len(vertices)
            vertices.extend([(*a,0), (*b,0), (*b,1), (*a,1)])
            faces.extend([(k,k+1,k+2), (k,k+2,k+3)])
    return dict(name="section fixture", V=np.array(vertices,float), F=np.array(faces,int))


class SectionArms(unittest.TestCase):
    def setUp(self):
        # DERIVED: import the required dependency version inside each test
        # so a minimal CI export reports all four
        # named skips instead of failing collection or hiding the test names.
        pytest.importorskip(
            "shapely", minversion="2.0",
            reason="C7 PLAN overlay measurements require optional Shapely >= 2; see plan/README.md",
        )
        from shapely.geometry import Point
        import corner_overlay_621
        self.Point = Point
        self.overlay = corner_overlay_621

    def test_support_ring_keeps_its_empty_inner_hole(self):
        # DERIVED: a square annulus has area 16 - 4, independent of triangulation.
        mesh = walls([[(-2,-2),(2,-2),(2,2),(-2,2)], [(-1,-1),(-1,1),(1,1),(1,-1)]])
        result = self.overlay.section([mesh], .5)
        self.assertAlmostEqual(result.area, 12)
        self.assertFalse(result.covers(self.Point(0,0)))
        self.assertTrue(result.covers(self.Point(1.5,0)))
        self.assertAlmostEqual(self.overlay.outer(result).length, 16)

    def test_interior_projected_island_is_not_the_table_outer_contour(self):
        # DERIVED: an interior wood island changes the full section boundary,
        # but the enclosing apron contour remains the table's outer outline.
        from shapely.geometry import box
        ring = box(-2,-2,2,2).difference(box(-1,-1,1,1))
        assembly = ring.union(box(-.1,-.1,.1,.1))
        self.assertAlmostEqual(self.overlay.outer(assembly).length, 16)
        self.assertGreater(assembly.boundary.length, ring.boundary.length)

    def test_projected_union_preserves_a_concave_recess(self):
        # DERIVED: this L footprint has area three; its convex hull has 3.5.
        p = np.array([(0,0,0),(2,0,0),(2,1,0),(1,1,0),(1,2,0),(0,2,0)],float)
        mesh = dict(V=p, F=np.array([(0,1,3),(1,2,3),(0,3,5),(3,4,5)]))
        result = self.overlay.projection([mesh])
        self.assertAlmostEqual(result.area, 3)
        self.assertFalse(result.covers(self.Point(1.5,1.5)))

    def test_touching_components_keep_their_construction_joint(self):
        # DERIVED: adjoining rectangles have a visible component seam even
        # when the solid union would erase it. Both model and render use this.
        first = walls([[(0,0),(1,0),(1,1),(0,1)]])
        second = walls([[(1,0),(2,0),(2,1),(1,1)]])
        self.assertAlmostEqual(self.overlay.component_boundaries([first,second], .5).length, 7)
        self.assertAlmostEqual(self.overlay.section([first,second], .5).boundary.length, 6)


if __name__ == "__main__":
    unittest.main()
