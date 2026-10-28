"""Package the standalone game using Python's standard library (no player install needed)."""

from pathlib import Path
import zipfile

root = Path(__file__).resolve().parents[1]
html = root / "dist" / "standalone" / "RoadTrip.html"
if not html.is_file():
    raise SystemExit("Run npm run build:standalone first.")

output = root / "downloads" / "RoadTrip-playable.zip"
output.parent.mkdir(exist_ok=True)
temporary = output.with_suffix(".zip.tmp")
instructions = """ROAD TRIP — THE MOUNTAIN WEEKEND

1. Extract this ZIP into a normal folder.
2. Open RoadTrip.html in a recent desktop Chrome, Edge, or Firefox browser.
3. Click 'Let's hit the road'.

You do not need Node.js, Python, npm, an account, or an internet connection to play.
Use a keyboard and mouse. WASD moves/drives, E interacts, P pauses, C takes photos.
The title screen's How to Play button has the complete field guide.

Your browser stores saves and photos locally. Keep RoadTrip.html in the same folder
to help your browser find the same save. Some browsers restrict local-file storage;
the game warns if saving is unavailable. Managed computers may block local HTML files.

If your browser or administrator blocks local files, run the source through its
documented npm development server or use an approved static web host.

All game art and sounds are generated locally. Third-party runtime license notices
are included in THIRD_PARTY_NOTICES.txt. This is the single-player Mountain Weekend
vertical slice; online co-op is not included.
"""

with zipfile.ZipFile(temporary, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    archive.write(html, "RoadTrip/RoadTrip.html")
    archive.write(root / "public" / "THIRD_PARTY_NOTICES.txt", "RoadTrip/THIRD_PARTY_NOTICES.txt")
    archive.writestr("RoadTrip/START-HERE.txt", instructions)
with zipfile.ZipFile(temporary) as archive:
    if archive.testzip() is not None:
        raise SystemExit("Archive verification failed.")
temporary.replace(output)
print(f"Created {output.relative_to(root)} ({output.stat().st_size:,} bytes).")
