#!/usr/bin/env python3
"""Prepare verified model receipts on new local ports without starting services."""
import argparse
import json
from pathlib import Path

from production_transport_backup import stage_transport_restore


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--backup", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--gateway-port-start", type=int, required=True)
    parser.add_argument("--windows-relay-port-start", type=int, required=True)
    parser.add_argument("--docker-relay-port-start", type=int, required=True)
    args = parser.parse_args()
    result = stage_transport_restore(args.backup, args.output, (args.gateway_port_start, args.windows_relay_port_start, args.docker_relay_port_start))
    print(json.dumps({"accepted": result["accepted"], "transports": len(result["staged"]), "modelInferenceCalls": 0, "liveServicesChanged": False}))


if __name__ == "__main__":
    main()
