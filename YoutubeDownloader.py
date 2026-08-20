import yt_dlp
import boto3
import tempfile
import os
from pathlib import Path


class YoutubeDownloader:
    def __init__(self):
        self.downloader = yt_dlp
        access_key_id = os.getenv("AWS_ACCESS_KEY_ID") or os.getenv("AWS_ACCESS_KEY")
        secret_access_key = os.getenv("AWS_SECRET_ACCESS_KEY")
        session_token = os.getenv("AWS_SESSION_TOKEN")

        if access_key_id and secret_access_key:
            client_options = {
                "aws_access_key_id": access_key_id,
                "aws_secret_access_key": secret_access_key,
            }
            if session_token:
                client_options["aws_session_token"] = session_token
            self.s3 = boto3.client("s3", **client_options)
        else:
            self.s3 = boto3.client("s3")

    def download_to_s3(self, youtube_url: str, bucket: str) -> str:
        with tempfile.TemporaryDirectory() as temp_dir:
            output_template = str(Path(temp_dir) / "%(id)s.%(ext)s")

            ydl_options = {
                "format": "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]",
                "merge_output_format": "mp4",
                "outtmpl": output_template,
                "noplaylist": True,
                "extractor_args": {
                    "youtube": {
                        "player_client": ["web_embedded"],
                    },
                },
                "remote_components": ["ejs:github"],
            }

            with yt_dlp.YoutubeDL(ydl_options) as ydl:
                info = ydl.extract_info(youtube_url, download=True)

            video_id = info["id"]
            local_path = Path(temp_dir) / f"{video_id}.mp4"

            if not local_path.exists():
                raise FileNotFoundError(
                    f"Expected merged MP4 was not created: {local_path}"
                )

            s3_key = f"{video_id}.mp4"

            self.s3.upload_file(
                str(local_path),
                bucket,
                s3_key,
                ExtraArgs={"ContentType": "video/mp4"},
            )

        return s3_key
