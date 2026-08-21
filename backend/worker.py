from __future__ import annotations

import asyncio
import json
import logging
from uuid import UUID

from backend.aws_services import JobQueue, ObjectStorage
from backend.config import get_settings
from backend.database import Repository
from backend.providers import AssemblyAiProvider, GeminiProvider
from backend.segmenter import map_words_to_source_time, segment_words


logger = logging.getLogger(__name__)


class TranscriptionWorker:
    def __init__(
        self,
        repository: Repository,
        storage: ObjectStorage,
        queue: JobQueue,
        speech_provider: AssemblyAiProvider,
        gemini: GeminiProvider,
    ) -> None:
        self._repository = repository
        self._storage = storage
        self._queue = queue
        self._speech_provider = speech_provider
        self._gemini = gemini

    async def process_chunk(self, chunk_id: UUID) -> None:
        chunk = self._repository.get_chunk_for_processing(chunk_id)
        if chunk is None or chunk["status"] == "processed":
            return
        try:
            audio_url = self._storage.create_read_url(chunk["s3_key"])
            context = chunk["context"]
            title = context.get("title", "Educational video")
            transcription = await self._speech_provider.transcribe(audio_url, title)
            source_words = map_words_to_source_time(
                transcription.words, float(chunk["source_start_seconds"])
            )
            segments = segment_words(source_words)
            serialized_segments = []
            for segment in segments:
                serialized_segments.append(
                    {
                        "start_seconds": segment.start_seconds,
                        "end_seconds": segment.end_seconds,
                        "text": segment.text,
                        "confidence": segment.confidence,
                        "embedding": self._gemini.embed_document(segment.text, title),
                    }
                )
            self._repository.save_transcript_segments(
                chunk,
                serialized_segments,
                transcription.provider_model,
                transcription.language,
            )
        except Exception as error:
            logger.exception("Unable to process capture chunk %s", chunk_id)
            self._repository.mark_chunk_failed(chunk_id, str(error))
            raise
        finally:
            self._storage.delete(chunk["s3_key"])

    async def run_forever(self) -> None:
        while True:
            messages = await asyncio.to_thread(self._queue.receive)
            for message in messages:
                try:
                    body = json.loads(message["Body"])
                    if body.get("type") != "transcribe_chunk":
                        raise ValueError("Unsupported worker message")
                    await self.process_chunk(UUID(body["chunk_id"]))
                except Exception:
                    logger.exception("Worker message failed")
                    continue
                self._queue.acknowledge(message["ReceiptHandle"])


def build_worker() -> TranscriptionWorker:
    settings = get_settings()
    return TranscriptionWorker(
        Repository(settings.database_url, settings.evidence_retention_days),
        ObjectStorage(settings.s3_bucket_name, settings.aws_default_region),
        JobQueue(settings.sqs_queue_url, settings.aws_default_region),
        AssemblyAiProvider(settings.assemblyai_api_key),
        GeminiProvider(settings.gemini_api_key),
    )


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(build_worker().run_forever())
