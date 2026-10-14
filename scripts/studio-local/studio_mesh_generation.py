"""TripoSR learned reconstruction with a CPU marching-cubes backend.

The image encoder and triplane decoder use the published TripoSR checkpoint.
scikit-image replaces only the optional compiled isosurface extractor; it does
not replace model inference or invent geometry from an image extrusion.
"""
import importlib.util
import sys
import types
from pathlib import Path


def cpu_marching_cubes(volume, level):
    import numpy as np
    import torch
    from skimage.measure import marching_cubes
    positions, faces, _, _ = marching_cubes(volume.detach().cpu().numpy(), level=level)
    # torchmcubes uses the reverse axis order; the upstream helper converts it
    # back to the learned field's axes after normalization.
    return torch.from_numpy(positions[:, [2, 1, 0]].copy()), torch.from_numpy(np.asarray(faces, dtype=np.int64).copy())


def reconstruct(directory, foreground, output):
    import torch
    from PIL import Image
    directory = Path(directory).resolve()
    source = directory / 'TripoSR'
    weights = directory / 'mesh-models'
    if not (source / 'tsr' / 'system.py').is_file() or not (weights / 'model.ckpt').is_file():
        raise ValueError('Install the local TripoSR source and checkpoint before 3D generation')
    torch.set_num_threads(6)
    if str(source) not in sys.path: sys.path.insert(0, str(source))
    if 'torchmcubes' not in sys.modules and importlib.util.find_spec('torchmcubes') is None:
        backend = types.ModuleType('torchmcubes')
        backend.marching_cubes = cpu_marching_cubes
        sys.modules['torchmcubes'] = backend
    import tsr.models.tokenizers.image as tokenizer_module
    # The checkpoint contains the image encoder weights. Only its published
    # architecture JSON is required, and it is installed alongside the model.
    def local_dino_config(repo_id, filename):
        if repo_id != 'facebook/dino-vitb16' or filename != 'config.json': raise ValueError('Unsupported image tokenizer configuration')
        config = weights / 'dino-config.json'
        if not config.is_file(): raise ValueError('Install the published DINO architecture configuration')
        return str(config)
    tokenizer_module.hf_hub_download = local_dino_config
    from tsr.system import TSR
    from tsr.utils import resize_foreground
    model = TSR.from_pretrained(str(weights), config_name='config.yaml', weight_name='model.ckpt').to('cpu').eval()
    model.renderer.set_chunk_size(8192)
    prepared = resize_foreground(foreground, .85)
    import numpy as np
    rgba = np.asarray(prepared).astype(np.float32) / 255
    rgb = rgba[:, :, :3] * rgba[:, :, 3:4] + (1 - rgba[:, :, 3:4]) * .5
    model_image = Image.fromarray((rgb * 255).astype(np.uint8))
    with torch.inference_mode():
        codes = model([model_image], device='cpu')
        mesh = model.extract_mesh(codes, has_vertex_color=True, resolution=128)[0]
    if len(mesh.vertices) < 10 or len(mesh.faces) < 10:
        raise RuntimeError('TripoSR produced an empty surface; try a clearer foreground image')
    mesh.fix_normals()
    # TripoSR cameras use +X as the front view and +Z as up. glTF/Three use
    # +Y as up; rotate the learned mesh and its colors into that convention.
    basis = np.eye(4)
    basis[:3, :3] = [[0, 1, 0], [0, 0, 1], [1, 0, 0]]
    mesh.apply_transform(basis)
    mesh.export(output, file_type='glb')
    if not output.is_file() or output.stat().st_size < 100:
        raise RuntimeError('TripoSR did not export a usable GLB')
    del model, codes
    import gc
    gc.collect()
