import base64
import re
from typing import Dict, Tuple, Optional


def slugify(value: str) -> str:
    s = (value or "").lower()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")


def initials_from_name(name: str) -> str:
    if not name:
        return "?"
    parts = [p for p in re.split(r"\s+", name.strip()) if p]
    if not parts:
        return "?"
    if len(parts) == 1:
        return parts[0][:2].upper()
    return (parts[0][0] + parts[-1][0]).upper()


def _hsl_to_hex(h: float, s: float, l: float) -> str:
    # Convert HSL (0-360, 0-1, 0-1) to HEX string
    c = (1 - abs(2 * l - 1)) * s
    x = c * (1 - abs((h / 60.0) % 2 - 1))
    m = l - c / 2
    r = g = b = 0
    if 0 <= h < 60:
        r, g, b = c, x, 0
    elif 60 <= h < 120:
        r, g, b = x, c, 0
    elif 120 <= h < 180:
        r, g, b = 0, c, x
    elif 180 <= h < 240:
        r, g, b = 0, x, c
    elif 240 <= h < 300:
        r, g, b = x, 0, c
    else:
        r, g, b = c, 0, x
    r, g, b = [int((v + m) * 255) for v in (r, g, b)]
    return f"#{r:02x}{g:02x}{b:02x}"


def unique_colors(seed: str) -> Tuple[str, str]:
    # Deterministic hues from seed
    h1 = sum(ord(c) for c in seed) % 360
    h2 = (h1 + 137) % 360
    c1 = _hsl_to_hex(h1, 0.65, 0.55)
    c2 = _hsl_to_hex(h2, 0.65, 0.55)
    return c1, c2


def svg_avatar_data_uri(name: str, seed: Optional[str] = None) -> str:
    seed = seed or name or "persona"
    c1, c2 = unique_colors(seed)
    initials = initials_from_name(name)
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="{c1}"/>
      <stop offset="100%" stop-color="{c2}"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#g)"/>
  <circle cx="96" cy="96" r="88" fill="rgba(0,0,0,0.12)"/>
  <text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle"
        font-family="system-ui,Segoe UI,Roboto" font-size="72" font-weight="700" fill="#ffffff" opacity="0.95">{initials}</text>
</svg>'''
    b64 = base64.b64encode(svg.encode("utf-8")).decode("ascii")
    return f"data:image/svg+xml;base64,{b64}"


def find_persona_index(results: Dict, persona_id: str) -> Optional[int]:
    personas = results.get("personas")
    if not isinstance(personas, list):
        return None

    # If persona_id is a numeric index, use it directly
    try:
        idx = int(persona_id)
        if 0 <= idx < len(personas):
            return idx
    except (ValueError, TypeError):
        pass

    pid = (persona_id or "").lower()
    for i, p in enumerate(personas):
        if not isinstance(p, dict):
            continue
        # Direct id match
        if str(p.get("id", "")).lower() == pid:
            return i
        # Slug of name match
        nm = str(p.get("name", ""))
        if slugify(nm) == pid or slugify(nm).startswith(pid):
            return i
        # Title or other fallback substring
        if pid and pid in nm.lower():
            return i
    return None


def upsert_persona_fields(results: Dict, persona_id: str, fields: Dict) -> Dict:
    if not isinstance(results.get("personas"), list):
        results["personas"] = []
    idx = find_persona_index(results, persona_id)
    if idx is None:
        # Create minimal persona if not found (prototype convenience)
        p = {"id": persona_id, "name": persona_id.title()}
        results["personas"].append(p)
        idx = len(results["personas"]) - 1
    # Update fields
    p = dict(results["personas"][idx] or {})
    p.update(fields)
    results["personas"][idx] = p
    return p

