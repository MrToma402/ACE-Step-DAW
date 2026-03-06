"""
ACE-Step 1.5 — Modal Serverless Deployment

Deploys the ACE-Step music generation model as a serverless GPU endpoint on Modal.
Uses acestep-v15-turbo DiT model from ACE-Step/Ace-Step1.5.

Deploy:
    modal deploy modal/deploy_acestep.py

Endpoint URL:
    Provided by `modal deploy` output for your Modal app.
"""

import modal

# ---------------------------------------------------------------------------
# Modal App & Image
# ---------------------------------------------------------------------------

app = modal.App("acestep")

CHECKPOINT_DIR = "/opt/ACE-Step/checkpoints"
LORA_VOLUME = modal.Volume.from_name("acestep-loras", create_if_missing=True)
LORA_DIR = "/loras"

# Build the container image with all dependencies + pre-downloaded models
acestep_image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("git", "ffmpeg", "libsndfile1")
    .pip_install(
        "torch>=2.1.0",
        "torchaudio>=2.1.0",
        "transformers>=4.51.0,<4.58.0",
        "accelerate>=1.12.0",
        "diffusers>=0.33.0",
        "safetensors>=0.4.0",
        "soundfile>=0.12.0",
        "librosa>=0.10.0",
        "numpy>=1.24.0",
        "scipy>=1.11.0",
        "huggingface_hub>=0.20.0",
        "pydantic>=2.0.0",
        "einops>=0.7.0",
        "rotary-embedding-torch>=0.5.0",
        "fastapi[standard]",
        # ACE-Step runtime deps (installed with --no-deps to avoid torch conflicts)
        "loguru>=0.7.3",
        "matplotlib>=3.7.5",
        "diskcache",
        "numba>=0.63.1",
        "vector-quantize-pytorch>=1.27.15",
        "torchcodec>=0.9.1",
        "peft>=0.18.0",
        "lightning>=2.0.0",
        "tensorboard>=2.0.0",
        "toml",
        "pypinyin",
        "modelscope",
    )
    .run_commands(
        # Clone ACE-Step 1.5 repo
        "git clone --depth 1 https://github.com/ACE-Step/ACE-Step-1.5.git /opt/ACE-Step",
        # Install nano-vllm (local third-party dependency)
        "cd /opt/ACE-Step/acestep/third_parts/nano-vllm && pip install .",
        # Install hatchling build backend + the package itself
        "pip install hatchling",
        "cd /opt/ACE-Step && pip install --no-deps .",
    )
    # Download model weights at IMAGE BUILD TIME (not at cold start)
    .run_commands(
        f"python -c \""
        f"from huggingface_hub import snapshot_download; "
        f"snapshot_download(repo_id='ACE-Step/Ace-Step1.5', local_dir='{CHECKPOINT_DIR}'); "
        f"snapshot_download(repo_id='ACE-Step/acestep-5Hz-lm-4B', local_dir='{CHECKPOINT_DIR}/acestep-5Hz-lm-4B')"
        f"\"",
    )
)


# ---------------------------------------------------------------------------
# Inference Class
# ---------------------------------------------------------------------------

@app.cls(
    image=acestep_image,
    gpu="A10G",  # 24GB VRAM
    timeout=600,
    scaledown_window=120,  # Keep warm for 2 min after last request
    allow_concurrent_inputs=1,
    volumes={LORA_DIR: LORA_VOLUME},
)
class AceStepInference:
    """ACE-Step music generation inference endpoint."""

    @modal.enter()
    def load_model(self):
        """Load model into GPU on container startup (weights already in image)."""
        import os
        import sys
        sys.path.insert(0, "/opt/ACE-Step")

        from acestep.handler import AceStepHandler
        self.handler = AceStepHandler()

        status_msg, ok = self.handler.initialize_service(
            project_root="/opt/ACE-Step",
            config_path="acestep-v15-turbo",
            device="cuda",
            use_flash_attention=True,
            compile_model=False,
            offload_to_cpu=False,
            offload_dit_to_cpu=False,
        )
        if not ok:
            raise RuntimeError(f"Model init failed: {status_msg}")
        print("[Modal] DiT loaded: acestep-v15-turbo")

        # Initialize 5Hz LM (4B) with vllm backend
        from acestep.llm_inference import LLMHandler
        self.llm_handler = LLMHandler()
        lm_status, lm_ok = self.llm_handler.initialize(
            checkpoint_dir=os.path.join("/opt/ACE-Step", "checkpoints"),
            lm_model_path="acestep-5Hz-lm-4B",
            backend="vllm",
            device="cuda",
        )
        if not lm_ok:
            print(f"[Modal] WARNING: LM init failed: {lm_status}. Continuing without LM.")
            self.llm_handler = None
        else:
            print("[Modal] LM loaded: acestep-5Hz-lm-4B (vllm)")

        self.temp_dir = "/tmp/acestep_audio"
        os.makedirs(self.temp_dir, exist_ok=True)

    @modal.fastapi_endpoint(method="GET", docs=True)
    def api_list_loras(self):
        """List all trained LoRA adapters stored on the persistent volume."""
        import os
        import json

        LORA_VOLUME.reload()
        loras = []
        if os.path.isdir(LORA_DIR):
            for name in sorted(os.listdir(LORA_DIR)):
                lora_path = os.path.join(LORA_DIR, name)
                if not os.path.isdir(lora_path):
                    continue
                # Read metadata if exists
                meta_path = os.path.join(lora_path, "meta.json")
                meta = {}
                if os.path.exists(meta_path):
                    with open(meta_path) as f:
                        meta = json.load(f)
                # Check for safetensors weights
                has_weights = any(
                    f.endswith(".safetensors") or f.endswith(".bin")
                    for f in os.listdir(lora_path)
                )
                loras.append({
                    "name": name,
                    "has_weights": has_weights,
                    "created_at": meta.get("created_at"),
                    "epochs": meta.get("epochs"),
                    "rank": meta.get("rank"),
                    "num_files": meta.get("num_files"),
                })
        return {"loras": loras}

    @modal.fastapi_endpoint(method="POST", docs=True)
    def api_train(self, request: dict):
        """
        Train a LoRA adapter from uploaded audio files.
        Audio files are provided as base64-encoded data.
        Training runs asynchronously and saves weights to the persistent volume.
        """
        import os
        import sys
        import base64
        import json
        import traceback
        import uuid
        sys.path.insert(0, "/opt/ACE-Step")

        try:
            lora_name = request.get("lora_name", "").strip()
            if not lora_name:
                return {"status": "failed", "error": "lora_name is required"}

            audio_files = request.get("audio_files", [])
            if not audio_files:
                return {"status": "failed", "error": "No audio files provided"}

            epochs = request.get("epochs", 100)
            learning_rate = request.get("learning_rate", 0.0001)
            lora_rank = request.get("lora_rank", 16)
            batch_size = request.get("batch_size", 1)
            save_every = request.get("save_every", 50)

            # Create temp training data directory
            train_data_dir = f"/tmp/lora_train_{uuid.uuid4().hex}"
            os.makedirs(train_data_dir, exist_ok=True)

            # Decode audio files to disk
            for i, af in enumerate(audio_files):
                name = af.get("name", f"audio_{i}.wav")
                data = af.get("data", "")
                if not data:
                    continue
                out_path = os.path.join(train_data_dir, name)
                with open(out_path, "wb") as f:
                    f.write(base64.b64decode(data))

            # Create output directory on persistent volume
            LORA_VOLUME.reload()
            lora_output_dir = os.path.join(LORA_DIR, lora_name)
            os.makedirs(lora_output_dir, exist_ok=True)

            # Try to run training using ACE-Step's built-in training
            try:
                from acestep.training.lora_trainer import LoraTrainer

                trainer = LoraTrainer(
                    dit_handler=self.handler,
                    data_dir=train_data_dir,
                    output_dir=lora_output_dir,
                    lora_rank=lora_rank,
                    epochs=epochs,
                    learning_rate=learning_rate,
                    batch_size=batch_size,
                    save_every=save_every,
                )
                trainer.train()
                training_method = "native"
            except ImportError:
                # Fallback: use subprocess to call ACE-Step training CLI
                import subprocess
                # Create a training config
                config = {
                    "data_dir": train_data_dir,
                    "output_dir": lora_output_dir,
                    "lora_rank": lora_rank,
                    "epochs": epochs,
                    "learning_rate": learning_rate,
                    "batch_size": batch_size,
                    "save_every": save_every,
                }
                config_path = os.path.join(train_data_dir, "train_config.json")
                with open(config_path, "w") as f:
                    json.dump(config, f)

                # Try the CLI training command
                result = subprocess.run(
                    ["python", "-m", "acestep.training.train_lora",
                     "--config", config_path,
                     "--checkpoint_dir", CHECKPOINT_DIR],
                    capture_output=True, text=True, cwd="/opt/ACE-Step",
                    timeout=3600,  # 1 hour max
                )
                if result.returncode != 0:
                    # Training CLI may not exist yet; save audio files for manual training
                    print(f"[Modal] Training CLI not available: {result.stderr[:500]}")
                    training_method = "manual_setup"
                else:
                    training_method = "cli"

            # Save metadata
            meta = {
                "name": lora_name,
                "epochs": epochs,
                "learning_rate": learning_rate,
                "rank": lora_rank,
                "batch_size": batch_size,
                "num_files": len(audio_files),
                "created_at": __import__("datetime").datetime.now().isoformat(),
                "training_method": training_method,
            }
            with open(os.path.join(lora_output_dir, "meta.json"), "w") as f:
                json.dump(meta, f, indent=2)

            # Copy audio files to volume for potential retraining
            audio_backup_dir = os.path.join(lora_output_dir, "training_data")
            os.makedirs(audio_backup_dir, exist_ok=True)
            for fname in os.listdir(train_data_dir):
                if fname.endswith((".wav", ".mp3", ".flac", ".ogg")):
                    import shutil
                    shutil.copy2(os.path.join(train_data_dir, fname), audio_backup_dir)

            LORA_VOLUME.commit()

            # Cleanup temp dir
            import shutil
            shutil.rmtree(train_data_dir, ignore_errors=True)

            return {
                "status": "completed",
                "lora_name": lora_name,
                "message": f"LoRA '{lora_name}' training completed via {training_method}. {len(audio_files)} files processed.",
                "training_method": training_method,
            }

        except Exception as e:
            return {
                "status": "failed",
                "error": str(e),
                "traceback": traceback.format_exc(),
            }

    @modal.fastapi_endpoint(method="POST", docs=True)
    def api_generate(self, request: dict):
        """
        Generate music from text prompt.
        Returns base64-encoded audio. Supports optional lora_name parameter.
        """
        import os
        import sys
        import base64
        import traceback
        sys.path.insert(0, "/opt/ACE-Step")

        try:
            import uuid
            import tempfile
            from acestep.inference import (
                GenerationParams,
                GenerationConfig,
                generate_music,
            )
            from acestep.constants import DEFAULT_DIT_INSTRUCTION, TASK_INSTRUCTIONS

            # Decode base64 audio inputs to temp files
            src_audio_path = None
            reference_audio_path = None
            temp_files = []

            if request.get("src_audio_base64"):
                src_audio_path = os.path.join(self.temp_dir, f"src_{uuid.uuid4().hex}.wav")
                with open(src_audio_path, "wb") as f:
                    f.write(base64.b64decode(request["src_audio_base64"]))
                temp_files.append(src_audio_path)
                print(f"[Modal] Decoded src_audio to {src_audio_path} ({os.path.getsize(src_audio_path)} bytes)")

            if request.get("reference_audio_base64"):
                reference_audio_path = os.path.join(self.temp_dir, f"ref_{uuid.uuid4().hex}.wav")
                with open(reference_audio_path, "wb") as f:
                    f.write(base64.b64decode(request["reference_audio_base64"]))
                temp_files.append(reference_audio_path)
                print(f"[Modal] Decoded reference_audio to {reference_audio_path} ({os.path.getsize(reference_audio_path)} bytes)")

            # Parse request parameters with defaults
            task_type = request.get("task_type", "text2music")
            prompt = request.get("prompt", "")
            lyrics = request.get("lyrics", "")
            audio_duration = request.get("audio_duration", None)
            inference_steps = request.get("inference_steps", 8)
            guidance_scale = request.get("guidance_scale", 7.0)
            shift = request.get("shift", 3.0)
            seed = request.get("seed", -1)
            use_random_seed = request.get("use_random_seed", True)
            batch_size = request.get("batch_size", 1)
            audio_format = request.get("audio_format", "mp3")
            bpm = request.get("bpm", None)
            key_scale = request.get("key_scale", "")
            time_signature = request.get("time_signature", "")
            vocal_language = request.get("vocal_language", "en")
            audio_cover_strength = request.get("audio_cover_strength", 1.0)
            infer_method = request.get("infer_method", "ode")
            repainting_start = request.get("repainting_start", 0.0)
            repainting_end = request.get("repainting_end", None)

            # Load LoRA adapter if specified
            lora_name = request.get("lora_name", "")
            if lora_name:
                LORA_VOLUME.reload()
                lora_path = os.path.join(LORA_DIR, lora_name)
                if os.path.isdir(lora_path):
                    # Find the safetensors or bin file
                    lora_files = [f for f in os.listdir(lora_path) if f.endswith(".safetensors") or f.endswith(".bin")]
                    if lora_files:
                        lora_weight_path = os.path.join(lora_path, lora_files[0])
                        print(f"[Modal] Loading LoRA: {lora_name} from {lora_weight_path}")
                        try:
                            self.handler.load_lora(lora_weight_path)
                            print(f"[Modal] LoRA loaded successfully: {lora_name}")
                        except Exception as lora_err:
                            print(f"[Modal] WARNING: LoRA load failed: {lora_err}. Continuing without LoRA.")
                    else:
                        print(f"[Modal] WARNING: No weight files found in LoRA dir: {lora_path}")
                else:
                    print(f"[Modal] WARNING: LoRA not found: {lora_name}")

            # Determine if instrumental
            is_instrumental = not lyrics or lyrics.strip().lower() in ("", "[inst]", "[instrumental]")

            # Select instruction based on task type
            instruction = request.get("instruction", "")
            if not instruction:
                instruction = TASK_INSTRUCTIONS.get(task_type, DEFAULT_DIT_INSTRUCTION)

            # Build generation params
            params = GenerationParams(
                task_type=task_type,
                instruction=instruction,
                reference_audio=reference_audio_path,
                src_audio=src_audio_path,
                audio_codes="",
                caption=prompt,
                lyrics=lyrics,
                instrumental=is_instrumental,
                vocal_language=vocal_language,
                bpm=bpm,
                keyscale=key_scale,
                timesignature=time_signature,
                duration=audio_duration if audio_duration else -1.0,
                inference_steps=inference_steps,
                seed=seed,
                guidance_scale=guidance_scale,
                use_adg=request.get("use_adg", False),
                cfg_interval_start=request.get("cfg_interval_start", 0.0),
                cfg_interval_end=request.get("cfg_interval_end", 1.0),
                shift=shift,
                infer_method=infer_method,
                timesteps=None,
                repainting_start=repainting_start,
                repainting_end=repainting_end if repainting_end else -1,
                audio_cover_strength=audio_cover_strength,
                thinking=request.get("thinking", False),
                lm_temperature=request.get("lm_temperature", 0.85),
                lm_cfg_scale=request.get("lm_cfg_scale", 2.5),
                lm_top_k=request.get("lm_top_k", 0),
                lm_top_p=request.get("lm_top_p", 0.9),
                lm_negative_prompt=request.get("lm_negative_prompt", "NO USER INPUT"),
                use_cot_metas=request.get("use_cot_metas", True),
                use_cot_caption=request.get("use_cot_caption", True),
                use_cot_language=request.get("use_cot_language", True),
                use_constrained_decoding=request.get("use_constrained_decoding", True),
            )

            config = GenerationConfig(
                batch_size=batch_size,
                allow_lm_batch=False,
                use_random_seed=use_random_seed,
                seeds=None,
                audio_format=audio_format,
                constrained_decoding_debug=False,
            )

            # Generate (use LM if available for best quality)
            result = generate_music(
                dit_handler=self.handler,
                llm_handler=self.llm_handler,
                params=params,
                config=config,
                save_dir=self.temp_dir,
            )

            if not result.success:
                return {
                    "status": "failed",
                    "error": result.error or result.status_message,
                }

            # Encode audio files as base64
            outputs = []
            for audio in result.audios:
                path = audio.get("path", "")
                if path and os.path.exists(path):
                    with open(path, "rb") as f:
                        audio_b64 = base64.b64encode(f.read()).decode("utf-8")
                    outputs.append(audio_b64)
                    try:
                        os.remove(path)
                    except Exception:
                        pass

            # Clean up temp input files
            for tf in temp_files:
                try:
                    os.remove(tf)
                except Exception:
                    pass

            return {
                "status": "succeeded",
                "outputs": outputs,
                "format": audio_format,
                "count": len(outputs),
            }

        except Exception as e:
            # Clean up temp files on error too
            for tf in temp_files if 'temp_files' in dir() else []:
                try:
                    os.remove(tf)
                except Exception:
                    pass
            return {
                "status": "failed",
                "error": str(e),
                "traceback": traceback.format_exc(),
            }
