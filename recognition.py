#!/usr/bin/env python3
"""
recognition.py

Character Recognition Module
Part of the Night-Time Number Plate Recognition System.

Architecture:
- Custom PyTorch CNN + Transformer Model (CNNTransformerANPR):
    * CNN Backbone: Convolutional feature extraction layers downsampling plate images into visual token sequence.
    * Positional Encoding: Preserves left-to-right character sequence ordering.
    * Transformer Encoder: Multi-head self-attention layers to model spatial character dependencies.
    * CTC / Linear Sequence Projection Head.
- EasyOCR Fallback: Integrated for out-of-the-box high-fidelity zero-shot inference and rapid prototyping.
"""

import math
import re
import cv2
import numpy as np
from typing import Tuple, Optional, Dict

try:
    import torch
    import torch.nn as nn
    import torch.nn.functional as F
    TORCH_AVAILABLE = True
except ImportError:
    TORCH_AVAILABLE = False

try:
    import easyocr
    EASYOCR_AVAILABLE = True
except ImportError:
    EASYOCR_AVAILABLE = False


# Vocabulary: Blank (index 0 for CTC), digits 0-9, capital letters A-Z, hyphen
CHARS = ["<BLANK>"] + [str(d) for d in range(10)] + [chr(c) for c in range(ord('A'), ord('Z') + 1)] + ["-"]
CHAR2IDX = {c: i for i, c in enumerate(CHARS)}
IDX2CHAR = {i: c for i, c in enumerate(CHARS)}
NUM_CLASSES = len(CHARS)


if TORCH_AVAILABLE:
    class PositionalEncoding(nn.Module):
        """Standard sinusoidal positional encoding for 1D sequence tokens."""
        def __init__(self, d_model: int, max_len: int = 128):
            super().__init__()
            pe = torch.zeros(max_len, d_model)
            position = torch.arange(0, max_len, dtype=torch.float).unsqueeze(1)
            div_term = torch.exp(torch.arange(0, d_model, 2).float() * (-math.log(10000.0) / d_model))
            pe[:, 0::2] = torch.sin(position * div_term)
            pe[:, 1::2] = torch.cos(position * div_term)
            self.register_buffer('pe', pe.unsqueeze(0))

        def forward(self, x: torch.Tensor) -> torch.Tensor:
            # x is [B, T, D]
            seq_len = x.size(1)
            return x + self.pe[:, :seq_len]

    class CNNTransformerANPR(nn.Module):
        """
        Deep CNN + Transformer architecture for character recognition.
        Captures complex character correlations across license plate sequences.
        """
        def __init__(self, num_classes: int = NUM_CLASSES, d_model: int = 128, nhead: int = 4, num_layers: int = 2):
            super().__init__()
            # CNN Feature Extractor: Input [B, 1, 32, 128]
            self.cnn = nn.Sequential(
                nn.Conv2d(1, 32, kernel_size=3, stride=1, padding=1),
                nn.BatchNorm2d(32),
                nn.ReLU(inplace=True),
                nn.MaxPool2d(2, 2),  # [B, 32, 16, 64]

                nn.Conv2d(32, 64, kernel_size=3, stride=1, padding=1),
                nn.BatchNorm2d(64),
                nn.ReLU(inplace=True),
                nn.MaxPool2d(2, 2),  # [B, 64, 8, 32]

                nn.Conv2d(64, 128, kernel_size=3, stride=1, padding=1),
                nn.BatchNorm2d(128),
                nn.ReLU(inplace=True),
                nn.MaxPool2d((4, 1), (4, 1)),  # [B, 128, 2, 32]

                nn.Conv2d(128, d_model, kernel_size=3, stride=1, padding=1),
                nn.BatchNorm2d(d_model),
                nn.ReLU(inplace=True),
                nn.AdaptiveAvgPool2d((1, None))  # [B, d_model, 1, W_seq]
            )

            self.pos_encoder = PositionalEncoding(d_model=d_model)
            encoder_layer = nn.TransformerEncoderLayer(
                d_model=d_model,
                nhead=nhead,
                dim_feedforward=256,
                dropout=0.1,
                batch_first=True
            )
            self.transformer = nn.TransformerEncoder(encoder_layer, num_layers=num_layers)
            self.fc = nn.Linear(d_model, num_classes)

        def forward(self, x: torch.Tensor) -> torch.Tensor:
            # x shape: [B, 1, H=32, W=128]
            features = self.cnn(x)  # [B, d_model, 1, W_seq]
            features = features.squeeze(2).permute(0, 2, 1)  # [B, W_seq, d_model]
            features = self.pos_encoder(features)
            trans_out = self.transformer(features)  # [B, W_seq, d_model]
            logits = self.fc(trans_out)  # [B, W_seq, num_classes]
            return logits


_MODEL_INSTANCE: Optional['CNNTransformerANPR'] = None
_EASYOCR_READER = None


def get_transformer_model(device: str = "cpu") -> Optional['CNNTransformerANPR']:
    """Instantiate or return cached PyTorch CNN+Transformer model."""
    global _MODEL_INSTANCE
    if not TORCH_AVAILABLE:
        return None
    if _MODEL_INSTANCE is None:
        try:
            model = CNNTransformerANPR(num_classes=NUM_CLASSES)
            model.to(device)
            model.eval()
            _MODEL_INSTANCE = model
        except Exception:
            _MODEL_INSTANCE = None
    return _MODEL_INSTANCE


def get_easyocr_reader():
    """Instantiate or return cached EasyOCR reader."""
    global _EASYOCR_READER
    if not EASYOCR_AVAILABLE:
        return None
    if _EASYOCR_READER is None:
        try:
            _EASYOCR_READER = easyocr.Reader(['en'], gpu=False, verbose=False)
        except Exception:
            _EASYOCR_READER = None
    return _EASYOCR_READER


def preprocess_for_recognition(plate_crop: np.ndarray, target_h: int = 32, target_w: int = 128) -> np.ndarray:
    """Prepares rectified plate crop for CNN+Transformer input."""
    if plate_crop is None or plate_crop.size == 0:
        return np.zeros((target_h, target_w), dtype=np.uint8)

    gray = cv2.cvtColor(plate_crop, cv2.COLOR_BGR2GRAY) if len(plate_crop.shape) == 3 else plate_crop.copy()
    resized = cv2.resize(gray, (target_w, target_h), interpolation=cv2.INTER_CUBIC)
    return resized


def ctc_greedy_decode(logits: 'torch.Tensor') -> Tuple[str, float]:
    """Decodes raw character probability logits using CTC greedy decoding."""
    probs = F.softmax(logits, dim=-1)
    confidences, preds = torch.max(probs, dim=-1)

    preds = preds[0].cpu().numpy()
    confidences = confidences[0].cpu().numpy()

    decoded_chars = []
    char_confs = []
    prev = 0

    for p, conf in zip(preds, confidences):
        if p != 0 and p != prev:  # Ignore CTC blank (0) and consecutive duplicates
            char_str = IDX2CHAR.get(int(p), "")
            if char_str and char_str != "<BLANK>":
                decoded_chars.append(char_str)
                char_confs.append(float(conf))
        prev = p

    plate_str = "".join(decoded_chars)
    avg_conf = float(np.mean(char_confs)) if char_confs else 0.0
    return plate_str, avg_conf


def recognize_plate_easyocr(plate_crop: np.ndarray) -> Tuple[str, float]:
    """Recognizes characters using EasyOCR fallback."""
    reader = get_easyocr_reader()
    if reader is None or plate_crop is None or plate_crop.size == 0:
        return "", 0.0

    try:
        results = reader.readtext(
            plate_crop,
            allowlist='ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-',
            detail=1,
            paragraph=False
        )
        if not results:
            return "", 0.0

        candidates = []
        for bbox, text, conf in results:
            clean = "".join(ch for ch in text if ch.isalnum() or ch == '-').upper()
            if len(clean) >= 2:
                candidates.append((clean, float(conf)))

        if candidates:
            # Sort by text length and confidence
            candidates.sort(key=lambda c: (len(c[0]), c[1]), reverse=True)
            return candidates[0][0], candidates[0][1]
    except Exception:
        pass

    return "", 0.0


def recognize_characters(
    plate_crop: np.ndarray,
    prefer_transformer: bool = True,
    use_easyocr_fallback: bool = True
) -> Dict:
    """
    Unified character recognition inference function:
    1. Runs custom PyTorch CNN+Transformer architecture.
    2. Falls back to EasyOCR if transformer confidence is low or weights are untrained.
    """
    if plate_crop is None or plate_crop.size == 0:
        return {"text": "", "confidence": 0.0, "method": "none"}

    # Attempt 1: EasyOCR or Transformer
    text = ""
    conf = 0.0
    method = "none"

    if prefer_transformer and TORCH_AVAILABLE:
        model = get_transformer_model()
        if model is not None:
            try:
                norm_img = preprocess_for_recognition(plate_crop)
                tensor_in = torch.from_numpy(norm_img).float().unsqueeze(0).unsqueeze(0) / 255.0
                with torch.no_grad():
                    logits = model(tensor_in)
                    pred_text, pred_conf = ctc_greedy_decode(logits)
                    if len(pred_text) >= 4 and pred_conf >= 0.40:
                        text = pred_text
                        conf = pred_conf
                        method = "CNN+Transformer"
            except Exception:
                pass

    # Fallback to EasyOCR for rapid prototyping & high zero-shot accuracy
    if (not text or conf < 0.40) and use_easyocr_fallback and EASYOCR_AVAILABLE:
        easy_text, easy_conf = recognize_plate_easyocr(plate_crop)
        if easy_text and (len(easy_text) > len(text) or easy_conf > conf):
            text = easy_text
            conf = easy_conf
            method = "EasyOCR (Fallback)"

    return {
        "text": text,
        "confidence": round(float(conf), 3),
        "method": method
    }


if __name__ == "__main__":
    print("[RECOGNITION] Testing character recognition module...")
    test_plate = np.full((60, 240, 3), 245, dtype=np.uint8)
    cv2.putText(test_plate, "GJ01AB1234", (15, 42), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (10, 10, 10), 2)
    res = recognize_characters(test_plate)
    print(f"[RECOGNITION] Result: Text='{res['text']}', Conf={res['confidence']}, Method='{res['method']}'")
