"""
One-shot migration script: copy ALL collections from MongoDB Atlas → local MongoDB.

Run this ON THE HOSTINGER VPS (not from preview env) so the local MongoDB is the
target. Source = old Atlas URL, Target = local Mongo URL.

Usage:
    cd /var/www/myhomeusb/backend   # or wherever backend lives
    source venv/bin/activate
    python scripts/migrate_atlas_to_local.py \
        --source "mongodb+srv://USER:PASS@cluster0.xxx.mongodb.net" \
        --target "mongodb://localhost:27017" \
        --db construction_crm \
        --batch 500

After it finishes:
    1. Update backend/.env  →  MONGO_URL=mongodb://localhost:27017
    2. pm2 restart all --update-env
    3. Verify the app at https://www.myhomeusb.com works as expected
    4. Keep Atlas read-only as backup for ~1 week before tearing down

Idempotent: re-running deletes & re-copies every collection, so safe to retry.
"""
import argparse
import asyncio
import sys

from motor.motor_asyncio import AsyncIOMotorClient


async def migrate(source_url: str, target_url: str, db_name: str, batch_size: int):
    src = AsyncIOMotorClient(source_url, serverSelectionTimeoutMS=15000)
    dst = AsyncIOMotorClient(target_url, serverSelectionTimeoutMS=5000)

    # Sanity ping
    await src.admin.command("ping")
    await dst.admin.command("ping")
    print(f"✓ Connected to source: {source_url[:50]}...")
    print(f"✓ Connected to target: {target_url}")

    src_db = src[db_name]
    dst_db = dst[db_name]

    collections = await src_db.list_collection_names()
    collections = [c for c in collections if not c.startswith("system.")]
    print(f"\n✓ Found {len(collections)} collections to migrate:")
    print(f"  {', '.join(collections)}\n")

    total_docs = 0
    for coll_name in collections:
        src_coll = src_db[coll_name]
        dst_coll = dst_db[coll_name]

        total = await src_coll.count_documents({})
        print(f"  • {coll_name}: {total:,} docs", end="", flush=True)

        # Wipe destination collection first (idempotent re-runs)
        await dst_coll.delete_many({})

        if total == 0:
            print(" — done (empty)")
            continue

        copied = 0
        batch = []
        cursor = src_coll.find({}, no_cursor_timeout=True)
        try:
            async for doc in cursor:
                batch.append(doc)
                if len(batch) >= batch_size:
                    await dst_coll.insert_many(batch, ordered=False)
                    copied += len(batch)
                    batch = []
                    print(f"\r  • {coll_name}: copied {copied:,}/{total:,}", end="", flush=True)
            if batch:
                await dst_coll.insert_many(batch, ordered=False)
                copied += len(batch)
        finally:
            await cursor.close()

        print(f"\r  • {coll_name}: copied {copied:,}/{total:,} ✓")
        total_docs += copied

    print(f"\n✓ Migration complete. {total_docs:,} documents copied across {len(collections)} collections.")
    print("\nNEXT STEPS:")
    print("  1. Edit backend/.env  →  MONGO_URL=mongodb://localhost:27017")
    print("  2. pm2 restart all --update-env")
    print("  3. Verify site at https://www.myhomeusb.com")
    print("  4. Keep Atlas read-only for ~1 week as backup before tearing down.")


def main():
    p = argparse.ArgumentParser(description="Copy MongoDB Atlas → local MongoDB")
    p.add_argument("--source", required=True, help="Atlas mongodb+srv:// URL")
    p.add_argument("--target", default="mongodb://localhost:27017", help="Local Mongo URL")
    p.add_argument("--db", default="construction_crm", help="Database name")
    p.add_argument("--batch", type=int, default=500, help="Insert batch size")
    args = p.parse_args()

    try:
        asyncio.run(migrate(args.source, args.target, args.db, args.batch))
    except KeyboardInterrupt:
        print("\n✗ Aborted by user.")
        sys.exit(1)
    except Exception as e:
        print(f"\n✗ Migration failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
