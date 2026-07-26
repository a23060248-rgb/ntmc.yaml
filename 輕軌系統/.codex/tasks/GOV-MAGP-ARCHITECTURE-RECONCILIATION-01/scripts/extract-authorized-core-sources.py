from __future__ import annotations

import hashlib
import json
import unicodedata
from pathlib import Path

from pypdf import PdfReader


TASK_ROOT = Path(__file__).resolve().parent.parent
OUTPUT_ROOT = TASK_ROOT / "tmp" / "authorized-source-extraction"

CORE_SOURCES = [
    {
        "source_id": "SOURCE-MAGP-01",
        "path": Path(
            "C:/Users/a2306/Desktop/MAGP-Reference-Sources/"
            "113568079_詹士賢_基於Meta Agent架構之可信知識治理方法：藍圖驅動之健康管理AI知識工程設計.pdf"
        ),
        "bytes": 5438144,
        "sha256": "7D30007770AE467F0C99DB8EBA62B02C8773A53C20C90C716078630B5BEFE1D2",
    },
    {
        "source_id": "SOURCE-MAGP-02",
        "path": Path("C:/Users/a2306/Desktop/MAGP-Reference-Sources/從憲法到執行開始ai agent.pdf"),
        "bytes": 3392709,
        "sha256": "690F0F80DBC5C70416CA219F5AB53397D2A9C8514902CB9F57849CBA8AD2E7FB",
    },
    {
        "source_id": "SOURCE-MAGP-03",
        "path": Path("C:/Users/a2306/Desktop/MAGP-Reference-Sources/使用Codex去開發MAGP平台前置設計與策剠規劃.pdf"),
        "bytes": 14488543,
        "sha256": "ACC8E443FCAFA0D6C95E8AA04A9F88A932D23108F0C22574005FEAE3C9742BBE",
    },
    {
        "source_id": "SOURCE-MAGP-04",
        "path": Path("C:/Users/a2306/Desktop/MAGP-Reference-Sources/使用Codex開發MAGP平台 以軟體架構師的角度所做的規劃.pdf"),
        "bytes": 38190954,
        "sha256": "C05CEFCF9859182A03B04ADAEE0FBE94336298CAF690F2789ED8782375FEABDA",
    },
]


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def main() -> None:
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    summary = []
    for source in CORE_SOURCES:
        source_path = source["path"]
        actual_bytes = source_path.stat().st_size
        actual_sha256 = sha256_file(source_path)
        if actual_bytes != source["bytes"] or actual_sha256 != source["sha256"]:
            raise RuntimeError(f"SOURCE_HASH_BINDING_INVALID: {source['source_id']}")

        reader = PdfReader(str(source_path))
        pages = []
        for page_number, page in enumerate(reader.pages, start=1):
            text = unicodedata.normalize("NFC", page.extract_text() or "")
            pages.append(
                {
                    "page_number": page_number,
                    "character_count": len(text),
                    "text": text,
                }
            )

        record = {
            "schema_version": 1,
            "source_id": source["source_id"],
            "normalized_absolute_path": source_path.as_posix(),
            "source_sha256": actual_sha256,
            "source_bytes": actual_bytes,
            "extraction_method": "PYPDF_PAGE_AWARE_TEXT_EXTRACTION",
            "page_count": len(pages),
            "total_character_count": sum(page["character_count"] for page in pages),
            "pages": pages,
        }
        output_path = OUTPUT_ROOT / f"{source['source_id']}.json"
        output_path.write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        summary.append(
            {
                "source_id": source["source_id"],
                "page_count": record["page_count"],
                "total_character_count": record["total_character_count"],
                "output_path": output_path.as_posix(),
            }
        )

    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
