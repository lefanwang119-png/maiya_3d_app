import json
import struct
from pathlib import Path

import numpy as np


COMPONENT_FLOAT = 5126
COMPONENT_UINT = 5125
COMPONENT_USHORT = 5123
TARGET_ARRAY_BUFFER = 34962
TARGET_ELEMENT_ARRAY_BUFFER = 34963


def read_glb(path):
    data = Path(path).read_bytes()
    magic, version, length = struct.unpack_from("<III", data, 0)
    if magic != 0x46546C67 or version != 2 or length != len(data):
        raise ValueError("Not a valid GLB v2 file")
    offset = 12
    chunks = {}
    while offset < len(data):
        chunk_length, chunk_type = struct.unpack_from("<II", data, offset)
        offset += 8
        chunks[chunk_type] = data[offset : offset + chunk_length]
        offset += chunk_length
    return json.loads(chunks[0x4E4F534A].decode("utf-8")), chunks[0x004E4942]


def accessor_array(gltf, binary, index):
    accessor = gltf["accessors"][index]
    view = gltf["bufferViews"][accessor["bufferView"]]
    byte_offset = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
    count = accessor["count"]
    accessor_type = accessor["type"]
    component = accessor["componentType"]
    item_size = {"SCALAR": 1, "VEC2": 2, "VEC3": 3}[accessor_type]
    dtype = {
        COMPONENT_FLOAT: np.float32,
        COMPONENT_UINT: np.uint32,
        COMPONENT_USHORT: np.uint16,
    }[component]
    arr = np.frombuffer(binary, dtype=dtype, count=count * item_size, offset=byte_offset)
    if item_size > 1:
        arr = arr.reshape((count, item_size))
    return arr.copy()


def pad4(blob):
    padding = (-len(blob)) % 4
    return blob + (b"\x00" * padding)


def pad4_json(blob):
    padding = (-len(blob)) % 4
    return blob + (b" " * padding)


def simplify(input_path, output_path, resolution=64):
    gltf, binary = read_glb(input_path)
    primitive = gltf["meshes"][0]["primitives"][0]
    attrs = primitive["attributes"]
    positions = accessor_array(gltf, binary, attrs["POSITION"]).astype(np.float32)
    normals = accessor_array(gltf, binary, attrs["NORMAL"]).astype(np.float32)
    uvs = accessor_array(gltf, binary, attrs["TEXCOORD_0"]).astype(np.float32)
    indices = accessor_array(gltf, binary, primitive["indices"]).astype(np.uint32).reshape(-1)

    bounds_min = positions.min(axis=0)
    bounds_max = positions.max(axis=0)
    extent = np.maximum(bounds_max - bounds_min, 1e-6)
    q = np.floor((positions - bounds_min) / extent * resolution).astype(np.int32)
    q = np.clip(q, 0, resolution)
    keys = q[:, 0] + q[:, 1] * (resolution + 1) + q[:, 2] * (resolution + 1) * (resolution + 1)

    _, inverse = np.unique(keys, return_inverse=True)
    cluster_count = int(inverse.max()) + 1
    counts = np.bincount(inverse, minlength=cluster_count).astype(np.float32)

    new_positions = np.stack([
        np.bincount(inverse, weights=positions[:, axis], minlength=cluster_count) / counts
        for axis in range(3)
    ], axis=1).astype(np.float32)
    new_normals = np.stack([
        np.bincount(inverse, weights=normals[:, axis], minlength=cluster_count) / counts
        for axis in range(3)
    ], axis=1).astype(np.float32)
    normal_len = np.linalg.norm(new_normals, axis=1, keepdims=True)
    new_normals = new_normals / np.maximum(normal_len, 1e-6)
    new_uvs = np.stack([
        np.bincount(inverse, weights=uvs[:, axis], minlength=cluster_count) / counts
        for axis in range(2)
    ], axis=1).astype(np.float32)

    remapped = inverse[indices].astype(np.uint32).reshape((-1, 3))
    keep = (
        (remapped[:, 0] != remapped[:, 1])
        & (remapped[:, 1] != remapped[:, 2])
        & (remapped[:, 0] != remapped[:, 2])
    )
    remapped = remapped[keep].reshape(-1)

    used = np.unique(remapped)
    compact = np.full(cluster_count, -1, dtype=np.int64)
    compact[used] = np.arange(len(used))
    new_indices = compact[remapped].astype(np.uint32)
    new_positions = new_positions[used]
    new_normals = new_normals[used]
    new_uvs = new_uvs[used]

    index_component = COMPONENT_USHORT if len(new_positions) <= 65535 else COMPONENT_UINT
    index_dtype = np.uint16 if index_component == COMPONENT_USHORT else np.uint32
    new_indices = new_indices.astype(index_dtype)

    chunks = []
    views = []

    def add_view(array, target):
        offset = sum(len(chunk) for chunk in chunks)
        blob = pad4(array.tobytes())
        chunks.append(blob)
        views.append({
            "buffer": 0,
            "byteOffset": offset,
            "byteLength": int(array.nbytes),
            "target": target,
        })

    add_view(new_positions.astype(np.float32), TARGET_ARRAY_BUFFER)
    add_view(new_normals.astype(np.float32), TARGET_ARRAY_BUFFER)
    add_view(new_uvs.astype(np.float32), TARGET_ARRAY_BUFFER)
    add_view(new_indices, TARGET_ELEMENT_ARRAY_BUFFER)
    out_bin = b"".join(chunks)

    out_gltf = {
        "asset": gltf.get("asset", {"version": "2.0"}),
        "scene": gltf.get("scene", 0),
        "scenes": gltf.get("scenes", [{"nodes": [0]}]),
        "nodes": gltf.get("nodes", [{"mesh": 0}]),
        "materials": gltf.get("materials", []),
        "meshes": [{
            "name": gltf["meshes"][0].get("name", "preview"),
            "primitives": [{
                "attributes": {"POSITION": 0, "NORMAL": 1, "TEXCOORD_0": 2},
                "indices": 3,
                "material": primitive.get("material", 0),
            }],
        }],
        "accessors": [
            {
                "bufferView": 0,
                "componentType": COMPONENT_FLOAT,
                "count": int(len(new_positions)),
                "type": "VEC3",
                "min": new_positions.min(axis=0).tolist(),
                "max": new_positions.max(axis=0).tolist(),
            },
            {
                "bufferView": 1,
                "componentType": COMPONENT_FLOAT,
                "count": int(len(new_normals)),
                "type": "VEC3",
            },
            {
                "bufferView": 2,
                "componentType": COMPONENT_FLOAT,
                "count": int(len(new_uvs)),
                "type": "VEC2",
            },
            {
                "bufferView": 3,
                "componentType": index_component,
                "count": int(len(new_indices)),
                "type": "SCALAR",
            },
        ],
        "bufferViews": views,
        "buffers": [{"byteLength": len(out_bin)}],
    }
    if gltf.get("extensionsUsed"):
        out_gltf["extensionsUsed"] = gltf["extensionsUsed"]

    json_blob = pad4_json(json.dumps(out_gltf, separators=(",", ":")).encode("utf-8"))
    total_length = 12 + 8 + len(json_blob) + 8 + len(out_bin)
    out = bytearray()
    out += struct.pack("<III", 0x46546C67, 2, total_length)
    out += struct.pack("<II", len(json_blob), 0x4E4F534A)
    out += json_blob
    out += struct.pack("<II", len(out_bin), 0x004E4942)
    out += out_bin
    Path(output_path).write_bytes(out)
    return {
        "resolution": resolution,
        "vertices": len(new_positions),
        "triangles": len(new_indices) // 3,
        "bytes": len(out),
    }


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("input")
    parser.add_argument("output")
    parser.add_argument("--resolution", type=int, default=64)
    args = parser.parse_args()
    print(simplify(args.input, args.output, args.resolution))
