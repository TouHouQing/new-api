#!/usr/bin/env python3
"""Consistent local production backup; optional isolated PostgreSQL/file restore.

Run on the Docker host. Credentials stay in the private Compose env file and
container environment. Restore verification never writes to the live database.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import tarfile
import uuid

from production_transport_backup import configured_transports, snapshot_transports, transport_inventory
from production_analysis_backup import configured_analysis, analysis_inventory, native_key_digest, snapshot_analysis, verify_analysis_archive


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def checked_archive(path: Path) -> dict[str, str]:
    files = {}
    with tarfile.open(path, "r:") as archive:
        for item in archive:
            name = PurePosixPath(item.name)
            if name.is_absolute() or ".." in name.parts or "\\" in item.name or not (item.isfile() or item.isdir()):
                raise RuntimeError("Backup contains an unsafe path or special file")
            if item.isfile():
                key = str(name)
                if key in files:
                    raise RuntimeError("Backup contains duplicate paths")
                stream = archive.extractfile(item)
                if stream is None:
                    raise RuntimeError("Backup file cannot be read")
                digest = hashlib.sha256()
                for block in iter(lambda: stream.read(1024 * 1024), b""):
                    digest.update(block)
                files[key] = digest.hexdigest()
    return files


def check_host_reserve(path: Path | None, minimum_mib: int) -> None:
    if path is not None and shutil.disk_usage(path.resolve(strict=True)).free < minimum_mib * 1024 * 1024:
        raise RuntimeError("Insufficient host storage reserve; backup utility and writers were not started or stopped")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env-file", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True, help="New private backup directory")
    parser.add_argument("--project-name", default="yingce-platform-production")
    parser.add_argument("--verify-restore", action="store_true")
    parser.add_argument("--utility-image", default="", help="Existing local image containing tar; never pulled")
    default_host = Path("/mnt/c") if os.environ.get("WSL_DISTRO_NAME") and Path("/mnt/c").is_dir() else None
    parser.add_argument("--host-storage-path", type=Path, default=default_host, help="Host filesystem carrying the Docker virtual disk; WSL defaults to /mnt/c")
    parser.add_argument("--minimum-host-free-mib", type=int, default=2048)
    parser.add_argument("--native-only", action="store_true", help="Explicitly exclude configured local model transports from this backup")
    args = parser.parse_args()
    if not re.fullmatch(r"[a-z0-9][a-z0-9_-]{0,62}", args.project_name):
        parser.error("Invalid Compose project name")
    if not 256 <= args.minimum_host_free_mib <= 131072:
        parser.error("Host storage reserve must be between 256 and 131072 MiB")
    env_file = args.env_file.resolve(strict=True)
    destination = args.output.resolve()
    destination.mkdir(mode=0o700, parents=False, exist_ok=False)
    os.chmod(destination, 0o700)
    check_host_reserve(args.host_storage_path, args.minimum_host_free_mib)
    transports = [] if args.native_only else configured_transports(env_file.parent)
    analysis = None if args.native_only else configured_analysis(env_file.parent)
    transport_bytes = sum(value["bytes"] for value in transport_inventory(transports).values())
    transport_bytes += sum(value["bytes"] for value in analysis_inventory(analysis).values())
    root = Path(__file__).resolve().parent.parent
    compose = ["docker", "compose", "--project-name", args.project_name, "--env-file", str(env_file)]
    for name in ("docker-compose.deploy.yml", "docker-compose.build.yml", "docker-compose.production-local.yml"):
        compose += ["-f", str(root / name)]
    resumed = False

    def run(command: list[str], label: str, *, data: bytes | None = None, output=None) -> bytes:
        result = subprocess.run(command, input=data, stdout=output or subprocess.PIPE, stderr=subprocess.PIPE, cwd=root, timeout=300)
        if result.returncode:
            (destination / "failure.log").write_bytes(result.stderr)
            raise RuntimeError(f"{label} failed; private diagnostics retained")
        return result.stdout or b""

    def sql(query: str, database: str | None = None) -> bytes:
        command = 'exec psql -X -v ON_ERROR_STOP=1 -At --username="$POSTGRES_USER" --dbname="${1:-$POSTGRES_DB}"'
        return run(compose + ["exec", "-T", "postgres", "sh", "-c", command, "backup-sql", database or ""], "Database verification", data=query.encode())

    def counts(database: str | None = None) -> dict[str, int]:
        query = "SELECT format('SELECT %L, count(*) FROM public.%I', tablename, tablename) FROM pg_tables WHERE schemaname='public' ORDER BY tablename\n\\gexec\n"
        return {line.split("|")[0]: int(line.split("|")[1]) for line in sql(query, database).decode().splitlines() if line}

    run(compose + ["config", "--quiet"], "Compose validation")
    backend_id = run(compose + ["ps", "--status", "running", "-q", "backend"], "Backend discovery").decode().strip()
    agent_id = run(compose + ["ps", "--status", "running", "-q", "yingce-agent"], "Agent discovery").decode().strip()
    if not backend_id or not agent_id:
        raise RuntimeError("Backup requires the existing backend and Agent to be running")
    def image_for(container: str) -> str:
        # With Docker's containerd image store, .Image is a config digest;
        # launching by that digest can fail even while the container runs.
        # Keep the actual manifest identity, with the classic-store fallback.
        info = json.loads(run(["docker", "inspect", container], "Image discovery"))[0]
        return info.get("ImageManifestDescriptor", {}).get("digest") or info["Image"]

    image = image_for(backend_id)
    backend_info = json.loads(run(["docker", "inspect", backend_id], "Backend runtime discovery"))[0]
    # An untagged previous runtime may remain running after its image reference
    # was replaced. Resource backup only needs tar, so use the locally available
    # current image as a read-only utility; never pull or start its application.
    utility_info = json.loads(run(["docker", "image", "inspect", args.utility_image or backend_info["Config"]["Image"]], "Backup utility discovery"))[0]
    utility_image = utility_info["Id"]
    images = {"backend": image}
    for service in ("web", "yingce-agent"):
        container = run(compose + ["ps", "--all", "-q", service], "Service discovery").decode().strip()
        if not container:
            raise RuntimeError("A production service is unavailable before backup")
        images[service] = image_for(container)
    data_kib = int(run(["docker", "exec", backend_id, "sh", "-c", "du -sk /data | cut -f1"], "Resource size check").decode().strip())
    database_bytes = int(sql("SELECT pg_database_size(current_database());\n").decode().strip())
    required = (data_kib * 1024 + database_bytes + transport_bytes) * (2 if args.verify_restore else 1) + 256 * 1024 * 1024
    if shutil.disk_usage(destination).free < required:
        raise RuntimeError("Insufficient backup storage reserve; writers were not stopped")
    check_host_reserve(args.host_storage_path, args.minimum_host_free_mib)
    utility = ["docker", "run", "--rm", "--pull", "never", "--network", "none", "--read-only"]
    run(utility + ["--entrypoint", "tar", utility_image, "--help"], "Backup utility validation")
    try:
        # Every writer is drained before the database and resource tree are read.
        # Keep restart in finally, including failed dumps and storage exhaustion.
        resumed = True
        run(compose + ["stop", "--timeout", "60", "backend", "yingce-agent"], "Writer drain")
        manifest = {"version": 1, "project": args.project_name, "images": images, "backupUtilityImageID": utility_image, "runtimeImagesIncluded": False, "tables": counts(), "privateEnvironmentFileIncluded": False, "redisCoordinationCacheIncluded": False}
        with (destination / "database.dump").open("xb") as output:
            run(compose + ["exec", "-T", "postgres", "sh", "-c", 'exec pg_dump --format=custom --username="$POSTGRES_USER" --dbname="$POSTGRES_DB"'], "Database backup", output=output)
        with (destination / "backend-data.tar").open("xb") as output:
            run(utility + ["--volumes-from", backend_id + ":ro", "--entrypoint", "tar", utility_image, "-C", "/data", "--exclude=./tmp", "--exclude=./plugins/runtime", "-cf", "-", "."], "Resource backup", output=output)
        manifest["archives"] = {name: sha256(destination / name) for name in ("database.dump", "backend-data.tar")}
        manifest["files"] = checked_archive(destination / "backend-data.tar")
        if ".settings-key" not in manifest["files"]:
            raise RuntimeError("The encryption key is missing from the backup")
        manifest["modelTransportsIncluded"] = bool(transports)
        if transports:
            archive = destination / "model-transports.tar"
            manifest["modelTransports"] = snapshot_transports(transports, archive)
            if checked_archive(archive) != manifest["modelTransports"]["files"]:
                raise RuntimeError("Archived local transport bytes changed during snapshot; backup not accepted")
            manifest["archives"]["model-transports.tar"] = sha256(archive)
        manifest["localAnalysisIncluded"] = analysis is not None
        if analysis is not None:
            environment = json.loads(run(["docker", "inspect", backend_id], "Analysis signing-key binding"))[0]["Config"]["Env"]
            archive = destination / "local-analysis.tar"
            manifest["localAnalysis"] = snapshot_analysis(analysis, archive, native_key_digest(manifest["files"], environment))
            verify_analysis_archive(archive, manifest["localAnalysis"])
            manifest["archives"]["local-analysis.tar"] = sha256(archive)
        (destination / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    finally:
        if resumed:
            # Resume the exact writers that were running before this backup.
            # Compose start can refuse when its completed migration container
            # has been removed, even though no new migration is needed.
            run(["docker", "start", agent_id, backend_id], "Writer restart")

    if args.verify_restore:
        database = "yingce_restore_check_" + uuid.uuid4().hex[:12]
        sql('CREATE DATABASE "' + database + '";')
        with (destination / "database.dump").open("rb") as stream:
            result = subprocess.run(compose + ["exec", "-T", "postgres", "sh", "-c", 'exec pg_restore --exit-on-error --no-owner --no-privileges --username="$POSTGRES_USER" --dbname="$1"', "restore-check", database], stdin=stream, stdout=subprocess.PIPE, stderr=subprocess.PIPE, cwd=root, timeout=300)
        if result.returncode:
            (destination / "restore-failure.log").write_bytes(result.stderr)
            raise RuntimeError("Isolated database restore failed; live database unchanged")
        restored_counts = counts(database)
        if restored_counts != manifest["tables"]:
            raise RuntimeError("Isolated database row counts differ")
        target = destination / "restored-backend-data"
        target.mkdir(mode=0o700)
        # Paths, duplicate names and special files were checked before extracting
        # into a new private directory that has never held application data.
        with tarfile.open(destination / "backend-data.tar", "r:") as archive:
            archive.extractall(target, numeric_owner=True)
        actual = {str(path.relative_to(target).as_posix()): sha256(path) for path in target.rglob("*") if path.is_file()}
        if actual != manifest["files"]:
            raise RuntimeError("Restored resource bytes differ")
        receipt = {"database": database, "tableCount": len(restored_counts), "rowCount": sum(restored_counts.values()), "files": len(actual), "fileSHA256Verified": True, "liveDatabaseUnchanged": True, "restoreAPITrial": False}
        if manifest["modelTransportsIncluded"]:
            transport_target = destination / "restored-model-transports"
            transport_target.mkdir(mode=0o700)
            with tarfile.open(destination / "model-transports.tar", "r:") as archive:
                archive.extractall(transport_target, numeric_owner=True)
            restored = {str(path.relative_to(transport_target).as_posix()): sha256(path) for path in transport_target.rglob("*") if path.is_file()}
            if restored != manifest["modelTransports"]["files"]:
                raise RuntimeError("Restored local transport bytes differ")
            receipt.update(modelTransportFiles=len(restored), modelTransportFileSHA256Verified=True, modelTransportLiveServicesOverwritten=False)
        if manifest.get("localAnalysisIncluded"):
            verify_analysis_archive(destination / "local-analysis.tar", manifest["localAnalysis"], destination / "restored-local-analysis")
            receipt.update(localAnalysisFileSHA256Verified=True, localAnalysisLiveServicesOverwritten=False)
        (destination / "restore-receipt.json").write_text(json.dumps(receipt, indent=2), encoding="utf-8")
    print(json.dumps({"backup": str(destination), "tableCount": len(manifest["tables"]), "files": len(manifest["files"]), "restoreVerified": args.verify_restore}))


if __name__ == "__main__":
    main()
