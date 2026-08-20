import os

from dotenv import load_dotenv

from YoutubeDownloader import YoutubeDownloader


def main():
    load_dotenv()

    bucket = os.getenv("S3_BUCKET_NAME")
    if not bucket:
        raise RuntimeError("S3_BUCKET_NAME must be set in the environment or .env file")

    downloader = YoutubeDownloader()
    key = downloader.download_to_s3(
        "https://www.youtube.com/watch?v=xo5V9g9joFs",
        bucket,
    )
    print(key)

if __name__ == "__main__":
    main()
