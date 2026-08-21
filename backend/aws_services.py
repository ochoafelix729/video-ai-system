from __future__ import annotations

import json
from typing import Any
from uuid import UUID

import boto3


class ObjectStorage:
    def __init__(self, bucket_name: str, region_name: str) -> None:
        if not bucket_name:
            raise ValueError("S3_BUCKET_NAME is required")
        self.bucket_name = bucket_name
        self._client = boto3.client("s3", region_name=region_name)

    def create_audio_upload(
        self,
        *,
        key: str,
        content_type: str,
        expires_in_seconds: int = 900,
    ) -> str:
        url = self._client.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": self.bucket_name,
                "Key": key,
                "ContentType": content_type,
                "ServerSideEncryption": "aws:kms",
            },
            ExpiresIn=expires_in_seconds,
        )
        return url

    def create_read_url(self, key: str, expires_in_seconds: int = 900) -> str:
        return self._client.generate_presigned_url(
            "get_object",
            Params={"Bucket": self.bucket_name, "Key": key},
            ExpiresIn=expires_in_seconds,
        )

    def put_frame(
        self,
        *,
        user_id: str,
        resource_id: UUID,
        evidence_id: UUID,
        image_bytes: bytes,
        mime_type: str,
    ) -> str:
        extension = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}[mime_type]
        key = f"frames/{user_id}/{resource_id}/{evidence_id}.{extension}"
        self._client.put_object(
            Bucket=self.bucket_name,
            Key=key,
            Body=image_bytes,
            ContentType=mime_type,
            ServerSideEncryption="aws:kms",
        )
        return key

    def delete(self, key: str) -> None:
        self._client.delete_object(Bucket=self.bucket_name, Key=key)

    def delete_many(self, keys: list[str]) -> None:
        if not keys:
            return
        for offset in range(0, len(keys), 1000):
            batch = keys[offset : offset + 1000]
            self._client.delete_objects(
                Bucket=self.bucket_name,
                Delete={"Objects": [{"Key": key} for key in batch], "Quiet": True},
            )


class JobQueue:
    def __init__(self, queue_url: str, region_name: str) -> None:
        if not queue_url:
            raise ValueError("SQS_QUEUE_URL is required")
        self.queue_url = queue_url
        self._client = boto3.client("sqs", region_name=region_name)

    def enqueue_transcription(self, chunk_id: UUID) -> None:
        self._client.send_message(
            QueueUrl=self.queue_url,
            MessageBody=json.dumps({"type": "transcribe_chunk", "chunk_id": str(chunk_id)}),
        )

    def receive(self, wait_time_seconds: int = 20) -> list[dict[str, Any]]:
        response = self._client.receive_message(
            QueueUrl=self.queue_url,
            MaxNumberOfMessages=5,
            WaitTimeSeconds=wait_time_seconds,
            VisibilityTimeout=300,
        )
        return response.get("Messages", [])

    def acknowledge(self, receipt_handle: str) -> None:
        self._client.delete_message(QueueUrl=self.queue_url, ReceiptHandle=receipt_handle)
