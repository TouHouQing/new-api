"""Installed only inside the task's isolated ComfyUI custom-node directory."""
import logging
from pathlib import Path
from aiohttp import web
from comfy import model_management
from comfy.cli_args import args
from server import PromptServer
from .policy import install_cpu_model_cleanup

if args.listen != '127.0.0.1' or args.port != 8288 or not args.base_directory or Path(args.base_directory).name != 'private-comfy':
    raise RuntimeError('The studio memory policy is limited to the private loopback runtime')

install_cpu_model_cleanup(model_management)
logging.info('Studio private memory policy: release CPU encoders and GPU models')


@PromptServer.instance.routes.get('/studio/memory')
async def memory_policy(request):
    loaded = model_management.current_loaded_models
    return web.json_response({'policy': 'release_cpu_and_gpu', 'loaded_models': len(loaded),
                              'cpu_loaded_models': sum(str(model.device) == 'cpu' for model in loaded),
                              'cleanup_count': getattr(model_management, 'studio_memory_cleanup_count', 0)})


NODE_CLASS_MAPPINGS = {}
