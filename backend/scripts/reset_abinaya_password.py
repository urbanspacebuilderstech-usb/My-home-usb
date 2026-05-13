"""Reset Mrs.Abinaya client password to a known value (one-time use)."""
import asyncio
import os
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402
from passlib.context import CryptContext  # noqa: E402
from dotenv import load_dotenv  # noqa: E402

load_dotenv(BACKEND_DIR / ".env")
pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")


async def main() -> None:
    cli = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = cli[os.environ["DB_NAME"]]
    new_hash = pwd_ctx.hash("Abinaya@2026")
    res = await db.users.update_one(
        {"user_id": "u_eb3bcc0a"},
        {"$set": {"password_hash": new_hash, "password": new_hash}},
    )
    print(f"Updated rows: {res.modified_count}")
    cli.close()


if __name__ == "__main__":
    asyncio.run(main())
