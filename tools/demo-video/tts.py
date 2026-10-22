"""Step 1: turn every narration line in storyboard-<cut>.json into a voice clip (build/audio-<cut>/<id>.mp3)
and record each clip's length in build/audio-<cut>/durations.json. Usage: python tts.py platform (or fs). Uses Microsoft's free neural voices (edge-tts)."""
import asyncio, json, pathlib, subprocess
import edge_tts

ROOT = pathlib.Path(__file__).parent
import sys
CUT = sys.argv[1] if len(sys.argv) > 1 else ""  # "platform" or "fs": reads storyboard-<cut>.json
OUT = ROOT / "build" / ("audio-" + CUT if CUT else "audio")
BOARD = ROOT / ("storyboard-" + CUT + ".json" if CUT else "storyboard.json")
FFPROBE = subprocess.check_output(["node", "-p", "require('ffprobe-static').path"], cwd=ROOT, text=True).strip()


def duration(path):
    out = subprocess.check_output([FFPROBE, "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)], text=True)
    return float(out.strip())


async def main():
    board = json.loads(BOARD.read_text(encoding="utf-8"))
    OUT.mkdir(parents=True, exist_ok=True)
    durations = {}
    for beat in board["beats"]:
        mp3 = OUT / f"{beat['id']}.mp3"
        await edge_tts.Communicate(beat["say"], board["voice"], rate=board["rate"]).save(str(mp3))
        durations[beat["id"]] = round(duration(mp3), 3)
        print(f"{beat['id']:8s} {durations[beat['id']]:6.2f}s")
    (OUT / "durations.json").write_text(json.dumps(durations, indent=1))
    print(f"total narration {sum(durations.values()):.1f}s")


asyncio.run(main())
