from YoutubeDownloader import YoutubeDownloader

def main():
    downloader = YoutubeDownloader()
    key = downloader.download_to_s3(
        "https://www.youtube.com/watch?v=xo5V9g9joFs",
        "youtube-videos-470879244167-us-east-2-an"
    )
    print(key)

if __name__ == "__main__":
    main()