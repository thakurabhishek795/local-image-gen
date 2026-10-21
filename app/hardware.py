"""
hardware.py - Hardware detection, precision selection, and VRAM/RAM monitoring.
Supports NVIDIA CUDA, Apple Silicon MPS, and CPU backends.
"""

import gc
import logging
import platform
import psutil
import torch
from typing import Dict, Any, Optional

logger = logging.getLogger("hardware")


def detect_device(requested_device: Optional[str] = "auto") -> str:
    """
    Detect the most appropriate computing device.
    Options: 'auto', 'cuda', 'mps', 'cpu'.
    """
    if requested_device and requested_device.lower() != "auto":
        req = requested_device.lower()
        if req == "cuda" and not torch.cuda.is_available():
            logger.warning("CUDA requested but not available. Falling back to auto-detection.")
        elif req == "mps" and not (hasattr(torch.backends, "mps") and torch.backends.mps.is_available()):
            logger.warning("MPS requested but not available. Falling back to auto-detection.")
        else:
            return req

    if torch.cuda.is_available():
        return "cuda"
    elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def detect_dtype(device: str, requested_dtype: Optional[str] = "auto", model_type: str = "sd") -> torch.dtype:
    """
    Auto-select optimal torch precision based on device and model type.
    CUDA: bfloat16 (if supported) or float16; float32 for CPU.
    """
    if requested_dtype and requested_dtype.lower() != "auto":
        req = requested_dtype.lower()
        if req in ("bf16", "bfloat16"):
            return torch.bfloat16
        elif req in ("fp16", "float16"):
            return torch.float16
        elif req in ("fp32", "float32"):
            return torch.float32

    if device == "cuda":
        # FLUX models generally prefer bfloat16 on Ampere+ architectures
        if model_type == "flux" and torch.cuda.is_bf16_supported():
            return torch.bfloat16
        return torch.float16
    elif device == "mps":
        # Apple Silicon handles float16 smoothly in MPS diffusers
        return torch.float16
    else:
        # CPU requires float32 for full diffusers operation
        return torch.float32


def get_memory_info(device: str) -> Dict[str, Any]:
    """
    Query system RAM and GPU VRAM statistics.
    """
    sys_mem = psutil.virtual_memory()
    info: Dict[str, Any] = {
        "device": device,
        "platform": platform.platform(),
        "ram": {
            "total_gb": round(sys_mem.total / (1024 ** 3), 2),
            "used_gb": round(sys_mem.used / (1024 ** 3), 2),
            "available_gb": round(sys_mem.available / (1024 ** 3), 2),
            "percent": sys_mem.percent,
        },
        "vram": None,
    }

    if device == "cuda" and torch.cuda.is_available():
        try:
            device_idx = torch.cuda.current_device()
            total_bytes = torch.cuda.get_device_properties(device_idx).total_memory
            allocated_bytes = torch.cuda.memory_allocated(device_idx)
            reserved_bytes = torch.cuda.memory_reserved(device_idx)
            info["device_name"] = torch.cuda.get_device_name(device_idx)
            info["vram"] = {
                "total_gb": round(total_bytes / (1024 ** 3), 2),
                "allocated_gb": round(allocated_bytes / (1024 ** 3), 2),
                "reserved_gb": round(reserved_bytes / (1024 ** 3), 2),
                "free_gb": round((total_bytes - reserved_bytes) / (1024 ** 3), 2),
            }
        except Exception as e:
            logger.warning(f"Error reading CUDA memory stats: {e}")
    elif device == "mps":
        info["device_name"] = "Apple Silicon (MPS)"
        # MPS uses unified system memory
        info["vram"] = {
            "total_gb": info["ram"]["total_gb"],
            "allocated_gb": info["ram"]["used_gb"],
            "free_gb": info["ram"]["available_gb"],
            "note": "Unified Memory",
        }
    else:
        info["device_name"] = platform.processor() or "CPU"

    return info


def clear_memory(device: Optional[str] = None):
    """
    Trigger thorough garbage collection and flush GPU memory caches.
    """
    gc.collect()
    if device == "cuda" or (device is None and torch.cuda.is_available()):
        try:
            torch.cuda.empty_cache()
            torch.cuda.ipc_collect()
        except Exception as e:
            logger.debug(f"CUDA cache clear error: {e}")
    if device == "mps" or (device is None and hasattr(torch.backends, "mps") and torch.backends.mps.is_available()):
        try:
            if hasattr(torch.mps, "empty_cache"):
                torch.mps.empty_cache()
        except Exception as e:
            logger.debug(f"MPS cache clear error: {e}")
