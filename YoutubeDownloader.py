import yt_dlp
import boto3
import tempfile
from pathlib import Path

class YoutubeDownloader:
    def __init__(self):
        self.downloader = yt_dlp
        self.s3 = boto3.client('s3')

    def download_to_s3(self, youtube_url: str, bucket: str) -> str:
        with tempfile.TemporaryDirectory() as temp_dir:
            output_template = str(Path(temp_dir) / "%(id)s.%(ext)s")

            ydl_options = {
                "format": "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]",
                "merge_output_format": "mp4",
                "outtmpl": output_template,
                "noplaylist": True,
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