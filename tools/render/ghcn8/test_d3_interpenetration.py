# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Closed-solid penetration red controls. Synthetic dimensions are test inputs."""
import pytest

pytest.importorskip("manifold3d", reason="The optional closed-solid penetration arms require manifold3d; see ghcn8/README.md")
import manifold3d
import numpy as np

from measure_d3_interpenetration import intersection_measurement, solid


def test_intersection_measures_a_known_intrusion_and_accepts_a_shared_face():
    cover = manifold3d.Manifold.cube((0.01, 0.01, 0.01))
    rail = manifold3d.Manifold.cube((0.01, 0.01, 0.01)).translate((-0.0072, 0, 0))
    result = intersection_measurement(cover, rail, 0, 1, 0)
    assert result["status"] == "FAIL"
    assert result["max_penetration_mm"] == pytest.approx(2.8, abs=0.0002)
    contact = manifold3d.Manifold.cube((0.01, 0.01, 0.01)).translate((-0.01, 0, 0))
    result = intersection_measurement(cover, contact, 0, 1, 0)
    assert result["status"] == "PASS-NUMERIC-CONTACT"
    assert result["max_penetration_mm"] == 0
    assert result["intersection_volume_mm3"] == 0


@pytest.mark.parametrize('axis', [0, 1, 2])
@pytest.mark.parametrize('sign', [-1, 1])
def test_a_280_mm3_intrusion_behind_either_butt_plane_is_rejected(axis, sign):
    def placed(offset):
        delta = [0.0, 0.0, 0.0]
        delta[axis] = offset
        shape = manifold3d.Manifold.cube((0.01, 0.01, 0.01)).translate(delta)
        normal = [0.0, 0.0, 0.0]
        normal[axis] = 1
        return shape if sign == 1 else shape.mirror(normal)
    rail, cover = placed(-0.01), placed(-0.0028)
    result = intersection_measurement(cover, rail, axis, sign, 0)
    assert result['status'] == 'FAIL'
    assert result['intersection_volume_mm3'] == pytest.approx(280)
    assert result['max_penetration_mm'] == pytest.approx(2.8, abs=0.0002)
    assert result['signed_extent_mm'] == pytest.approx([-2.8, 0], abs=0.0002)
    assert result['intersection_thickness_mm'] == pytest.approx(2.8, abs=0.0002)


def test_a_separated_pair_has_no_contact_or_signed_penetration():
    a = manifold3d.Manifold.cube((0.01, 0.01, 0.01))
    b = a.translate((-0.02, 0, 0))
    result = intersection_measurement(a, b, 0, 1, 0)
    assert result['status'] == 'PASS' and result['intersection_volume_mm3'] == 0
    assert result['signed_extent_mm'] == [0, 0]


def test_small_overlap_far_from_the_butt_plane_is_not_a_shared_face():
    a = manifold3d.Manifold.cube((0.01, 0.01, 0.01)).translate((-0.1, 0, 0))
    b = a.translate((0.01 - 1e-8, 0, 0))
    result = intersection_measurement(a, b, 0, 1, 0)
    assert result['intersection_volume_mm3'] > 0
    assert result['status'] == 'FAIL'
    assert result['max_penetration_mm'] > 80


def test_an_open_triangle_soup_cannot_be_called_a_zero_penetration_solid():
    mesh = manifold3d.Manifold.cube((0.01, 0.01, 0.01)).to_mesh()
    points = np.asarray(mesh.vert_properties)[:, :3]
    triangles = points[np.asarray(mesh.tri_verts)]
    with pytest.raises(ValueError, match="Closed-solid input refused"):
        solid(triangles[:-1])
