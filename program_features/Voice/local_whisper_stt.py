import sys
import os
import traceback

# 1. Force UTF-8 encoding for console output (Windows fix)
sys.stdout.reconfigure(encoding='utf-8')

# Helper to print logs to stderr so they don't get mixed with the final result
def log(msg):
    sys.stderr.write(f"[Python-Whisper] {msg}\n")
    sys.stderr.flush()

def main():
    if len(sys.argv) < 2:
        log("Usage: python local_whisper_stt.py <audio_file_path>")
        sys.exit(1)

    audio_path = sys.argv[1]

    if not os.path.exists(audio_path):
        log(f"Error: Audio file not found at {audio_path}")
        sys.exit(1)

    log("Importing faster_whisper...")
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        log("CRITICAL ERROR: 'faster_whisper' module not installed.")
        sys.exit(1)
    except Exception as e:
        log(f"Error importing faster_whisper: {e}")
        traceback.print_exc()
        sys.exit(1)

    try:
        log("Loading Model (base.en) on CPU...")
        model = WhisperModel("base.en", device="cpu", compute_type="int8")

        log(f"Transcribing {audio_path}...")
        segments, info = model.transcribe(audio_path, beam_size=5)

        full_text = []
        for segment in segments:
            full_text.append(segment.text)

        result = " ".join(full_text).strip()
        
        # ONLY print the final text to stdout
        print(result)

    except Exception as e:
        log(f"TRANSCRIPTION FAILED: {str(e)}")
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()
