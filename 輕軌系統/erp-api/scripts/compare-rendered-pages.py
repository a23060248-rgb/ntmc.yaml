import argparse
import json
import re
from pathlib import Path

from PIL import Image, ImageChops, ImageStat


def page_number(path: Path) -> int:
    match = re.search(r"(\d+)$", path.stem)
    return int(match.group(1)) if match else 0


def compare_page(source_path: Path, target_path: Path, diff_path: Path) -> dict:
    with Image.open(source_path) as source_image, Image.open(target_path) as target_image:
        source = source_image.convert("RGB")
        target = target_image.convert("RGB")
        result = {
            "page": page_number(source_path),
            "sourceSize": list(source.size),
            "targetSize": list(target.size),
            "sameSize": source.size == target.size,
        }

        if source.size != target.size:
            result.update({"changedPixels": None, "changedRatio": None, "meanAbsoluteDifference": None})
            return result

        difference = ImageChops.difference(source, target)
        red, green, blue = difference.split()
        changed_mask = ImageChops.lighter(ImageChops.lighter(red, green), blue)
        histogram = changed_mask.histogram()
        total_pixels = source.width * source.height
        changed_pixels = total_pixels - histogram[0]
        mean_difference = sum(ImageStat.Stat(difference).mean) / 3

        amplified = difference.point(lambda value: min(255, value * 4))
        amplified.save(diff_path)

        result.update(
            {
                "changedPixels": changed_pixels,
                "changedRatio": changed_pixels / total_pixels,
                "meanAbsoluteDifference": mean_difference,
                "differenceBounds": list(difference.getbbox()) if difference.getbbox() else None,
                "diffImage": str(diff_path),
            }
        )
        return result


def main() -> None:
    parser = argparse.ArgumentParser(description="Compare two rendered Word/PDF page directories.")
    parser.add_argument("source_dir", type=Path)
    parser.add_argument("target_dir", type=Path)
    parser.add_argument("output_dir", type=Path)
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()

    source_pages = sorted(args.source_dir.glob("*.png"), key=page_number)
    target_pages = sorted(args.target_dir.glob("*.png"), key=page_number)
    if not source_pages or len(source_pages) != len(target_pages):
        raise SystemExit(
            f"Rendered page count mismatch: source={len(source_pages)}, target={len(target_pages)}"
        )

    args.output_dir.mkdir(parents=True, exist_ok=True)
    pages = []
    for source_path, target_path in zip(source_pages, target_pages, strict=True):
        diff_path = args.output_dir / f"diff-page-{page_number(source_path):02d}.png"
        pages.append(compare_page(source_path, target_path, diff_path))

    report = {
        "sourcePageCount": len(source_pages),
        "targetPageCount": len(target_pages),
        "allSameSize": all(page["sameSize"] for page in pages),
        "allPixelIdentical": all(page["changedPixels"] == 0 for page in pages),
        "pages": pages,
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
