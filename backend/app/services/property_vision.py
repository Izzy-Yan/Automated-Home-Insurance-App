
import base64
import io
import json
import os
from pathlib import Path

import cv2
from PIL import Image, ImageOps

FIELDS = {
    "number_of_stories": "Number of visible stories",
    "exterior_wall_type": "Exterior wall material",
    "roof_type": "Roof covering material",
    "foundation_type": "Visible foundation type",
    "flooring_type": "Interior flooring material",
    "countertop_material": "Countertop material",
    "hvac_type": "Visible HVAC equipment type",
    "water_heater_type": "Visible water heater type",
    "electrical_service": "Visible electrical service rating",
}

UPLOAD_DIR = Path(__file__).resolve().parents[2] / "uploads"


def prepare_image(data: bytes) -> str:
    """Normalize an image and return a JPEG data URL."""
    with Image.open(io.BytesIO(data)) as original:
        image = ImageOps.exif_transpose(original).convert("RGB")
        image.thumbnail((1280, 1280))

        output = io.BytesIO()
        image.save(output, format="JPEG", quality=80)

    encoded = base64.b64encode(output.getvalue()).decode("ascii")
    return f"data:image/jpeg;base64,{encoded}"


def read_photo(path: Path) -> list[str]:
    return [prepare_image(path.read_bytes())]


def read_video(path: Path) -> list[str]:
    """Sample up to six frames distributed across a video."""
    capture = cv2.VideoCapture(str(path))

    if not capture.isOpened():
        capture.release()
        raise ValueError("Unable to decode video")

    try:
        fps = capture.get(cv2.CAP_PROP_FPS)
        count = capture.get(cv2.CAP_PROP_FRAME_COUNT)

        if fps <= 0 or count <= 0:
            raise ValueError("Invalid video duration")

        duration = count / fps
        samples = min(6, max(1, int(duration // 5) + 1))
        images = []

        for index in range(samples):
            timestamp = duration * (index + 0.5) / samples
            capture.set(cv2.CAP_PROP_POS_MSEC, timestamp * 1000)

            success, frame = capture.read()
            if not success:
                continue

            success, encoded = cv2.imencode(".jpg", frame)
            if success:
                images.append(prepare_image(encoded.tobytes()))

        if not images:
            raise ValueError("No usable frames found")

        return images
    finally:
        capture.release()


def get_evidence_images(storage_key: str, evidence_type: str):
    """Resolve evidence only from the managed upload directory."""
    if not storage_key.startswith("uploads/"):
        raise ValueError("Unsupported evidence location")

    relative = storage_key.removeprefix("uploads/")
    path = (UPLOAD_DIR / relative).resolve()

    if not path.is_relative_to(UPLOAD_DIR.resolve()):
        raise ValueError("Invalid evidence path")

    if not path.is_file():
        raise FileNotFoundError("Evidence file does not exist")

    if evidence_type == "photo":
        return read_photo(path)

    if evidence_type == "video":
        return read_video(path)

    return []


def analyze_images(images: list[str]) -> list[dict]:
    """
    Analyze images when an API key is configured.
    Return [] in mock mode.

    Every returned finding is a candidate for human review.
    """
    api_key = os.getenv("OPENAI_API_KEY")

    if not api_key:
        return []

    from openai import OpenAI

    client = OpenAI(api_key=api_key, timeout=120.0)

    instructions = """
You are analyzing property photos for an insurance inspection.

Identify only features that are directly supported by the images.
Do not guess hidden property characteristics, dimensions, ages,
installation dates, or electrical ratings.

Use ONLY these field keys:
""" + json.dumps(FIELDS) + """

Return one JSON object with a "findings" array.

Each finding must have:
- field_key: one of the allowed keys
- value: short, specific observation
- confidence: number between 0 and 1
- explanation: short description of visible supporting evidence

Omit any field that cannot be visually determined.
Do not use "unknown" as a finding.
Do not make insurance underwriting decisions.
Return JSON only.
"""

    content = [
        {"type": "text", "text": instructions},
    ]

    for image in images:
        content.append({
            "type": "image_url",
            "image_url": {
                "url": image,
                "detail": "low",
            },
        })

    response = client.chat.completions.create(
        model=os.getenv("OPENAI_VISION_MODEL", "gpt-4.1-mini"),
        messages=[
            {
                "role": "user",
                "content": content,
            }
        ],
        response_format={"type": "json_object"},
        temperature=0,
    )

    raw = response.choices[0].message.content
    parsed = json.loads(raw or "{}")

    validated = []

    for finding in parsed.get("findings", []):
        if not isinstance(finding, dict):
            continue

        key = finding.get("field_key")
        value = finding.get("value")
        confidence = finding.get("confidence")

        if key not in FIELDS:
            continue

        if not isinstance(value, str) or not value.strip():
            continue

        if not isinstance(confidence, (int, float)):
            continue

        validated.append({
            "field_key": key,
            "value": value.strip()[:1000],
            "confidence": max(0.0, min(1.0, float(confidence))),
            "explanation": str(
                finding.get("explanation", "")
            )[:1000],
        })

    return validated
