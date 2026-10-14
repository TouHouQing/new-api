# -*- coding: utf-8 -*-
"""
统一本地推理网关（串行调度版）
============================================
路由规则（POST /api/generate，按 model 字段分发）：
  model = "text"   -> Ollama   (Qwen3.5-9B,  OpenAI 兼容 /v1/chat/completions)
  model = "image"  -> ComfyUI  (FLUX.2 Klein 4B,  工作流 workflows/flux2_klein_api.json)
  model = "video"  -> ComfyUI  (Wan 2.2-TI2V-5B, 工作流 workflows/wan22_ti2v_api.json)

串行与显存管理（核心，适配 12GB 显存）：
  * 全局 asyncio.Lock：同一时刻只处理一个请求
  * 模型族切换时调用 ComfyUI POST /free 强制卸载旧模型，避免爆显存
  * 文本请求前同样 /free，把 12GB 全部让给 Ollama；
    Ollama 侧设 OLLAMA_KEEP_ALIVE=0，每次回答完立即卸载 Qwen
  * 同一模型族连续请求不清缓存（复用已加载模型，快）

前置条件：
  pip install fastapi uvicorn httpx
启动：
  python gateway.py          # 监听 http://127.0.0.1:8000
"""
import asyncio
import json
import os
import random
import time
from pathlib import Path

import httpx
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

# ================= 配置区 =================
COMFY_URL = os.environ.get("COMFY_URL", "http://127.0.0.1:8188")
OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://127.0.0.1:11434")
TEXT_MODEL = os.environ.get("TEXT_MODEL", "qwen3.5:9b")

WORKFLOW_IMAGE = Path(os.environ.get("WORKFLOW_IMAGE", "workflows/flux2_klein_api.json"))
WORKFLOW_VIDEO = Path(os.environ.get("WORKFLOW_VIDEO", "workflows/wan22_ti2v_api.json"))

# 工作流中的占位符约定（在 ComfyUI 里把对应输入填成这些字符串，再导出 API 格式 JSON）
PLACEHOLDER_STR = {"__PROMPT__", "__NEGATIVE__"}
PLACEHOLDER_INT = {"__SEED__", "__WIDTH__", "__HEIGHT__", "__FRAMES__"}

COMFY_TIMEOUT = {"image": 600, "video": 1800}  # 秒，视频给足 30 分钟
POLL_INTERVAL = 2.0
# ==========================================

app = FastAPI(title="本地多模型串行推理网关")
_lock = asyncio.Lock()                 # 串行锁
_client = httpx.AsyncClient(timeout=httpx.Timeout(1800.0), trust_env=False)
_current_family = None                 # "image" | "video" | None（当前 ComfyUI 驻留的模型族）
_comfy_workflows = {}                  # 工作流 JSON 缓存


class GenerateRequest(BaseModel):
    model: str                          # text | image | video
    prompt: str = ""
    negative: str = ""
    messages: list | None = None        # text 专用，与 prompt 二选一
    seed: int = -1                      # -1 = 随机
    width: int = 1024
    height: int = 1024
    frames: int = 81                    # 视频帧数（Wan 2.2 官方工作流常用 81 帧 ≈ 5 秒）
    stream: bool = False
    max_tokens: int = 4096
    context_length: int = 8192
    think: bool = False


async def comfy_free():
    """强制卸载 ComfyUI 已加载模型，释放显存。"""
    try:
        await _client.post(f"{COMFY_URL}/free",
                           json={"unload_models": True, "free_memory": True})
    except Exception:
        pass  # ComfyUI 未启动等场景，后续调用会自然报错


def load_workflow(path: Path) -> dict:
    if path in _comfy_workflows:
        return _comfy_workflows[path]
    if not path.exists():
        raise HTTPException(500, f"工作流文件不存在: {path}（请先在 ComfyUI 导出 API 格式 JSON）")
    with open(path, "r", encoding="utf-8") as f:
        wf = json.load(f)
    _comfy_workflows[path] = wf
    return wf


def apply_placeholders(workflow: dict, req: GenerateRequest) -> dict:
    """深拷贝工作流，把节点里的占位符替换为真实参数。"""
    import copy
    wf = copy.deepcopy(workflow)
    seed = req.seed if req.seed >= 0 else random.randint(0, 2**31 - 1)
    int_map = {"__SEED__": seed, "__WIDTH__": req.width,
               "__HEIGHT__": req.height, "__FRAMES__": req.frames}
    str_map = {"__PROMPT__": req.prompt, "__NEGATIVE__": req.negative}

    def walk(node_inputs):
        if not isinstance(node_inputs, dict):
            return
        for k, v in node_inputs.items():
            if isinstance(v, dict):
                walk(v)
            elif isinstance(v, list):
                for item in v:
                    if isinstance(item, dict):
                        walk(item)
            elif isinstance(v, str):
                if v in int_map:
                    node_inputs[k] = int_map[v]
                elif v in str_map:
                    node_inputs[k] = str_map[v]

    for node in wf.values():
        if isinstance(node, dict) and "inputs" in node:
            walk(node["inputs"])
    return wf


async def comfy_run(req: GenerateRequest, family: str, workflow_path: Path) -> dict:
    global _current_family
    # 模型族切换 -> 强制卸载，防止 12GB 爆显存；同族连续请求保留缓存
    if _current_family != family:
        await comfy_free()
        _current_family = family

    workflow = apply_placeholders(load_workflow(workflow_path), req)
    try:
        resp = await _client.post(f"{COMFY_URL}/prompt", json={"prompt": workflow})
    except Exception as e:
        raise HTTPException(502, f"ComfyUI 不可达: {e}")
    if resp.status_code != 200:
        raise HTTPException(502, f"Ollama returned HTTP {resp.status_code}")
    data = resp.json()
    if "error" in data:
        raise HTTPException(500, f"ComfyUI 工作流错误: {data['error']}")

    prompt_id = data["prompt_id"]
    deadline = time.time() + COMFY_TIMEOUT[family]
    while time.time() < deadline:
        await asyncio.sleep(POLL_INTERVAL)
        hist = (await _client.get(f"{COMFY_URL}/history/{prompt_id}")).json()
        entry = hist.get(prompt_id)
        if not entry:
            continue
        status = entry.get("status", {})
        if status.get("completed"):
            files = []
            for node_out in entry.get("outputs", {}).values():
                for key in ("images", "gifs", "videos"):
                    for f in node_out.get(key, []):
                        files.append({
                            "url": f"{COMFY_URL}/view?filename={f['filename']}&subfolder={f.get('subfolder','')}&type={f.get('type','output')}",
                            "filename": f["filename"],
                            "subfolder": f.get("subfolder", ""),
                            "type": f.get("type", "output"),
                        })
            if not files:
                raise HTTPException(500, "任务完成但未找到输出文件（检查工作流是否连了保存节点）")
            return {"prompt_id": prompt_id, "outputs": files, "elapsed_sec": round(time.time() - deadline + COMFY_TIMEOUT[family], 1)}
        if status.get("status_str") == "error":
            raise HTTPException(500, f"ComfyUI 执行失败: {status.get('messages', [])}")
    raise HTTPException(504, f"ComfyUI 任务超时（>{COMFY_TIMEOUT[family]}s）")


async def ollama_chat(req: GenerateRequest) -> dict:
    global _current_family
    # 文本请求前：让 ComfyUI 卸载，12GB 全部让给 Qwen（Ollama 侧 keep_alive=0 用后即卸）
    if _current_family is not None:
        await comfy_free()
        _current_family = None

    if req.messages:
        messages = req.messages
    else:
        messages = [{"role": "user", "content": req.prompt}]
    if not 1 <= req.max_tokens <= 8192 or not 2048 <= req.context_length <= 32768:
        raise HTTPException(400, "Text generation limit is outside the local supported range")
    body = {
        "model": TEXT_MODEL,
        "messages": messages,
        "stream": False,
        "keep_alive": 0,  # 回答完立即卸载模型，避免占显存
        "think": req.think,
        "options": {"num_ctx": req.context_length, "num_predict": req.max_tokens},
    }
    try:
        resp = await _client.post(f"{OLLAMA_URL}/api/chat", json=body)
    except Exception as e:
        raise HTTPException(502, f"Ollama 不可达: {e}")
    if resp.status_code != 200:
        raise HTTPException(502, f"Ollama returned HTTP {resp.status_code}")
    data = resp.json()
    if "error" in data:
        raise HTTPException(500, f"Ollama 错误: {data['error']}")
    return {
        "model": TEXT_MODEL,
        "content": data["message"]["content"],
        "usage": {"prompt_tokens": data.get("prompt_eval_count", 0), "completion_tokens": data.get("eval_count", 0), "total_tokens": data.get("prompt_eval_count", 0) + data.get("eval_count", 0)},
    }


@app.post("/api/generate")
async def generate(req: GenerateRequest):
    async with _lock:  # 串行：同一时刻只跑一个请求
        if req.model == "text":
            return await ollama_chat(req)
        if req.model == "image":
            return await comfy_run(req, "image", WORKFLOW_IMAGE)
        if req.model == "video":
            return await comfy_run(req, "video", WORKFLOW_VIDEO)
        raise HTTPException(400, f"未知 model: {req.model}，可用: text / image / video")


@app.get("/api/models")
async def list_models():
    return {
        "text": [TEXT_MODEL],
        "image": ["flux.2-klein-4b"],
        "video": ["wan2.2-ti2v-5b"],
    }


@app.get("/api/health")
async def health():
    c = h = False
    try:
        r = await _client.get(f"{COMFY_URL}/system_stats")
        c = r.status_code == 200
    except Exception:
        pass
    try:
        r = await _client.get(f"{OLLAMA_URL}/v1/models")
        h = r.status_code == 200
    except Exception:
        pass
    return {"comfyui": c, "ollama": h, "current_family": _current_family}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
