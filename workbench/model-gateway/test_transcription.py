# SPDX-License-Identifier: AGPL-3.0-or-later
import io
import unittest
import wave

import httpx
from fastapi import HTTPException
from speech_transcription import parse_transcription_form


class TranscriptionFormTests(unittest.TestCase):
    def audio(self):
        output = io.BytesIO()
        with wave.open(output, "wb") as stream:
            stream.setnchannels(1)
            stream.setsampwidth(2)
            stream.setframerate(16000)
            stream.writeframes(b"\0\0" * 1600)
        return output.getvalue()

    def form(self, data, language="zh"):
        request = httpx.Request("POST", "http://localhost/inference", files={"file": ("input.wav", data, "audio/wav")}, data={"language": language, "response_format": "verbose_json"})
        return request.headers["content-type"], request.read()

    def test_complete_native_wav_and_language_are_preserved(self):
        audio = self.audio()
        self.assertEqual(parse_transcription_form(*self.form(audio)), (audio, "zh"))

    def test_bad_and_truncated_audio_never_reach_whisper(self):
        for audio in (b"not audio", self.audio()[:-4]):
            with self.assertRaises(HTTPException) as error:
                parse_transcription_form(*self.form(audio))
            self.assertEqual(error.exception.status_code, 400)

    def test_language_cannot_be_a_path_or_argument(self):
        with self.assertRaises(HTTPException):
            parse_transcription_form(*self.form(self.audio(), "--model=foreign"))


if __name__ == "__main__":
    unittest.main()
