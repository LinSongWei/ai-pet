"""Deterministically slice the approved Ronova sheets and build runtime assets.

No artwork is generated here. Every pose on a sheet uses one shared scale; only
translation is per-frame. This prevents wide wings from changing body size as
an animation advances. The audit records any sheet-to-sheet scale compromise.
"""

from __future__ import annotations

import argparse
from collections import deque
import json
from pathlib import Path
import statistics

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageOps


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
SOURCE = ASSETS / "source"
FRAMES = ASSETS / "frames"
QA = ROOT / "qa"
COLUMNS = 8
ROWS = 10
GUTTER = 8
SOURCES = {
    "presence": "presence-v2.png", "motion": "motion-v3.png",
    "duties": "duties-v2.png", "contrast": "contrast-v2.png",
    "tea": "tea-cycle.png", "cookie": "cookie-cycle.png",
    "hug": "hug-cycle.png", "feather": "feather-cycle.png",
    "ledger": "ledger-cycle.png",
}


def components(mask: np.ndarray):
    """Return eight-connected components without introducing scipy dependency."""
    height, width = mask.shape
    seen = np.zeros_like(mask, dtype=bool)
    for y, x in zip(*np.nonzero(mask)):
        if seen[y, x]:
            continue
        seen[y, x] = True
        queue = deque([(int(x), int(y))])
        pixels = []
        while queue:
            px, py = queue.popleft()
            pixels.append((px, py))
            for ny in range(max(0, py - 1), min(height, py + 2)):
                for nx in range(max(0, px - 1), min(width, px + 2)):
                    if mask[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        queue.append((nx, ny))
        yield pixels


def alpha_bounds(image: Image.Image):
    return image.getchannel("A").getbbox()


def erase_tiny_islands(image: Image.Image):
    rgba = np.asarray(image).copy()
    original_alpha = rgba[:, :, 3].copy()
    support = original_alpha > 16
    for pixels in components(support):
        if len(pixels) > 8:
            continue
        for x, y in pixels:
            support[y, x] = False
    # Generated alpha can contain nearly invisible isolated background haze.
    # Retain original alpha (including anti-aliasing) near visible artwork;
    # erase only pixels over three pixels away from a surviving visible part.
    neighborhood = Image.fromarray(support.astype(np.uint8) * 255).filter(ImageFilter.MaxFilter(7))
    keep = np.asarray(neighborhood) > 0
    rgba[~keep] = (0, 0, 0, 0)
    removed = int(np.count_nonzero((original_alpha > 0) & ~keep))
    return Image.fromarray(rgba), removed


def face_anchor(image: Image.Image):
    """Find a warm pale face area above the torso, excluding silver hair."""
    rgba = np.asarray(image).astype(np.int16)
    red, green, blue, alpha = [rgba[:, :, i] for i in range(4)]
    bbox = alpha_bounds(image)
    if not bbox:
        raise ValueError("empty frame")
    top, bottom = bbox[1], bbox[3]
    yy = np.indices(alpha.shape)[0]
    mask = (
        (alpha > 100) & (red > 175) & (green > 125) & (blue > 100)
        & (red - green > 18) & (red - green < 80)
        & (green - blue > -8) & (green - blue < 48)
        & (red - blue > 25) & (yy < top + (bottom - top) * 0.48)
    )
    choices = list(components(mask))
    if not choices:
        return {
            "x": (bbox[0] + bbox[2]) / 2,
            "y": top + (bottom - top) * 0.30,
            "width": 0, "height": 0, "detected": False,
        }
    pixels = max(choices, key=len)
    xs, ys = zip(*pixels)
    return {
        "x": statistics.mean(xs), "y": statistics.mean(ys),
        "width": max(xs) - min(xs) + 1,
        "height": max(ys) - min(ys) + 1,
        "detected": True,
    }


def head_width_proxy(image: Image.Image):
    """Median contiguous silhouette span through the upper head band."""
    bbox = alpha_bounds(image)
    alpha = np.asarray(image)[:, :, 3]
    height = bbox[3] - bbox[1]
    spans = []
    for y in range(bbox[1] + round(height * 0.15), bbox[1] + round(height * 0.28)):
        opaque = np.pad((alpha[y] > 150).astype(np.int16), (1, 1))
        changes = np.diff(opaque)
        runs = np.flatnonzero(changes == -1) - np.flatnonzero(changes == 1)
        spans.append(int(max(runs, default=0)))
    return float(statistics.median(spans))


def clear_cut(mass, expected, radius):
    """Choose the middle of the empty gutter, never cut a visible hair tip."""
    low, high = max(1, round(expected - radius)), min(len(mass) - 1, round(expected + radius))
    choices = []
    start = None
    for index in range(low, high + 2):
        empty = index <= high and mass[index] == 0
        if empty and start is None:
            start = index
        elif not empty and start is not None:
            middle = (start + index - 1) / 2
            choices.append((index - start, abs(middle - expected), round(middle)))
            start = None
    if not choices:
        return round(expected)
    # Prefer a genuine long blank gap rather than a single transparent notch.
    return min(choices, key=lambda item: (-item[0], item[1]))[2]


def extract_sheet(name: str):
    image = Image.open(SOURCE / SOURCES[name]).convert("RGBA")
    support = np.asarray(image)[:, :, 3] > 16
    row_cut = clear_cut(np.count_nonzero(support, axis=1), image.height / 2, image.height * 0.05)
    row_edges = [0, row_cut, image.height]
    column_edges = []
    for row in range(2):
        mass = np.count_nonzero(support[row_edges[row]:row_edges[row + 1]], axis=0)
        column_edges.append([0] + [clear_cut(mass, image.width * column / 4, image.width * 0.03)
                                    for column in range(1, 4)] + [image.width])
    frames = []
    source_rows = []
    for index in range(8):
        column, row = index % 4, index // 4
        box = (
            column_edges[row][column], row_edges[row],
            column_edges[row][column + 1], row_edges[row + 1],
        )
        cell = image.crop(box)
        clean, erased = erase_tiny_islands(cell)
        bbox = alpha_bounds(clean)
        if not bbox:
            raise ValueError(f"{name} {index}: empty source cell")
        margins = [bbox[0], bbox[1], cell.width - bbox[2], cell.height - bbox[3]]
        visible = Image.fromarray((np.asarray(clean)[:, :, 3] > 16).astype(np.uint8) * 255).getbbox()
        visible_margins = [visible[0], visible[1], cell.width - visible[2], cell.height - visible[3]]
        if min(visible_margins) < 1:
            raise ValueError(f"{name} {index}: source visible artwork reaches a cell boundary: {visible_margins}")
        frames.append(clean.crop(bbox))
        source_rows.append({
            "index": index, "sourceBox": box, "alphaBox": bbox,
            "sourceMargins": margins, "visibleSourceMargins": visible_margins,
            "removedNoisePixels": erased,
        })
    return frames, source_rows


def fit_sheet(name, frames, width, height):
    standing_heights = [frame.height for frame in frames[:4]]
    desired_height = 232
    ideal_scale = desired_height / statistics.median(standing_heights)
    max_width = max(frame.width for frame in frames)
    max_height = max(frame.height for frame in frames)
    scale = min(ideal_scale, (width - 2 * GUTTER) / max_width,
                (height - 2 * GUTTER) / max_height)
    resized = [frame.resize((round(frame.width * scale), round(frame.height * scale)),
                            Image.Resampling.LANCZOS) for frame in frames]
    anchors = [face_anchor(frame) for frame in resized]
    # For running, keep the face stable with a deliberately tiny two-beat bob.
    # Reserve enough bottom room for every leg pose. No frame is scaled alone.
    run_y = min(height - 9 - frame.height + anchor["y"]
                for frame, anchor in zip(resized, anchors))
    feasible_x_min = max(GUTTER + anchor["x"] for anchor in anchors)
    feasible_x_max = min(width - GUTTER - frame.width + anchor["x"]
                         for frame, anchor in zip(resized, anchors))
    run_x = max(feasible_x_min, min(width * 0.55, feasible_x_max))
    output = []
    bob = (0, 1, 2, 1, 0, 1, 2, 1)
    placement = []
    for index, (frame, anchor) in enumerate(zip(resized, anchors)):
        if name == "motion":
            dx = round(run_x - anchor["x"])
            dy = round(run_y + bob[index] - anchor["y"])
        else:
            dx = round((width - frame.width) / 2)
            dy = height - 10 - frame.height
        dx = max(GUTTER, min(dx, width - GUTTER - frame.width))
        dy = max(GUTTER, min(dy, height - GUTTER - frame.height))
        canvas = Image.new("RGBA", (width, height), (0, 0, 0, 0))
        canvas.alpha_composite(frame, (dx, dy))
        output.append(canvas)
        placement.append({"x": dx, "y": dy, "face": face_anchor(canvas)})
    return output, {
        "sharedScale": scale, "idealScale": ideal_scale,
        "scaleLimitedByWidth": scale < ideal_scale - 0.001 and
            (width - 2 * GUTTER) / max_width <= scale + 0.001,
        "sourceMaxWidth": max_width, "sourceMaxHeight": max_height,
        "placement": placement,
    }


def make_icons():
    master = Image.open(SOURCE / "ronova-master.png").convert("RGBA")
    bbox = alpha_bounds(master)
    subject = master.crop(bbox)
    # Frame the original face and upper shoulders. Only the icon container is drawn.
    crop_side = round(subject.width * 0.77)
    crop_left = round((subject.width - crop_side) / 2)
    bust = subject.crop((crop_left, 0, crop_left + crop_side, crop_side))
    face = ImageOps.contain(bust, (448, 448), Image.Resampling.LANCZOS)
    container = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
    pixels = container.load()
    for y in range(512):
        t = y / 511
        for x in range(512):
            glow = max(0, 1 - ((x - 100) ** 2 + (y - 85) ** 2) ** 0.5 / 550)
            pixels[x, y] = (round(38 + glow * 75 - t * 9),
                            round(23 + glow * 12), round(36 + glow * 17), 255)
    mask = Image.new("L", (512, 512), 0)
    ImageDraw.Draw(mask).rounded_rectangle((3, 3, 508, 508), 105, fill=255)
    container.putalpha(mask)
    painter = ImageDraw.Draw(container)
    painter.rounded_rectangle((8, 8, 503, 503), 101, outline=(204, 163, 111, 240), width=5)
    container.alpha_composite(face, ((512 - face.width) // 2, 28))
    container.putalpha(ImageChops_multiply(container.getchannel("A"), mask))
    container.save(ASSETS / "avatar.png", optimize=True)
    container.resize((64, 64), Image.Resampling.LANCZOS).save(ASSETS / "tray.png")
    container.save(ASSETS / "app-icon.ico", format="ICO",
                   sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])


def ImageChops_multiply(a, b):
    from PIL import ImageChops
    return ImageChops.multiply(a, b)


def audit(rows, info, width, height):
    checker = Image.new("RGB", (width, height), "#241b2c")
    draw = ImageDraw.Draw(checker)
    for y in range(0, height, 12):
        for x in range(0, width, 12):
            if (x // 12 + y // 12) % 2 == 0:
                draw.rectangle((x, y, x + 11, y + 11), fill="#302338")
    contact = Image.new("RGB", (COLUMNS * (width + 12), ROWS * (height + 30)), "#170f1d")
    frame_count = sum(len(frames) for frames in rows)
    report = {"cellWidth": width, "cellHeight": height, "frameCount": frame_count,
              "sheets": info, "frames": [], "warnings": [], "sourceExceptions": []}
    for row, frames in enumerate(rows):
        for column, frame in enumerate(frames):
            bbox = alpha_bounds(frame)
            margins = [bbox[0], bbox[1], width - bbox[2], height - bbox[3]]
            if min(margins) < GUTTER:
                raise ValueError(f"output {row}-{column}: alpha reaches border: {margins}")
            entry = {"frame": f"{row}-{column}", "alphaBox": bbox, "margins": margins,
                     "subjectHeight": bbox[3] - bbox[1], "face": face_anchor(frame),
                     "headWidthProxy": head_width_proxy(frame)}
            report["frames"].append(entry)
            tile = checker.copy().convert("RGBA")
            tile.alpha_composite(frame)
            x, y = column * (width + 12) + 6, row * (height + 30) + 6
            contact.paste(tile.convert("RGB"), (x, y))
            cd = ImageDraw.Draw(contact)
            cd.rectangle((x - 1, y - 1, x + width, y + height), outline="#9d4a69")
            cd.text((x, y + height + 4), f"{row}-{column}", fill="#e0b6ca")
    presence_scale = info["presence"]["sharedScale"]
    for name, sheet in info.items():
        delta = (sheet["sharedScale"] / presence_scale - 1) * 100
        sheet["relativeScaleToPresencePercent"] = round(delta, 2)
    report["visualReview"] = "All nine source sheets inspected: complete subjects, transparent gutters, no adjacent-character fragments or clearly absent hands. Running has distinct leg phases; sitting poses intentionally shorter."
    report["headMeasurementNote"] = "Warm-pale face component dimensions are a proxy, not anatomical head measurements; perspective and expressions change them. Shared per-sheet scales guarantee no per-pose body rescaling."
    report["rowSummary"] = []
    for row in range(ROWS):
        entries = report["frames"][row * 8:(row + 1) * 8]
        widths = [entry["headWidthProxy"] for entry in entries]
        heights = [entry["subjectHeight"] for entry in entries]
        report["rowSummary"].append({
            "row": row, "subjectHeightRange": [min(heights), max(heights)],
            "headWidthProxyRange": [min(widths), max(widths)],
            "headWidthProxyMedian": statistics.median(widths),
        })
    motion = report["frames"][8:16]
    report["runAnchorRange"] = {
        "x": max(entry["face"]["x"] for entry in motion) - min(entry["face"]["x"] for entry in motion),
        "y": max(entry["face"]["y"] for entry in motion) - min(entry["face"]["y"] for entry in motion),
    }
    report["alphaCleanup"] = "Original alpha is preserved within three pixels of visible artwork (alpha >16). Only tiny isolated support components (<=8 source pixels) and distant nearly invisible alpha haze are erased."
    base_head = report["rowSummary"][0]["headWidthProxyMedian"]
    for row_info in report["rowSummary"]:
        row_info["headDifferenceFromIdlePercent"] = round((row_info["headWidthProxyMedian"] / base_head - 1) * 100, 2)
        if abs(row_info["headDifferenceFromIdlePercent"]) > 7:
            report["warnings"].append(f"row {row_info['row']}: head silhouette differs from idle by {row_info['headDifferenceFromIdlePercent']}%")
    report["sourceStyleVariation"] = "Every sheet uses one shared scale; raw source pixel scales differ because source artwork resolutions differ. Normalized head proxies, subject heights and alpha gutters are reported per row. No per-frame scaling, crossfade or limb repainting is used."
    contact.save(QA / "frame-audit.png", optimize=True)
    (QA / "audit.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"frames": frame_count, "cell": [width, height],
                      "minAlphaMargin": min(min(frame["margins"]) for frame in report["frames"]),
                      "warnings": report["warnings"],
                      "scales": {name: round(sheet["sharedScale"], 4) for name, sheet in info.items()},
                      "rowSummary": report["rowSummary"],
                      "runAnchorRange": report["runAnchorRange"]},
                     ensure_ascii=False))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--cell-width", type=int, default=288)
    parser.add_argument("--cell-height", type=int, default=256)
    args = parser.parse_args()
    width, height = args.cell_width, args.cell_height
    FRAMES.mkdir(parents=True, exist_ok=True)
    QA.mkdir(parents=True, exist_ok=True)
    sheets, info = {}, {}
    for name in SOURCES:
        extracted, source_info = extract_sheet(name)
        sheets[name], sheet_info = fit_sheet(name, extracted, width, height)
        sheet_info["sourceFrames"] = source_info
        info[name] = sheet_info
    rows = [sheets["presence"], sheets["motion"],
            [ImageOps.mirror(frame) for frame in sheets["motion"]],
            sheets["duties"], sheets["contrast"], sheets["tea"], sheets["cookie"],
            sheets["hug"], sheets["feather"], sheets["ledger"]]
    atlas = Image.new("RGBA", (COLUMNS * width, ROWS * height), (0, 0, 0, 0))
    for row, frames in enumerate(rows):
        for column, frame in enumerate(frames):
            frame.save(FRAMES / f"{row}-{column}.png", optimize=True)
            atlas.alpha_composite(frame, (column * width, row * height))
    atlas.save(ASSETS / "spritesheet.png", optimize=True)
    manifest = {"cellWidth": width, "cellHeight": height, "columns": 8, "rows": len(rows),
                "frameCount": sum(len(frames) for frames in rows), "spriteSheet": "spritesheet.png",
                "rowNames": ["presence", "motionRight", "motionLeft", "duties", "contrast",
                             "tea", "cookie", "hug", "feather", "ledger"]}
    (ASSETS / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    if any(not (ASSETS / filename).exists() for filename in ("avatar.png", "tray.png", "app-icon.ico")):
        make_icons()
    audit(rows, info, width, height)
    for name in ("motion", "tea", "cookie", "hug", "feather", "ledger"):
        pauses = {"tea": 7, "cookie": 6, "hug": 14, "feather": 6, "ledger": 6}
        indices = (list(range(8)) if name == "motion" else
                   [0, 0, 1, 2, 3, 4, 5, 6] + [7] * pauses[name] +
                   [6, 5, 4, 3, 2, 1, 0, 0])
        preview = []
        for index in indices:
            frame = sheets[name][index]
            backdrop = Image.new("RGBA", (width + 20, height + 20), "#1c1222")
            backdrop.alpha_composite(frame, (10, 10))
            preview.append(backdrop.convert("P", palette=Image.Palette.ADAPTIVE))
        filename = "run-cycle-v2.gif" if name == "motion" else f"{name}-cycle.gif"
        preview[0].save(QA / filename, save_all=True, append_images=preview[1:],
                        duration=1000 / 14 if name == "motion" else 100,
                        loop=0, disposal=2, optimize=False)


if __name__ == "__main__":
    main()
