"""Whole-Moon hillshade for the Moon view (D60): LOLA LDEM_16 (16 px/deg) -> basemaps/globe.png.

Needs only data/raw/globe/ldem_16.img and its label (`make data-download`); writes the PNG and the
`globe` entry of basemap.json. The south polar cap is drawn from pole.png and the region maps on top.
"""

import re
import time
from pathlib import Path

import numpy as np

from horizonwalk import export

ROOT = Path(__file__).resolve().parents[2]
RAW, OUT = ROOT / "data" / "raw" / "globe", ROOT / "web" / "public" / "data"


def label(text: str, key: str) -> str:
    m = re.search(rf"^\s*{key}\s*=\s*\"?([^\"\s<]+)", text, re.MULTILINE)
    assert m, key
    return m.group(1)


def main() -> None:
    t0 = time.time()
    lbl = (RAW / "ldem_16.lbl").read_text()
    lines, samples = int(label(lbl, "LINES")), int(label(lbl, "LINE_SAMPLES"))
    scale, offset = float(label(lbl, "SCALING_FACTOR")), float(label(lbl, "OFFSET"))
    assert label(lbl, "SAMPLE_TYPE") == "LSB_INTEGER" and label(lbl, "SAMPLE_BITS") == "16"
    assert (
        float(label(lbl, "WESTERNMOST_LONGITUDE")) == 0
        and float(label(lbl, "MAXIMUM_LATITUDE")) == 90
    )
    assert (lines, samples) == (2880, 5760), "expected the 16 px/deg grid"
    dn = np.fromfile(RAW / "ldem_16.img", dtype="<i2").reshape(lines, samples)
    radius = dn.astype(np.float64) * scale + offset
    assert 1_725_000 < radius.min() and radius.max() < 1_750_000, "radius out of range"
    img = export.globe_hillshade(radius - offset)
    export.write_globe(OUT, img, "LOLA LDEM_16 (LRO-L-LOLA-4-GDR-V1.0, 16 px/deg)", synthetic=False)
    size = (OUT / "basemaps" / "globe.png").stat().st_size
    print(
        f"globe.png {img.shape[1]} x {img.shape[0]}, {size / 1e6:.2f} MB ({time.time() - t0:.0f} s)"
    )


if __name__ == "__main__":
    main()
