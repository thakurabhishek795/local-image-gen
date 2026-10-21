"""
generator.py - Abstract model loader, pipeline manager, and inference engine.
Decoupled from specific architectures; supports SD 1.5, SDXL, SDXL Turbo, and FLUX.
"""

import asyncio
import logging
import random
import time
import uuid
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, Optional

import torch
from PIL import Image

from app.config import MODEL_CATALOG, settings
from app.hardware import detect_device, detect_dtype, clear_memory, get_memory_info

logger = logging.getLogger("generator")


class ModelManager:
    """
    Thread-safe, singleton-like manager for dynamic loading, offloading,
    and inference execution across diffusers pipelines.
    """

    def __init__(self):
        self.current_model_key: Optional[str] = None
        self.pipeline: Any = None
        self.device: str = "cpu"
        self.dtype: torch.dtype = torch.float32
        self.lock = asyncio.Lock()
        self.is_loading: bool = False

    def get_status(self) -> Dict[str, Any]:
        """Returns the current state of the generator engine."""
        return {
            "current_model_key": self.current_model_key,
            "is_loaded": self.pipeline is not None,
            "is_loading": self.is_loading,
            "device": self.device,
            "dtype": str(self.dtype),
        }

    def unload(self):
        """Unload active pipeline and reclaim host RAM and device VRAM."""
        if self.pipeline is not None:
            logger.info(f"Unloading active model: {self.current_model_key}")
            # Safely release hooks if offloaded
            try:
                if hasattr(self.pipeline, "remove_all_hooks"):
                    self.pipeline.remove_all_hooks()
            except Exception as e:
                logger.debug(f"Error removing pipeline hooks: {e}")

            del self.pipeline
            self.pipeline = None

        self.current_model_key = None
        clear_memory(self.device)
        logger.info("Pipeline unloaded and memory cleared.")

    def _determine_offload_strategy(self, device: str) -> str:
        """Determines whether to apply CPU offloading based on configuration and VRAM."""
        cfg = settings.ENABLE_CPU_OFFLOAD.lower()
        if cfg in ("model", "sequential", "none"):
            return cfg

        # Auto strategy based on detected hardware
        if device == "cuda":
            mem_info = get_memory_info("cuda")
            vram = mem_info.get("vram")
            if vram and vram.get("total_gb", 0) > 0:
                total_vram = vram["total_gb"]
                if total_vram <= 6:
                    return "sequential"
                elif total_vram <= 11:
                    return "model"
                else:
                    return "none"
            return "model"
        return "none"

    def load_model(self, model_key: str):
        """
        Loads specified model by key into memory with optimal hardware safeguards.
        """
        if model_key not in MODEL_CATALOG:
            raise ValueError(f"Unknown model key '{model_key}'. Available: {list(MODEL_CATALOG.keys())}")

        if self.current_model_key == model_key and self.pipeline is not None:
            logger.info(f"Model '{model_key}' is already loaded.")
            return

        self.is_loading = True
        try:
            # Step 1: Unload existing model
            self.unload()

            model_meta = MODEL_CATALOG[model_key]
            repo_id = model_meta["repo_id"]
            family = model_meta["family"]

            # Step 2: Detect device and precision
            self.device = detect_device(settings.DEVICE)
            self.dtype = detect_dtype(self.device, settings.TORCH_DTYPE, model_type=family)

            logger.info(
                f"Loading '{model_meta['name']}' ({repo_id}) | "
                f"Device: {self.device} | Dtype: {self.dtype}"
            )

            # Lazy import of diffusers pipelines to keep startup fast
            from diffusers import AutoPipelineForText2Image

            pipeline_kwargs: Dict[str, Any] = {
                "torch_dtype": self.dtype,
            }

            if settings.HF_TOKEN:
                pipeline_kwargs["token"] = settings.HF_TOKEN

            # Step 3: Instantiate pipeline according to family
            if family == "flux":
                try:
                    from diffusers import FluxPipeline
                    self.pipeline = FluxPipeline.from_pretrained(repo_id, **pipeline_kwargs)
                except Exception as e:
                    logger.warning(f"FluxPipeline direct load failed: {e}. Falling back to AutoPipeline.")
                    self.pipeline = AutoPipelineForText2Image.from_pretrained(repo_id, **pipeline_kwargs)
            else:
                self.pipeline = AutoPipelineForText2Image.from_pretrained(repo_id, **pipeline_kwargs)

            # Step 4: Apply hardware placement and memory offload safeguards
            offload_strategy = self._determine_offload_strategy(self.device)
            logger.info(f"Memory offload strategy for {model_key}: {offload_strategy}")

            if offload_strategy == "sequential" and hasattr(self.pipeline, "enable_sequential_cpu_offload"):
                logger.info("Enabling sequential CPU offload...")
                self.pipeline.enable_sequential_cpu_offload()
            elif offload_strategy == "model" and hasattr(self.pipeline, "enable_model_cpu_offload"):
                logger.info("Enabling model CPU offload...")
                self.pipeline.enable_model_cpu_offload()
            else:
                logger.info(f"Placing model directly on device: {self.device}")
                self.pipeline.to(self.device)

            # Step 5: Apply attention & VAE optimizations
            if settings.ENABLE_ATTENTION_SLICING and hasattr(self.pipeline, "enable_attention_slicing"):
                try:
                    self.pipeline.enable_attention_slicing()
                    logger.info("Enabled attention slicing.")
                except Exception as e:
                    logger.debug(f"Attention slicing not applied: {e}")

            if settings.ENABLE_VAE_SLICING and hasattr(self.pipeline, "enable_vae_slicing"):
                try:
                    self.pipeline.enable_vae_slicing()
                    logger.info("Enabled VAE slicing.")
                except Exception as e:
                    logger.debug(f"VAE slicing not applied: {e}")

            if settings.ENABLE_VAE_TILING and hasattr(self.pipeline, "enable_vae_tiling"):
                try:
                    self.pipeline.enable_vae_tiling()
                    logger.info("Enabled VAE tiling.")
                except Exception as e:
                    logger.debug(f"VAE tiling not applied: {e}")

            self.current_model_key = model_key
            logger.info(f"Successfully loaded model: {model_key}")

        except Exception as err:
            logger.error(f"Failed to load model {model_key}: {err}", exc_info=True)
            self.unload()
            raise err
        finally:
            self.is_loading = False

    async def switch_model(self, model_key: str) -> Dict[str, Any]:
        """Async wrapper around model switching with mutex locking."""
        async with self.lock:
            start_t = time.perf_counter()
            # Run blocking model weights loading in thread pool
            loop = asyncio.get_running_loop()
            await loop.run_in_executor(None, self.load_model, model_key)
            duration = round(time.perf_counter() - start_t, 2)
            return {
                "status": "success",
                "active_model": model_key,
                "model_name": MODEL_CATALOG[model_key]["name"],
                "switch_time_seconds": duration,
            }

    def _sync_generate(
        self,
        prompt: str,
        negative_prompt: Optional[str],
        width: int,
        height: int,
        num_inference_steps: int,
        guidance_scale: float,
        seed: int,
    ) -> Dict[str, Any]:
        """Synchronous generation execution executed in thread pool."""
        if self.pipeline is None:
            raise RuntimeError("No model is currently loaded. Please load or switch to a model first.")

        model_meta = MODEL_CATALOG[self.current_model_key]
        family = model_meta["family"]

        # Ensure seed is valid
        if seed < 0:
            seed = random.randint(0, 2**32 - 1)

        # PyTorch MPS generator behaves most consistently on CPU
        gen_device = "cpu" if self.device in ("mps", "cpu") else "cuda"
        generator = torch.Generator(device=gen_device).manual_seed(seed)

        start_time = time.perf_counter()

        call_kwargs: Dict[str, Any] = {
            "prompt": prompt,
            "width": width,
            "height": height,
            "num_inference_steps": num_inference_steps,
            "generator": generator,
        }

        # Model-specific parameter handling
        if family == "flux":
            # FLUX does not support negative prompt and uses guidance_scale=0.0 by default
            call_kwargs["guidance_scale"] = guidance_scale if guidance_scale >= 0 else 0.0
            if "max_sequence_length" in self.pipeline.__call__.__code__.co_varnames:
                call_kwargs["max_sequence_length"] = 256
        elif self.current_model_key == "sdxl_turbo":
            # SDXL Turbo is a distilled single-step model; CFG 0.0 is optimal
            call_kwargs["guidance_scale"] = guidance_scale
            if negative_prompt and model_meta.get("supports_negative_prompt", False):
                call_kwargs["negative_prompt"] = negative_prompt
        else:
            call_kwargs["guidance_scale"] = guidance_scale
            if negative_prompt:
                call_kwargs["negative_prompt"] = negative_prompt

        try:
            logger.info(
                f"Generating image with {self.current_model_key} | "
                f"Steps: {num_inference_steps} | Res: {width}x{height} | Seed: {seed}"
            )
            result = self.pipeline(**call_kwargs)
            image: Image.Image = result.images[0]

            elapsed_seconds = round(time.perf_counter() - start_time, 2)

            # Save generated image to disk
            timestamp_str = datetime.now().strftime("%Y%m%d_%H%M%S")
            short_id = uuid.uuid4().hex[:8]
            filename = f"{timestamp_str}_{self.current_model_key}_{short_id}.png"
            file_path = settings.OUTPUT_DIR / filename
            image.save(file_path, format="PNG")

            return {
                "status": "success",
                "filename": filename,
                "url": f"/outputs/{filename}",
                "seed": seed,
                "prompt": prompt,
                "negative_prompt": negative_prompt or "",
                "width": width,
                "height": height,
                "num_inference_steps": num_inference_steps,
                "guidance_scale": guidance_scale,
                "model_key": self.current_model_key,
                "model_name": model_meta["name"],
                "generation_time_seconds": elapsed_seconds,
                "created_at": datetime.now().isoformat(),
            }

        except torch.cuda.OutOfMemoryError as oom:
            clear_memory(self.device)
            raise RuntimeError(
                f"GPU Out of Memory (OOM) during generation. Try lowering resolution, "
                f"steps, or enabling CPU offload: {oom}"
            ) from oom
        except Exception as e:
            clear_memory(self.device)
            raise e

    async def generate(
        self,
        prompt: str,
        negative_prompt: Optional[str] = None,
        width: int = 512,
        height: int = 512,
        num_inference_steps: int = 25,
        guidance_scale: float = 7.5,
        seed: int = -1,
    ) -> Dict[str, Any]:
        """Async entrypoint for inference requests, guarded by mutex lock."""
        async with self.lock:
            loop = asyncio.get_running_loop()
            return await loop.run_in_executor(
                None,
                self._sync_generate,
                prompt,
                negative_prompt,
                width,
                height,
                num_inference_steps,
                guidance_scale,
                seed,
            )


# Global singleton manager instance
engine = ModelManager()
