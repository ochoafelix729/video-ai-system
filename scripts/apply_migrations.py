from backend.config import get_settings
from backend.database import Repository


def main() -> None:
    settings = get_settings()
    Repository(settings.database_url, settings.evidence_retention_days).apply_migrations()


if __name__ == "__main__":
    main()
