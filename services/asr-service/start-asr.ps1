# Start the local speech-to-text service the EMR's "Speak" button calls (http://localhost:8767).
# Leave this window open while you use Speak. Stop it with Ctrl+C.
#   .\start-asr.ps1                    # Amharic speech to Amharic text, with English (medical) words kept in English
#   .\start-asr.ps1 -SaveRecordings    # also save every recording and what each engine heard, in .\recordings
#                                      # (to build a test set; use synthetic test dictations only, never real patients)
#   .\start-asr.ps1 -AmharicMode transcribe   # Amharic engine only (no English merge)
param([string]$EnglishModel = "mobiuslabsgmbh/faster-whisper-large-v3-turbo", [string]$ConfirmModel = "small", [string]$AmharicMode = "mixed", [switch]$SaveRecordings)
Set-Location $PSScriptRoot
if (-not (Test-Path .venv)) {
  python -m venv .venv
  .\.venv\Scripts\python -m pip install faster-whisper fastapi "uvicorn[standard]" python-multipart soundfile "av<15" torch transformers rapidfuzz
}
$env:ASR_MODEL = $EnglishModel
$env:ASR_CONFIRM_MODEL = $ConfirmModel
$env:ASR_AM_MODE = $AmharicMode
if ($SaveRecordings) { $env:ASR_SAVE_DIR = Join-Path $PSScriptRoot "recordings" } else { Remove-Item Env:ASR_SAVE_DIR -ErrorAction SilentlyContinue }
Write-Host "Starting asr-service on http://localhost:8767 (English: $EnglishModel confirmed by $ConfirmModel, Amharic mode: $AmharicMode, saving: $SaveRecordings)."
.\.venv\Scripts\python server.py
