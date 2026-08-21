from __future__ import annotations

import asyncio
import base64
from dataclasses import dataclass
from typing import Protocol

import httpx
from google import genai
from google.genai import types
from pydantic import BaseModel, Field

from backend.segmenter import TranscriptWord


@dataclass(frozen=True)
class TranscriptionResult:
    words: list[TranscriptWord]
    language: str | None
    provider_model: str


class SpeechToTextProvider(Protocol):
    async def transcribe(self, audio_url: str, context_hint: str | None = None) -> TranscriptionResult: ...


class AssemblyAiProvider:
    def __init__(self, api_key: str, poll_interval_seconds: float = 3.0) -> None:
        if not api_key:
            raise ValueError("ASSEMBLYAI_API_KEY is required")
        self._api_key = api_key
        self._poll_interval_seconds = poll_interval_seconds
        self._base_url = "https://api.assemblyai.com/v2/transcript"

    async def transcribe(self, audio_url: str, context_hint: str | None = None) -> TranscriptionResult:
        headers = {"authorization": self._api_key}
        payload: dict[str, object] = {
            "audio_url": audio_url,
            "speech_models": ["universal-3-5-pro", "universal-2"],
            "language_detection": True,
        }
        if context_hint:
            payload["prompt"] = context_hint[:1000]

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(self._base_url, headers=headers, json=payload)
            response.raise_for_status()
            transcript_id = response.json()["id"]
            while True:
                poll = await client.get(f"{self._base_url}/{transcript_id}", headers=headers)
                poll.raise_for_status()
                result = poll.json()
                if result["status"] == "completed":
                    words = [
                        TranscriptWord(
                            text=word["text"],
                            start_seconds=float(word["start"]) / 1000,
                            end_seconds=float(word["end"]) / 1000,
                            confidence=float(word.get("confidence", 0)),
                        )
                        for word in result.get("words", [])
                    ]
                    return TranscriptionResult(
                        words=words,
                        language=result.get("language_code"),
                        provider_model=result.get("speech_model_used", "universal-3-5-pro"),
                    )
                if result["status"] == "error":
                    raise RuntimeError(f"AssemblyAI transcription failed: {result.get('error', 'unknown error')}")
                await asyncio.sleep(self._poll_interval_seconds)


class GeneratedCitation(BaseModel):
    evidence_id: str


class GeneratedVisualRequest(BaseModel):
    timestamps_seconds: list[float] = Field(default_factory=list, max_length=3)
    reason: str


class GeneratedTutorTurn(BaseModel):
    content: str
    citation_ids: list[str] = Field(default_factory=list)
    tutoring_action: str
    uncertainty_reason: str | None = None
    visual_request: GeneratedVisualRequest | None = None


class GeminiProvider:
    def __init__(self, api_key: str) -> None:
        if not api_key:
            raise ValueError("GEMINI_API_KEY is required")
        self._client = genai.Client(api_key=api_key)
        self._model = "gemini-2.5-flash-lite"
        self._embedding_model = "gemini-embedding-001"

    def embed_document(self, text: str, title: str) -> list[float]:
        result = self._client.models.embed_content(
            model=self._embedding_model,
            contents=text,
            config=types.EmbedContentConfig(
                task_type="RETRIEVAL_DOCUMENT",
                title=title,
                output_dimensionality=768,
            ),
        )
        return list(result.embeddings[0].values)

    def embed_documents(self, texts: list[str], title: str) -> list[list[float]]:
        if not texts:
            return []
        result = self._client.models.embed_content(
            model=self._embedding_model,
            contents=texts,
            config=types.EmbedContentConfig(
                task_type="RETRIEVAL_DOCUMENT",
                title=title,
                output_dimensionality=768,
            ),
        )
        return [list(embedding.values) for embedding in result.embeddings]

    def embed_query(self, text: str) -> list[float]:
        result = self._client.models.embed_content(
            model=self._embedding_model,
            contents=text,
            config=types.EmbedContentConfig(
                task_type="QUESTION_ANSWERING",
                output_dimensionality=768,
            ),
        )
        return list(result.embeddings[0].values)

    def generate_tutor_turn(self, prompt: str) -> GeneratedTutorTurn:
        response = self._client.models.generate_content(
            model=self._model,
            contents=prompt,
            config={
                "response_mime_type": "application/json",
                "response_schema": GeneratedTutorTurn,
                "temperature": 0.2,
                "max_output_tokens": 900,
            },
        )
        return GeneratedTutorTurn.model_validate_json(response.text)

    def describe_frame(self, image_bytes: bytes, mime_type: str, context: str) -> str:
        response = self._client.models.generate_content(
            model=self._model,
            contents=[
                types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
                (
                    "Describe only educationally relevant visible information in this frame. "
                    "Transcribe labels and equations carefully. State uncertainty. Context: "
                    f"{context}"
                ),
            ],
            config={"temperature": 0.1, "max_output_tokens": 500},
        )
        return response.text
