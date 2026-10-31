import hashlib
from dataclasses import dataclass, field

@dataclass
class PreviewRow:
    row_index: int
    data: dict
    errors: list[str] = field(default_factory=list)
    is_duplicate: bool = False

@dataclass
class PreviewResult:
    file_hash: str
    rows: list[PreviewRow]
    total_errors: int

def parse_csv(content: bytes) -> PreviewResult:
    raise NotImplementedError

def commit_rows(selected_rows: list[PreviewRow]) -> list[str]:
    raise NotImplementedError
