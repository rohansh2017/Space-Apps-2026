"""Yale Bright Star Catalogue (BSC5) reader: J2000 unit vectors in ICRF, V magnitude and B-V.

Byte layout (1-based, VizieR V/50 ReadMe): RA J2000 h 76-77, m 78-79, s 80-83; Dec sign 84, d 85-86,
m 87-88, s 89-90; Vmag 103-107; B-V 110-114. Fourteen retired entries have no position and are skipped.
"""

import gzip
from pathlib import Path

import numpy as np


def parse_line(line: str):
    """(x, y, z, vmag, b_v) or None. b_v is NaN when the catalogue gives none."""
    if not line[75:77].strip():
        return None
    ra = (int(line[75:77]) + int(line[77:79]) / 60 + float(line[79:83]) / 3600) * 15.0
    dec = int(line[84:86]) + int(line[86:88]) / 60 + int(line[88:90]) / 3600
    dec = -dec if line[83] == "-" else dec
    vmag = float(line[102:107])
    bv = float(line[109:114]) if line[109:114].strip() else float("nan")
    a, d = np.radians(ra), np.radians(dec)
    return (np.cos(d) * np.cos(a), np.cos(d) * np.sin(a), np.sin(d), vmag, bv)


def read(path: Path) -> np.ndarray:
    """All stars with a position, as an (N, 5) float array: x, y, z, vmag, b_v."""
    with gzip.open(path, "rt", encoding="latin-1") as f:
        rows = [r for r in map(parse_line, f) if r is not None]
    return np.array(rows, dtype=np.float64)
