"""Release CPU encoders as well as GPU models in the private inference runtime."""
from functools import wraps


def install_cpu_model_cleanup(models):
    original = models.unload_all_models
    if getattr(original, 'studio_cpu_cleanup', False):
        return

    @wraps(original)
    def release_models():
        original()
        # ComfyUI enumerates accelerator devices during its default unload.
        # CPU text encoders remain in current_loaded_models unless explicitly
        # unloaded, even after the executor clears its graph cache.
        models.free_memory(1e30, models.torch.device('cpu'))
        models.studio_memory_cleanup_count = getattr(models, 'studio_memory_cleanup_count', 0) + 1

    release_models.studio_cpu_cleanup = True
    models.unload_all_models = release_models


NODE_CLASS_MAPPINGS = {}
