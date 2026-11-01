# 影策本地模型传输

本目录提供 Ollama / ComfyUI 的轻量传输适配。影策原生后端仍负责项目、鉴权、任务、资源和账务。

```sh
python -m pip install -r model-gateway/requirements.txt
python model-gateway/gateway.py
```

保持 ComfyUI 和 Ollama 运行。默认仅监听本机 `127.0.0.1:8001`，不需要 API Key；不直接暴露到公网。回执目录应持久保存，单进程运行。

取消入口为 `POST /api/jobs/:prompt_id/cancel`。运行中断需先确认安装的 ComfyUI 支持按 `prompt_id` 定向中断，再设置 `MODEL_GATEWAY_TARGETED_CANCEL=1`；默认关闭。取消只操作已核验的提交回执，保留其他队列任务、源文件和历史；界面停止等待不代表推理已停止，须查询后续回执。

配置、能力限制、回执恢复及真实测试范围见 [本地模型接入](../docs/content/docs/backend/local-models.mdx)。

`/api/agent/generate` 供影策原生 Agent 模型桥传递工具会话；实际工具仍由影策审批和执行。长中文可使用 `AGENT_TOKENIZER_DIR`；先用 `verify_tokenizer.py` 对已有分词文件、安装模型及固定来源进行核对，运行时不下载权重。普通文本和 Agent 均按配置传递上下文及输出限制。

运行传输专项：`python -m unittest discover -s model-gateway`。这些测试使用协议替身验证重复提交及丢失回执，不替代真实模型生成测试。

## 离线配音

`audio_gateway.py` 是可选的独立配音传输，默认监听 `127.0.0.1:8002`。影策原生 `yingce-local-audio` 系统渠道调用它；任务、素材、权限、预算与结果入库仍由影策管理。它不会创建个人 API Key，也不会下载模型或在回执不明时重新推理。

配置已经安装的 `SPEECH_PYTHON`、`SPEECH_MODEL_DIR`、`SPEECH_FFMPEG` 和持久化 `MODEL_RECEIPT_DIR` 后运行 `python model-gateway/audio_gateway.py`。模型目录须有完整的 Chatterbox Multilingual 权重，FFmpeg 旁须有 FFprobe。使用 `scripts/start-model-transport-local.ps1` 时设置 `speechOnly: true` 及对应的 `speechPython`、`speechModelDirectory`、`speechFFmpeg`；为配音分配独立端口和回执目录。生产启动器会读取与环境文件同目录的 `.local-speech-models.json`。

`POST /api/audio/submit` 必须携带稳定的 `Idempotency-Key`。台词不超过3000字，支持目录公布的23种语言、0.5–2倍语速及 WAV/MP3/FLAC/Opus。台词只包含要朗读的原文；模型不支持自由文字声音指令。参考音色只接收3–20秒的已上传音频，必须明确确认这份声音的使用权；原生后端重新校验归属并读取原始文件，授权随任务绑定到准确的资源编号。更换参考须重新确认。

提交后按原 `prompt_id` 查询 `/api/jobs/:id`，完成后读取 `/api/jobs/:id/outputs/0`；取消只结束该任务的子进程。已完成文件通过长度和 SHA256 校验后可恢复。服务重启后未完成任务会明确报告中断，不自动重新推理。临时参考在完成、取消和关闭服务时清理，产物与回执保留。

## 离线声音分离

`media_gateway.py` 默认监听 `127.0.0.1:8005`，使用已安装的 Demucs 与 CPU，将音频分为人声和伴奏，或展开全部五轨（另含鼓点、贝斯、其他乐器）。影策的 `yingce-local-separation` 原生系统渠道调用 `/api/media/separate`；项目、任务、素材、权限及费用仍由影策管理。

配置 `MEDIA_PYTHON`、`MEDIA_MODEL`（固定校验和的 `955717e8-8726e21a.th`）、`MEDIA_FFMPEG`、`MODEL_RECEIPT_DIR`。启动器配置使用 `mediaOnly: true`、`mediaPython`、`mediaModel`、`mediaFFmpeg`，放在环境文件旁的 `.local-media-models.json`，分配独立端口与回执目录。不会下载权重或将上传文件作为模型加载。

提交携带稳定的 `Idempotency-Key`，参数为 `model_name: "htdemucs"`、已上传原音频的 `reference_audio` 字节及 `stems: "pair" | "all"`。源音频支持0.1秒至10分钟、最大32 MiB，视频需先提取声音；请求中的时长提示不会影响磁盘预检。输出为原时长、44.1 kHz 立体声 PCM16 WAV，必要时对所有输出使用同一增益防止溢出，并记录增益。每条结果保留名称、角色、原文件与模型 SHA256。整组验证成功后原生任务才交付素材；恢复、取消和关闭服务不启动第二次推理，临时输入会清理，已完成结果可离线复读。源素材不存在的声部可能接近静音，分离听感须试听确认。
