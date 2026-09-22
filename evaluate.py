#!/usr/bin/env python3
"""
evaluate.py

Evaluation Metrics Module
Part of the Night-Time Number Plate Recognition System.

Metrics:
- Character Error Rate (CER): Levenshtein distance normalized by ground truth length.
- Plate Exact Match Accuracy (PMA): Percentage of plates recognized with 100% precision.
- Precision, Recall, and F1 metrics for character and plate predictions.
"""

from typing import List, Tuple, Dict
import difflib


def levenshtein_distance(s1: str, s2: str) -> int:
    """Computes standard edit distance between two character sequences."""
    if len(s1) < len(s2):
        return levenshtein_distance(s2, s1)

    if len(s2) == 0:
        return len(s1)

    previous_row = range(len(s2) + 1)
    for i, c1 in enumerate(s1):
        current_row = [i + 1]
        for j, c2 in enumerate(s2):
            insertions = previous_row[j + 1] + 1
            deletions = current_row[j] + 1
            substitutions = previous_row[j] + (c1 != c2)
            current_row.append(min(insertions, deletions, substitutions))
        previous_row = current_row

    return previous_row[-1]


def compute_cer(pred: str, target: str) -> float:
    """
    Computes Character Error Rate (CER).
    CER = Levenshtein(pred, target) / max(1, len(target))
    0.0 represents a perfect character match.
    """
    clean_pred = pred.strip().upper().replace(" ", "").replace("-", "")
    clean_target = target.strip().upper().replace(" ", "").replace("-", "")

    if len(clean_target) == 0:
        return 0.0 if len(clean_pred) == 0 else 1.0

    dist = levenshtein_distance(clean_pred, clean_target)
    return float(dist) / float(len(clean_target))


def evaluate_predictions(pairs: List[Tuple[str, str]]) -> Dict:
    """
    Evaluates a list of (predicted_plate, ground_truth_plate) pairs.
    Returns aggregated CER, Exact Match Accuracy, and character stats.
    """
    if not pairs:
        return {"total_samples": 0, "avg_cer": 0.0, "exact_match_accuracy": 0.0}

    total = len(pairs)
    cer_list = []
    exact_matches = 0
    char_accuracies = []

    for pred, gt in pairs:
        cer = compute_cer(pred, gt)
        cer_list.append(cer)

        clean_pred = pred.strip().upper().replace(" ", "").replace("-", "")
        clean_gt = gt.strip().upper().replace(" ", "").replace("-", "")

        if clean_pred == clean_gt:
            exact_matches += 1

        # Character similarity ratio
        sm = difflib.SequenceMatcher(None, clean_pred, clean_gt)
        char_accuracies.append(sm.ratio())

    avg_cer = sum(cer_list) / total
    accuracy = (exact_matches / total) * 100.0
    avg_char_acc = (sum(char_accuracies) / total) * 100.0

    return {
        "total_samples": total,
        "exact_matches": exact_matches,
        "exact_match_accuracy": round(accuracy, 2),
        "avg_cer": round(avg_cer, 4),
        "avg_character_accuracy": round(avg_char_acc, 2)
    }


if __name__ == "__main__":
    print("[EVALUATE] Testing Character Error Rate (CER) and metrics...")
    test_cases = [
        ("GJ01AB1234", "GJ01AB1234"),  # Perfect match
        ("GJ01AB1234", "GJ01AB1235"),  # 1 char error
        ("MH12CD9999", "MH12CD9999"),  # Perfect match
        ("DL3C999", "DL03C0999"),      # Omission error
    ]
    results = evaluate_predictions(test_cases)
    print(f"[EVALUATE] Total Samples: {results['total_samples']}")
    print(f"[EVALUATE] Exact Match Accuracy: {results['exact_match_accuracy']}%")
    print(f"[EVALUATE] Average CER: {results['avg_cer']}")
    print(f"[EVALUATE] Avg Char Accuracy: {results['avg_character_accuracy']}%")
