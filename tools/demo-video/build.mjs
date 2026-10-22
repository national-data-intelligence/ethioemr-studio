// Step 3: turn the raw recording into the final video.
//  - fast-forwards every "AI is thinking" stretch down to FF_SECONDS
//  - places each narration clip where its scene starts on the new (shortened) timeline
//  - writes English subtitles (.srt) and burns them into the picture
// Usage: node build.mjs <cut>, with cut 'platform' or 'fs'. Output: out/<name>.mp4 and out/<name>.srt, where <name>
// is the storyboard's "output" (ethioemr-platform-demo, form-studio-guide).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import ffmpeg from 'ffmpeg-static';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const BUILD = path.join(ROOT, 'build');
const OUT = path.join(ROOT, 'out');
const CUT = process.argv[2] || ''; // 'platform' or 'fs': reads storyboard-<cut>.json
const FF_SECONDS = 3;

const board = JSON.parse(fs.readFileSync(path.join(ROOT, CUT ? `storyboard-${CUT}.json` : 'storyboard.json'), 'utf8'));
// A storyboard with "output" (fs, platform) has its own recording files (marks-<cut>.json, raw-<cut>.webm) and name;
// older storyboards without "output" use the shared marks.json and raw.webm.
const OWN = Boolean(board.output);
const NAME = OWN ? board.output : CUT ? `ethioemr-ai-assistant-demo-${CUT}` : 'ethioemr-ai-assistant-demo';
const durations = JSON.parse(fs.readFileSync(path.join(BUILD, CUT ? `audio-${CUT}` : 'audio', 'durations.json'), 'utf8'));
const marks = JSON.parse(fs.readFileSync(path.join(BUILD, OWN ? `marks-${CUT}.json` : 'marks.json'), 'utf8'));
fs.mkdirSync(OUT, { recursive: true });

// 1. Segments of the raw video: normal speed, or fast-forward.
const segs = []; let cur = 0;
const special = [...marks.ff.map((f) => ({ ...f, kind: 'ff' })), ...(marks.cuts || []).map((c) => ({ ...c, kind: 'cut' }))].sort((a, b) => a.t0 - b.t0);
for (const f of special) {
  if (f.t0 > cur) segs.push({ a: cur, b: f.t0, speed: 1 });
  if (f.kind === 'ff') segs.push({ a: f.t0, b: f.t1, speed: (f.t1 - f.t0) / FF_SECONDS });
  else segs.push({ a: f.t0, b: f.t1, cut: true }); // jump cut: dropped from the video
  cur = f.t1;
}
segs.push({ a: cur, b: marks.end, speed: 1 });

// Map a time in the raw recording to the edited timeline.
const map = (t) => {
  let out = 0;
  for (const s of segs) {
    const len = (x) => (s.cut ? 0 : x / s.speed);
    if (t >= s.b) out += len(s.b - s.a);
    else { if (t > s.a) out += len(t - s.a); break; }
  }
  return out;
};
const total = map(marks.end);

// 2. Subtitles: split each line into short cues timed in proportion to their length.
const say = Object.fromEntries(board.beats.map((b) => [b.id, b.say]));
const fmt = (t) => {
  const ms = Math.round(t * 1000), h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`;
};
function chunks(text, max = 84) { // at most about 2 lines of 42 characters per cue
  // split at sentence ends only when followed by a space (keeps "Qwen 2.5" whole)
  const parts = text.split(/(?<=[.!?:])\s+/).map((s) => s.trim()).filter(Boolean);
  const out = [];
  for (const p of parts) {
    if (p.length <= max) { out.push(p); continue; }
    const words = p.split(' '); let line = '';
    for (const w of words) { if ((line + ' ' + w).trim().length > max) { out.push(line.trim()); line = ''; } line += ' ' + w; }
    if (line.trim()) out.push(line.trim());
  }
  return out;
}
const wrap = (s, n = 46) => { if (s.length <= n) return s; const i = s.lastIndexOf(' ', Math.ceil(s.length / 2) + 6); return s.slice(0, i) + '\n' + s.slice(i + 1); };
let srt = '', n = 1;
for (const b of marks.beats) {
  const start = map(b.t), dur = durations[b.id], cs = chunks(say[b.id]);
  const totalChars = cs.reduce((s, c) => s + c.length, 0); let t = start;
  for (const c of cs) {
    const d = dur * c.length / totalChars;
    srt += `${n++}\n${fmt(t)} --> ${fmt(t + d)}\n${wrap(c)}\n\n`; t += d;
  }
}
fs.writeFileSync(path.join(OUT, NAME + '.srt'), srt);

// 3. ffmpeg: cut and speed up the video, burn subtitles, mix narration clips at their start times.
const played = segs.filter((s) => !s.cut && s.b - s.a > 0.04);
const vf = played.map((s, i) =>
  `[0:v]trim=start=${s.a.toFixed(3)}:end=${s.b.toFixed(3)},setpts=(PTS-STARTPTS)/${s.speed.toFixed(4)},fps=30[v${i}]`);
// No cut: centred. With a cut: bottom left, clear of the assistant panel on the right (subtitle units: 384 x 288 canvas).
const style = CUT
  ? "FontName=Arial,FontSize=12,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BackColour=&HA0000000,BorderStyle=4,Outline=1,Shadow=0,Alignment=1,MarginL=16,MarginR=125,MarginV=14"
  : "FontName=Arial,FontSize=15,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BackColour=&HA0000000,BorderStyle=4,Outline=1,Shadow=0,MarginV=28";
vf.push(`${played.map((_, i) => `[v${i}]`).join('')}concat=n=${played.length}:v=1:a=0,scale=1920:1080:flags=lanczos,subtitles=${NAME}.srt:force_style='${style}'[vout]`);
const audioInputs = []; const af = [];
marks.beats.forEach((b, i) => {
  audioInputs.push('-i', path.join(BUILD, CUT ? `audio-${CUT}` : 'audio', b.id + '.mp3'));
  const ms = Math.round(map(b.t) * 1000);
  af.push(`[${i + 1}:a]adelay=${ms}|${ms},aformat=channel_layouts=stereo[a${i}]`);
});
// Sound effects (platform demo: the recorded consultation, heard while the microphone "listens").
(marks.sfx || []).forEach((s, j) => {
  const i = marks.beats.length + j;
  audioInputs.push('-i', s.file);
  const ms = Math.round(map(s.t) * 1000);
  af.push(`[${i + 1}:a]adelay=${ms}|${ms},aformat=channel_layouts=stereo,volume=1.1[a${i}]`);
});
const nAudio = marks.beats.length + (marks.sfx || []).length;
af.push(`${Array.from({ length: nAudio }, (_, i) => `[a${i}]`).join('')}amix=inputs=${nAudio}:normalize=0,atrim=0:${total.toFixed(3)}[aout]`);

const outFile = NAME + '.mp4';
execFileSync(ffmpeg, [
  '-y', '-hide_banner', '-loglevel', 'error', '-i', path.join(BUILD, OWN ? `raw-${CUT}.webm` : 'raw.webm'), ...audioInputs,
  '-filter_complex', [...vf, ...af].join(';'), '-map', '[vout]', '-map', '[aout]',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k',
  '-movflags', '+faststart', outFile,
], { cwd: OUT, stdio: 'inherit' }); // cwd = out/ so the subtitles filter can use a plain relative filename

const mm = Math.floor(total / 60), ss = Math.round(total % 60);
console.log(`built out/${outFile}  (${mm}:${String(ss).padStart(2, '0')}, ${played.length} segments, ${marks.ff.length} fast-forwarded, ${(marks.cuts || []).length} jump cuts)`);
