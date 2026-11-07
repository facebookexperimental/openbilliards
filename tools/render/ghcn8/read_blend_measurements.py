# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Read typed Blender datablocks for local source measurements; never execute it."""
from pathlib import Path
import re
import struct


class BlendMeasurements:
    def __init__(self, path):
        self.path = Path(path)
        self.data = self.path.read_bytes()
        if not self.data.startswith(b'BLENDER'):
            raise ValueError('Expected an uncompressed Blender file')
        self.pointer_size = {b'-': 8, b'_': 4}[self.data[7:8]]
        self.endian = {b'v': '<', b'V': '>'}[self.data[8:9]]
        self.version = self.data[9:12].decode()
        fmt = self.endian + '4sI' + ('Q' if self.pointer_size == 8 else 'I') + 'II'
        size = struct.calcsize(fmt)
        self.blocks, self.addresses = [], {}
        position = 12
        while position + size <= len(self.data):
            code, length, address, dna, count = struct.unpack_from(fmt, self.data, position)
            if length > len(self.data) - position - size:
                raise ValueError('Invalid datablock extent')
            block = {'code': code.rstrip(b'\0').decode(), 'size': length, 'address': address,
                     'dna': dna, 'count': count, 'offset': position + size}
            self.blocks.append(block)
            if address:
                self.addresses[address] = block
            position += size + length
            if code == b'ENDB':
                break
        if position != len(self.data):
            raise ValueError('Unparsed Blender bytes')
        block = next(b for b in self.blocks if b['code'] == 'DNA1')
        self._dna(self.data[block['offset']:block['offset'] + block['size']])

    def _dna(self, dna):
        p = 0
        def token(value):
            nonlocal p
            if dna[p:p+4] != value:
                raise ValueError('Invalid DNA token')
            p += 4
        def number(fmt):
            nonlocal p
            value = struct.unpack_from(self.endian + fmt, dna, p)[0]
            p += struct.calcsize(fmt)
            return value
        def strings():
            nonlocal p
            count = number('I')
            values = []
            for _ in range(count):
                end = dna.index(0, p)
                values.append(dna[p:end].decode())
                p = end + 1
            p = (p + 3) // 4 * 4
            return values
        token(b'SDNA'); token(b'NAME'); self.names = strings()
        token(b'TYPE'); self.types = strings()
        token(b'TLEN'); self.lengths = [number('H') for _ in self.types]
        p = (p + 3) // 4 * 4
        token(b'STRC'); count = number('I')
        self.structs, self.by_name = [], {}
        for _ in range(count):
            ti, fields_count = number('H'), number('H')
            fields, offset = [], 0
            for _ in range(fields_count):
                ft, fn = number('H'), number('H')
                declaration = self.names[fn]
                pointer = '*' in declaration
                dims = [int(v) for v in re.findall(r'\[(\d+)\]', declaration)]
                elements = 1
                for dim in dims:
                    elements *= dim
                length = (self.pointer_size if pointer else self.lengths[ft]) * elements
                name = re.search(r'[A-Za-z_]\w*', declaration).group()
                fields.append({'name': name, 'declaration': declaration, 'type': self.types[ft], 'type_index': ft,
                               'pointer': pointer, 'elements': elements, 'array': bool(dims), 'offset': offset, 'size': length})
                offset += length
            row = {'type': self.types[ti], 'size': self.lengths[ti], 'fields_size': offset, 'fields': fields}
            self.structs.append(row)
            self.by_name[row['type']] = row

    def read(self, address, type_name=None):
        block = self.addresses[address]
        row = self.by_name[type_name] if type_name else self.structs[block['dna']]
        if block['count'] != 1 or block['size'] < row['size']:
            raise ValueError('Expected one complete typed datablock')
        return self._struct(block['offset'], row)

    def read_array(self, address, type_name=None):
        block = self.addresses[address]
        row = self.by_name[type_name] if type_name else self.structs[block['dna']]
        if block['size'] != row['size'] * block['count']:
            raise ValueError('Typed array extent differs')
        return [self._struct(block['offset'] + i * row['size'], row) for i in range(block['count'])]

    def _struct(self, start, row):
        if row['fields_size'] != row['size']:
            raise ValueError('DNA padding is not explicitly represented: ' + row['type'])
        result = {'_type': row['type']}
        primitive = {'char': 'b', 'uchar': 'B', 'int8_t': 'b', 'uint8_t': 'B', 'short': 'h',
                     'ushort': 'H', 'int16_t': 'h', 'uint16_t': 'H', 'int': 'i', 'uint': 'I',
                     'int32_t': 'i', 'uint32_t': 'I', 'float': 'f', 'double': 'd',
                     'int64_t': 'q', 'uint64_t': 'Q'}
        for field in row['fields']:
            at, kind, n = start + field['offset'], field['type'], field['elements']
            if field['pointer']:
                values = struct.unpack_from(self.endian + ('Q' if self.pointer_size == 8 else 'I') * n, self.data, at)
            elif kind == 'char' and field['array']:
                values = [self.data[at:at+n].split(b'\0', 1)[0].decode(errors='replace')]
            elif kind in primitive:
                values = struct.unpack_from(self.endian + primitive[kind] * n, self.data, at)
            elif kind in self.by_name:
                nested = self.by_name[kind]
                values = [self._struct(at + i * nested['size'], nested) for i in range(n)]
            else:
                values = [self.data[at:at+field['size']].hex()]
            result[field['name']] = values[0] if len(values) == 1 else list(values)
        return result

    def linked(self, listbase):
        pointer, seen, rows = listbase['first'], set(), []
        while pointer:
            if pointer in seen:
                raise ValueError('Cyclic source linked list')
            seen.add(pointer)
            row = self.read(pointer)
            rows.append((pointer, row))
            pointer = row['next']
        if rows and rows[-1][0] != listbase['last']:
            raise ValueError('Source linked-list end differs')
        return rows

    def objects(self, code):
        return [(b['address'], self.read(b['address'])) for b in self.blocks if b['code'] == code]
