# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Measure the packed Star wood signal; export scalar evidence, never pixels."""
import argparse
import hashlib
import io
import json
from pathlib import Path
import struct

import numpy as np

from measure_xingpai import SOURCE
from read_blend_measurements import BlendMeasurements

BLEND_SHA = '966a4421985a30ba9d3e699680fcfcd97030ef1a651f86a12b6b450fe187408e'
SHA = lambda p: hashlib.sha256(Path(p).read_bytes()).hexdigest()
HASH = lambda b: hashlib.sha256(b).hexdigest()
FRACTIONS = [.25, .5, .75]  # TESSELLATION: three fixed longitudinal transects.


def spectral_component(luminance, step):
    """Report the finite-window component and its half-bin resolution."""
    values = np.asarray(luminance, dtype=float)
    if values.ndim != 1 or len(values) < 5 or not np.isfinite(values).all() or not step > 0:
        raise ValueError('Invalid sampled signal')
    x = np.arange(len(values), dtype=float)
    detrended = values - np.polyval(np.polyfit(x, values, 1), x)
    power = np.abs(np.fft.rfft(detrended * np.hanning(len(values)))) ** 2
    if not np.any(power[2:] > 0):
        raise ValueError('No measured spatial signal above the trend bins')
    peak = int(np.argmax(power[2:]) + 2)
    window = len(values) * step
    return {'sample_count': len(values), 'sample_spacing': step,
            'sampled_span': (len(values)-1)*step, 'dft_window_span': window,
            'peak_bin': peak, 'dominant_component': window / peak,
            'half_bin_interval': [window/(peak+.5), window/(peak-.5)],
            'mean_linear_luminance': float(values.mean()),
            'detrended_rms': float(np.sqrt(np.mean(detrended*detrended)))}


class SourceMaterial:
    """Evaluate only the measured MIX/GAMMA color path at sample points."""
    def __init__(self, reader):
        from PIL import Image
        self.reader = reader
        self.material_address, self.material = next((p, m) for p, m in reader.objects('MA') if m['id']['name'] == 'MAMahogany')
        tree = reader.read(self.material['nodetree'])
        self.nodes = dict(reader.linked(tree['nodes']))
        self.links = [link for _, link in reader.linked(tree['links'])]
        self.inputs, self.outputs, self.sockets = {}, {}, {}
        for address, node in self.nodes.items():
            self.inputs[address] = dict(reader.linked(node['inputs']))
            self.outputs[address] = dict(reader.linked(node['outputs']))
            self.sockets.update(self.inputs[address]); self.sockets.update(self.outputs[address])
        self.incoming = {}
        for link in self.links:
            if link['tosock'] in self.incoming:
                raise ValueError('Ambiguous source socket')
            self.incoming[link['tosock']] = (link['fromnode'], link['fromsock'])
        self.images, self.image_rows = {}, []
        self.used_image_nodes = set()
        for address, node in self.nodes.items():
            if node['idname'] != 'ShaderNodeTexImage':
                continue
            storage = reader.read(node['storage'])
            mapping = storage['base']['tex_mapping']
            vector = self.socket(address, 'Vector')
            if vector in self.incoming or mapping['loc'] != [0, 0, 0] or mapping['rot'] != [0, 0, 0] \
                    or mapping['size'] != [1, 1, 1] or mapping['flag'] != 0 or storage['projection'] != 0:
                raise ValueError('Source image no longer uses the identity default UV map')
            image = reader.read(node['id'])
            if image['id']['name'] not in ['IMwood_birch_color.jpg', 'IMwood_birch_bump1.jpg', 'IMwood_birch_glossy_rough.jpg']:
                continue
            packed = reader.read(image['packedfile'])
            pointer = reader.addresses[packed['data']]
            if pointer['size'] < packed['size']:
                raise ValueError('Packed image length differs')
            data = reader.data[pointer['offset']:pointer['offset'] + packed['size']]
            raster = np.asarray(Image.open(io.BytesIO(data)).convert('RGB'))
            self.images[address] = raster
            self.image_rows.append({'tag': 'MODEL(Star)', 'node': node['name'], 'image': image['id']['name'][2:],
                                    'encoded_sha256': HASH(data), 'pixel_sha256': HASH(raster.tobytes()),
                                    'width': raster.shape[1], 'height': raster.shape[0], 'packed_bytes': len(data),
                                    'blend_byte_offset': pointer['offset'],
                                    'colorspace': image['colorspace_settings']['name'],
                                    'coordinate_source': 'Unlinked Image Texture Vector uses the active UV layer; stored mapping is identity.'})
        principled = next(p for p, n in self.nodes.items() if n['idname'] == 'ShaderNodeBsdfPrincipled')
        self.base_socket = self.socket(principled, 'Base Color')
        self.graph_sha256 = HASH(json.dumps({'nodes': self.nodes, 'links': self.links, 'sockets': self.sockets}, sort_keys=True).encode())

    def socket(self, address, identifier):
        found = [p for p, s in self.inputs[address].items() if s['identifier'] == identifier]
        if len(found) != 1:
            raise ValueError('Missing unique source socket: ' + identifier)
        return found[0]

    def default(self, socket):
        row = self.reader.read(self.sockets[socket]['default_value'])
        return row['value']

    def input(self, address, identifier, uv):
        return self.value(self.socket(address, identifier), uv)

    def value(self, socket, uv):
        if socket not in self.incoming:
            return np.asarray(self.default(socket), dtype=float)
        address, output = self.incoming[socket]
        node = self.nodes[address]
        kind = node['idname']
        if kind == 'ShaderNodeRGB':
            return np.asarray(self.reader.read(self.sockets[output]['default_value'])['value'])
        if kind == 'ShaderNodeTexImage':
            if address not in self.images:
                raise ValueError('Unexpected image entered the active source color path')
            self.used_image_nodes.add(address)
            raster = self.images[address]
            # Blender linear interpolation at texel centres; image v grows up.
            x, y = uv[:, 0]*raster.shape[1]-.5, (1-uv[:, 1])*raster.shape[0]-.5
            if np.any(x < 0) or np.any(x > raster.shape[1]-1) or np.any(y < 0) or np.any(y > raster.shape[0]-1):
                raise ValueError('Source transect leaves the measured image domain')
            x0, y0 = np.floor(x).astype(int), np.floor(y).astype(int)
            x1, y1 = np.minimum(x0+1, raster.shape[1]-1), np.minimum(y0+1, raster.shape[0]-1)
            dx, dy = (x-x0)[:, None], (y-y0)[:, None]
            def linear(pixels):
                c = pixels.astype(float)/255
                return np.where(c <= .04045, c/12.92, ((c+.055)/1.055)**2.4)
            rgb = (1-dy)*((1-dx)*linear(raster[y0, x0])+dx*linear(raster[y0, x1])) \
                + dy*((1-dx)*linear(raster[y1, x0])+dx*linear(raster[y1, x1]))
            return np.column_stack([rgb, np.ones(len(uv))])
        if kind == 'ShaderNodeMix':
            storage = self.reader.read(node['storage'])
            if storage['data_type'] != 2 or storage['blend_type'] != 0:
                raise ValueError('Source mix is no longer the measured color interpolation')
            factor = self.input(address, 'Factor_Float', uv)
            if factor.ndim != 0:
                raise ValueError('Spatial mix factor is outside the measured source recipe')
            f = float(np.clip(factor, 0, 1) if storage['clamp_factor'] else factor)
            if f == 0:
                result = self.input(address, 'A_Color', uv)
            elif f == 1:
                result = self.input(address, 'B_Color', uv)
            else:
                result = (1-f)*self.input(address, 'A_Color', uv) + f*self.input(address, 'B_Color', uv)
            return np.clip(result, 0, 1) if storage['clamp_result'] else result
        if kind == 'ShaderNodeGamma':
            color = self.input(address, 'Color', uv).copy()
            gamma = self.input(address, 'Gamma', uv)
            color[..., :3] = np.maximum(color[..., :3], 0) ** gamma
            return color
        raise ValueError('Unmeasured active source node: ' + kind)

    def sample(self, uv):
        return self.value(self.base_socket, uv)[:, :3]


def measure(wood_file):
    blend_file = SOURCE / 'src/SNOOKER+TABLE+CGTRADER.blend'
    if SHA(blend_file) != BLEND_SHA:
        raise ValueError('Purchased Blender source digest differs')
    reader = BlendMeasurements(blend_file)
    material = SourceMaterial(reader)
    wood = json.loads(Path(wood_file).read_text())
    objects = {o['id']['name'][2:]: o for _, o in reader.objects('OB')}
    rows, uv_rows = [], []
    color_node = next(a for a, n in material.nodes.items() if n['name'] == 'Image Texture')
    image = material.images[color_node]
    for rail in wood['rails']:
        obj = objects[rail['object']]
        mesh = reader.read(obj['data'])
        layers = reader.read_array(mesh['ldata']['layers'])
        uv_layers = [layer for layer in layers if layer['type'] == 49]
        if len(uv_layers) != 1 or uv_layers[0]['active_rnd'] != 0 or uv_layers[0]['name'] != rail['uv_layer']:
            raise ValueError('Blend and FBX active UV-layer identity differs')
        block = reader.addresses[mesh['mat']]
        mats = struct.unpack_from(reader.endian + 'Q'*mesh['totcol'], reader.data, block['offset'])
        if material.material_address not in mats:
            raise ValueError('Rail does not bind the measured Mahogany material')
        layer = uv_layers[0]
        uv_rows.append({'tag': 'MODEL(Star)', 'object': rail['object'], 'layer': layer['name'],
                        'active_render_layer': layer['active_rnd'], 'source_loop_count': mesh['totloop'],
                        'material': 'Mahogany', 'material_slot': mats.index(material.material_address)})
        density = rail['body_density']
        lo, hi = density['uv_bounds']
        columns = np.arange(np.ceil(lo[0]*image.shape[1]-.5), np.floor(hi[0]*image.shape[1]-.5)+1, dtype=int)
        u = (columns+.5)/image.shape[1]
        if not len(u) > 4:
            raise ValueError('No native-width source transect')
        step = density['uv_repeat_mm_area_weighted'][0]/image.shape[1]
        for fraction in FRACTIONS:
            v = lo[1]+fraction*(hi[1]-lo[1])
            uv = np.column_stack([u, np.full(len(u), v)])
            rgb = material.sample(uv)
            luma = rgb @ np.array([.2126, .7152, .0722])
            rows.append({'tag': 'MODEL(Star)',
                         'metric_conversion': 'DERIVED from the measured upper-body UV density and native image width',
                         'object': rail['object'], 'fraction_along_body': fraction,
                         'native_image_row_float': (1-v)*image.shape[0]-.5,
                         'native_image_column_interval': [int(columns[0]), int(columns[-1])],
                         'source_uv_repeat_across_mm': density['uv_repeat_mm_area_weighted'][0],
                         'units': 'mm', **spectral_component(luma, step)})
    if material.used_image_nodes != {color_node}:
        raise ValueError('Diffuse signal is not the one measured packed image')
    for row in material.image_rows:
        row['active_diffuse_signal'] = row['node'] == 'Image Texture'
    return {'schema': 'ob-cn8-star-packed-grain/1',
            'source': {'tag': 'MODEL(Star), cross-model', 'file': 'SNOOKER+TABLE+CGTRADER.blend',
                       'sha256': BLEND_SHA, 'blender_file_version': reader.version,
                       'wood_density_sha256': SHA(wood_file)},
            'derivation': {'recipe': 'tools/render/ghcn8/measure_d3_star_grain.py', 'recipe_sha256': SHA(__file__),
                           'reader_sha256': SHA(Path(__file__).with_name('read_blend_measurements.py')),
                           'boundary': 'Only scalar image identities, dimensions, sample locations, spectral summaries and material/UV binding facts are exported. No source bitmap, XYZ/index/UV array or shader graph is exported or installed.'},
            'material_binding': {'tag': 'MODEL(Star)', 'material': 'Mahogany', 'graph_sha256': material.graph_sha256,
                                 'active_diffuse_image': 'wood_birch_color.jpg',
                                 'unused_image_note': 'The node referencing mahogany_color.jpg has no path to the active Principled base color.',
                                 'sampling': 'Evaluate the source color MIX/GAMMA chain at the active UV samples; no Blender lighting or game material is copied. Image coordinates have no linked transform and the stored mapping is identity.',
                                 'images': material.image_rows, 'uv_bindings': uv_rows},
            'protocol': {'tag': 'TESSELLATION', 'longitudinal_fractions': FRACTIONS, 'native_column_stride': 1,
                         'minimum_frequency_bin': 2, 'bin_half_width': .5,
                         'method': 'Native across-grain image columns within each highest body-plane UV envelope. Linear Rec.709 luminance after the measured material color path; linear detrend, Hann window and strongest non-trend DFT bin. The half-bin interval states finite-window resolution. This is a spatial component, not proof of a periodic natural grain.'},
            'transects': rows,
            'transfer': {'tag': 'EST', 'value': 'The existing procedural bitmap retains its own appearance. One MODEL-derived physical atlas density is transferred to six planks. The source spectral intervals are comparison evidence, not a fitted renderer control; JOY photo millimetres remain unbound.'}}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--wood', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    if args.out.exists():
        parser.error('Fresh output required')
    result = measure(args.wood)
    args.out.mkdir(parents=True)
    target = args.out / 'cn8-pocket-d3-star-grain.json'
    target.write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({'file': str(target), 'transects': len(result['transects']),
                      'component_mm_range': [min(r['dominant_component'] for r in result['transects']), max(r['dominant_component'] for r in result['transects'])]}))


if __name__ == '__main__':
    main()
