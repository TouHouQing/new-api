# SPDX-License-Identifier: AGPL-3.0-or-later
"""A fixed private-interface TCP relay for a host-only model transport.

It does not resolve request URLs, authenticate users or run jobs. Bidirectional
EOF propagation preserves cancellation and bounded streaming across WSL.
"""
import argparse
import asyncio
import ipaddress


def private_address(value: str) -> str:
    address = ipaddress.ip_address(value)
    if address.version != 4 or address.is_unspecified or address.is_multicast or not (address.is_loopback or address.is_private):
        raise argparse.ArgumentTypeError("An explicit private or loopback IPv4 address is required")
    return str(address)


async def relay(reader, writer, destination, port):
    peer = None
    pending = []
    try:
        upstream, peer = await asyncio.wait_for(asyncio.open_connection(destination, port), timeout=5)

        async def copy(source, target):
            while chunk := await source.read(65536):
                target.write(chunk)
                await target.drain()

        pending = [asyncio.create_task(copy(reader, peer)), asyncio.create_task(copy(upstream, writer))]
        await asyncio.wait(pending, return_when=asyncio.FIRST_COMPLETED)
    except (OSError, TimeoutError, ConnectionError):
        pass
    finally:
        for task in pending:
            task.cancel()
        await asyncio.gather(*pending, return_exceptions=True)
        for stream in (writer, peer):
            if stream is not None:
                stream.close()
                try:
                    await stream.wait_closed()
                except (OSError, ConnectionError):
                    pass


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--listen", type=private_address, required=True)
    parser.add_argument("--port", type=int, required=True)
    parser.add_argument("--upstream", type=private_address, required=True)
    parser.add_argument("--upstream-port", type=int, required=True)
    args = parser.parse_args()
    if not 1024 <= args.port <= 65535 or not 1024 <= args.upstream_port <= 65535:
        parser.error("Ports must be between 1024 and 65535")
    server = await asyncio.start_server(lambda reader, writer: relay(reader, writer, args.upstream, args.upstream_port), args.listen, args.port)
    print(f"Private model transport relay listening on {args.listen}:{args.port}", flush=True)
    async with server:
        await server.serve_forever()


if __name__ == "__main__":
    asyncio.run(main())
